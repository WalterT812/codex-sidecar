import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { AccountClient } from './account/client.js';
import { discoverCodexCli, discoverWindowsApp, listDesktopProcesses, launchDesktop, verifyPortOwner, type AppInstallation } from './platform/windows.js';
import { CdpConnection, isDesktopTarget, listTargets, validateSocketUrl, type PageTarget } from './cdp.js';
import { StateStore } from './store.js';
import { handleRequest } from './bridge.js';
import { dataDirectory } from './paths.js';
import { acquireLock } from './lock.js';
import { WorkGroup } from './work-group.js';
import type { HostMessage, QuotaSnapshot } from './shared/types.js';

const exec = promisify(execFile);
export const VERSION = '0.1.0-alpha.1';
export async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback port is available.');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

export async function chooseDesktopPort(app: AppInstallation, requestedPort?: number, attachOnly = false) {
  const running = await listDesktopProcesses(app);
  if (requestedPort !== undefined && await verifyPortOwner(requestedPort, app)) return requestedPort;
  const ports = [...new Set(running.map(x => x.debugPort).filter((x): x is number => x !== null))];
  if (requestedPort === undefined && ports.length === 1 && await verifyPortOwner(ports[0]!, app)) return ports[0]!;
  if (running.length || attachOnly) {
    throw new Error('Codex is open without a verified Sidecar connection. Finish active work, exit Codex normally (including its background process), then open Codex Sidecar. Nothing was restarted.');
  }
  const port = requestedPort ?? await availablePort();
  await launchDesktop(app, port);
  for (let attempt = 0; attempt < 12; attempt++) {
    await delay(700);
    if (await verifyPortOwner(port, app)) return port;
  }
  throw new Error('Codex opened, but its debugging connection was not verified. The app was left running normally.');
}

interface MountedPage { connection: CdpConnection; contextId: number }
export async function startCompanion(options: { port?: number; attachOnly?: boolean } = {}) {
  const directory = dataDirectory();
  const lock = await acquireLock(directory);
  const pages = new Map<string, MountedPage>();
  const attempts = new Map<string, number>();
  const work = new WorkGroup();
  const intervals: ReturnType<typeof setInterval>[] = [];
  let client: AccountClient | undefined;
  let cliPath: string | undefined;
  let stopping = false;
  let pollBusy = false;
  let refreshPromise: Promise<void> | undefined;
  let quota: QuotaSnapshot = { fetchedAt: new Date(0).toISOString(), windows: [], error: 'Waiting for account usage.' };

  async function shutdown() {
    if (stopping) return;
    stopping = true;
    intervals.forEach(clearInterval);
    await work.stop();
    await Promise.allSettled([...pages.values()].map(async page => {
      try {
        await page.connection.evaluate('window.__CODEX_SIDECAR__?.destroy()', page.contextId);
        await page.connection.request('Runtime.removeBinding', { name: '__codexSidecarSend' });
      } finally { page.connection.close(); }
    }));
    pages.clear();
    try { await client?.close(); } finally {
      // Keep ownership until our stop token has been consumed. A successor must
      // never lose its request to an older instance's cleanup.
      try {
        const stopPath = join(directory, 'stop.request');
        if ((await readFile(stopPath, 'utf8')) === lock.token) await unlink(stopPath);
      } catch { /* No request belonging to this instance. */ }
      await lock.release();
    }
    console.log('Codex Sidecar stopped. The official app is still running.');
  }

  try {
    const store = await StateStore.open(join(directory, 'state.json'));
    const app = await discoverWindowsApp();
    const port = await chooseDesktopPort(app, options.port, options.attachOnly);
    const renderer = await readFile(fileURLToPath(new URL('./renderer.js', import.meta.url)), 'utf8');
    try { cliPath = await discoverCodexCli(); client = new AccountClient(cliPath); } catch { quota.error = 'Codex CLI was not found; notes and bookmarks remain available.'; }

    const send = (page: MountedPage, message: HostMessage) => page.connection.evaluate(`window.__CODEX_SIDECAR__?.receive(${JSON.stringify(message)})`, page.contextId);
    const snapshot = (): HostMessage => ({ type: 'snapshot', state: store.snapshot, quota });
    async function broadcast() { await Promise.allSettled([...pages.values()].map(page => send(page, snapshot()))); }
    async function refreshQuota() {
      if (stopping) return;
      if (refreshPromise) return refreshPromise;
      refreshPromise = work.run(async () => {
        if (!client && cliPath && !stopping) client = new AccountClient(cliPath);
        if (client && !stopping) {
          try { quota = await client.getQuota(); }
          catch {
            quota = { ...quota, error: 'Account usage is unavailable. Last successful values may be stale.' };
            await client.close(); client = undefined;
          }
        }
        await broadcast();
      }).finally(() => { refreshPromise = undefined; });
      return refreshPromise;
    }
    let lastManualRefresh = 0;

    async function mount(target: PageTarget) {
      const ensureRunning = () => { if (stopping) throw new Error('Companion is stopping.'); };
      ensureRunning();
      if (!await verifyPortOwner(port, app)) throw new Error('Desktop connection ownership changed.');
      ensureRunning();
      const connection = await CdpConnection.connect(validateSocketUrl(target.webSocketDebuggerUrl!, port));
      let installedContext: number | undefined;
      try {
        ensureRunning();
        const contexts: { id: number; auxData?: { isDefault?: boolean; frameId?: string } }[] = [];
        const onContext = (event: any) => { if (event?.context) contexts.push(event.context); };
        connection.on('Runtime.executionContextCreated', onContext);
        await connection.request('Runtime.enable');
        const frame = await connection.request('Page.getFrameTree');
        ensureRunning();
        if (!isDesktopTarget({ ...target, url: frame?.frameTree?.frame?.url ?? '' })) throw new Error('The page is no longer a supported desktop view.');
        const context = contexts.find(x => x.auxData?.isDefault && x.auxData.frameId === frame.frameTree.frame.id);
        connection.off('Runtime.executionContextCreated', onContext);
        if (!context) throw new Error('No verified main-frame JavaScript context.');
        installedContext = context.id;
        const page: MountedPage = { connection, contextId: context.id };
        await connection.request('Runtime.addBinding', { name: '__codexSidecarSend', executionContextId: context.id });
        ensureRunning();
        connection.on('Runtime.bindingCalled', async (event: any) => {
          if (!event || typeof event !== 'object' || event.name !== '__codexSidecarSend' || event.executionContextId !== context.id || stopping) return;
          try {
            await work.run(async () => {
            const result = await handleRequest(event.payload, {
              store,
              refreshQuota: async () => {
                if (Date.now() - lastManualRefresh < 5000) return;
                lastManualRefresh = Date.now(); await refreshQuota();
              },
              openLink: async url => { await exec('explorer.exe', [url], { windowsHide: true, timeout: 5000 }); },
              detach: async () => { setTimeout(() => { void shutdown(); }, 80); },
            });
            if (connection.connected) await send(page, result);
            await broadcast();
            });
          } catch { /* Disconnected pages receive a fresh snapshot if they reconnect. */ }
        });
        await connection.evaluate(`window.__CODEX_SIDECAR_BOOT__=${JSON.stringify({ version: VERSION, demo: false })};\n${renderer}`, context.id);
        ensureRunning();
        const installed = await connection.evaluate('Boolean(window.__CODEX_SIDECAR__)', context.id);
        ensureRunning();
        if (!installed) throw new Error('This desktop layout is not supported. Native UI was preserved.');
        pages.set(target.id, page);
        connection.once('disconnected', () => { if (pages.get(target.id)?.connection === connection) pages.delete(target.id); });
        await send(page, snapshot());
        ensureRunning();
        console.log(`Components attached to a desktop window (${pages.size} active).`);
      } catch (error) {
        if (installedContext !== undefined) {
          try { await connection.evaluate('window.__CODEX_SIDECAR__?.destroy()', installedContext); } catch { /* Page may have navigated away. */ }
        }
        try { await connection.request('Runtime.removeBinding', { name: '__codexSidecarSend' }); } catch { /* Socket may already be gone. */ }
        connection.close(); throw error;
      }
    }

    async function reconcile() {
      if (pollBusy || stopping) return;
      pollBusy = true;
      try {
        const targets = (await listTargets(port)).filter(isDesktopTarget);
        for (const [id, page] of pages) {
          if (!targets.some(target => target.id === id)) { page.connection.close(); pages.delete(id); continue; }
          try {
            const present = await page.connection.evaluate('Boolean(window.__CODEX_SIDECAR__)', page.contextId);
            if (!present) { page.connection.close(); pages.delete(id); }
          }
          catch { page.connection.close(); pages.delete(id); }
        }
        for (const target of targets) {
          if (pages.has(target.id) || (attempts.get(target.id) ?? 0) >= 3 || stopping) continue;
          attempts.set(target.id, (attempts.get(target.id) ?? 0) + 1);
          try { await mount(target); } catch (error) { console.warn((error as Error).message); }
        }
      } catch { /* App exit/update: wait for an explicit launch, never restart it here. */ }
      finally { pollBusy = false; }
    }
    await work.run(reconcile);
    const readyDeadline = Date.now() + 30_000;
    while (!pages.size && !stopping && Date.now() < readyDeadline) {
      await delay(1000);
      await work.run(reconcile);
    }
    if (stopping) return;
    if (!pages.size) throw new Error('No supported Codex window accepted the components. Check Sidecar compatibility; the official app was left unchanged.');
    console.log('SIDECAR_READY=1');
    void refreshQuota();
    intervals.push(setInterval(() => { void work.run(reconcile).catch(() => {}); }, 5000));
    intervals.push(setInterval(() => { void refreshQuota(); }, 60000));
    intervals.push(setInterval(async () => {
      try { if ((await readFile(join(directory, 'stop.request'), 'utf8')) === lock.token) await shutdown(); } catch { /* No stop request. */ }
    }, 1000));
    process.once('SIGINT', () => { void shutdown(); });
    process.once('SIGTERM', () => { void shutdown(); });
    console.log(`Codex Sidecar ${VERSION} · desktop ${app.packageVersion} · loopback ${port}`);
    console.log('Use codex-sidecar stop to remove the components.');
  } catch (error) { await shutdown(); throw error; }
}
