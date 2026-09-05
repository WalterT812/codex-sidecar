import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { AccountClient } from './account/client.js';
import { discoverCodexCli, discoverWindowsApp, listDesktopProcesses, launchDesktop, verifyPortOwner, getVerifiedDesktopOwner, type AppInstallation } from './platform/windows.js';
import { CdpConnection, isDesktopTarget, listTargets, validateSocketUrl, type PageTarget } from './cdp.js';
import { StateStore } from './store.js';
import { handleRequest } from './bridge.js';
import { dataDirectory } from './paths.js';
import { acquireLock, LockBusyError } from './lock.js';
import { InstanceOwnerChangedError, startInstanceServer, waitForInstance } from './instance.js';
import { WorkGroup } from './work-group.js';
import type { HostMessage, QuotaSnapshot } from './shared/types.js';

const exec = promisify(execFile);
export const VERSION = '0.1.0-alpha.3';
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

export type DesktopConnection = Pick<CdpConnection, 'connected' | 'on' | 'off' | 'once' | 'request' | 'evaluate' | 'close'>;
export interface RuntimeServices {
  directory: string;
  discoverApp: typeof discoverWindowsApp;
  choosePort: typeof chooseDesktopPort;
  owner: typeof getVerifiedDesktopOwner;
  renderer: () => Promise<string>;
  discoverCli: typeof discoverCodexCli;
  targets: typeof listTargets;
  connect: (url: string) => Promise<DesktopConnection>;
  pollMs: number;
  startupMs: number;
  startupPollMs: number;
  stopPollMs: number;
}
interface MountedPage { connection: DesktopConnection; contextId: number }
export async function startCompanion(options: { port?: number; attachOnly?: boolean } = {}, overrides: Partial<RuntimeServices> = {}) {
  const services: RuntimeServices = {
    directory: dataDirectory(), discoverApp: discoverWindowsApp, choosePort: chooseDesktopPort,
    owner: getVerifiedDesktopOwner,
    renderer: () => readFile(fileURLToPath(new URL('./renderer.js', import.meta.url)), 'utf8'),
    discoverCli: discoverCodexCli, targets: listTargets, connect: url => CdpConnection.connect(url),
    pollMs: 5000, startupMs: 30_000, startupPollMs: 1000, stopPollMs: 1000, ...overrides,
  };
  const directory = services.directory;
  let lock: Awaited<ReturnType<typeof acquireLock>> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { lock = await acquireLock(directory); break; }
    catch (error) {
      if (!(error instanceof LockBusyError)) throw error;
      try {
        const existing = await waitForInstance(directory, error.owner, options.port);
        console.log(`Using the existing Codex Sidecar ${existing.version} instance.`);
        console.log('SIDECAR_REUSED=1');
        return;
      } catch (handshakeError) {
        if (attempt === 0 && handshakeError instanceof InstanceOwnerChangedError) continue;
        throw handshakeError;
      }
    }
  }
  if (!lock) throw new Error('Could not establish Sidecar ownership.');
  const ownedLock = lock;
  const pages = new Map<string, MountedPage>();
  const attempts = new Map<string, number>();
  const work = new WorkGroup();
  const intervals: ReturnType<typeof setInterval>[] = [];
  let client: AccountClient | undefined;
  let cliPath: string | undefined;
  let stopping = false;
  let pollBusy = false;
  let refreshPromise: Promise<void> | undefined;
  let instance: Awaited<ReturnType<typeof startInstanceServer>> | undefined;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => {});
  let readyCheck: ((requestedPort?: number) => Promise<{ port: number; version: string }>) | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let quota: QuotaSnapshot = { fetchedAt: new Date(0).toISOString(), windows: [], error: 'Waiting for account usage.' };

  const onSignal = () => { void shutdown('Sidecar received a stop signal.').catch(error => console.error((error as Error).message)); };
  function shutdown(reason = 'Sidecar was stopped.') {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    intervals.forEach(clearInterval);
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
    rejectReady(new Error(reason));
    shutdownPromise = finishShutdown(reason);
    return shutdownPromise;
  }
  async function finishShutdown(reason: string) {
    console.log(`Stopping Codex Sidecar: ${reason}`);
    await instance?.close(reason);
    // Cancel owned account requests before draining actions that may await them.
    await client?.close();
    await work.stop();
    console.log('Pending component work drained.');
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
        if ((await readFile(stopPath, 'utf8')) === ownedLock.token) await unlink(stopPath);
      } catch { /* No request belonging to this instance. */ }
      await ownedLock.release();
    }
    console.log('Codex Sidecar stopped. No official app process was terminated.');
  }

  try {
    instance = await startInstanceServer({ pid: process.pid, token: ownedLock.token }, async requestedPort => {
      await ready;
      if (stopping || !readyCheck) throw new Error('Codex Sidecar is stopping.');
      return readyCheck(requestedPort);
    }, directory);
    let stopErrorReported = false;
    intervals.push(setInterval(async () => {
      try {
        if ((await readFile(join(directory, 'stop.request'), 'utf8')) === ownedLock.token) await shutdown();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !stopErrorReported) {
          stopErrorReported = true; console.error(`Sidecar stop check failed: ${(error as Error).message}`);
        }
      }
    }, services.stopPollMs));
    process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
    // Keep ownership until every startup operation has settled. Resource creation
    // must not resume after shutdown has already released the single-writer lock.
    const prepared = await work.run(async () => {
      const store = await StateStore.open(join(directory, 'state.json'));
      if (stopping) return;
      const app = await services.discoverApp();
      if (stopping) return;
      const port = await services.choosePort(app, options.port, options.attachOnly);
      if (stopping) return;
      const originalOwner = await services.owner(port, app);
      if (stopping) return;
      if (!originalOwner) throw new Error('The original Codex desktop process could not be verified.');
      const renderer = await services.renderer();
      if (stopping) return;
      try {
        cliPath = await services.discoverCli();
        if (stopping) return;
        client = new AccountClient(cliPath);
      } catch { quota.error = 'Codex CLI was not found; notes and bookmarks remain available.'; }
      if (stopping) return;
      return { store, app, port, originalOwner, renderer };
    });
    if (!prepared || stopping) { await shutdown(); return; }
    const { store, app, port, originalOwner, renderer } = prepared;
    async function originalDesktopIsAlive() {
      const owner = await services.owner(port, app);
      if (stopping) return false;
      if (!owner || owner.pid !== originalOwner.pid || owner.startedAt !== originalOwner.startedAt) {
        // This may run inside tracked work. Do not await our own work drain.
        void shutdown('The connected Codex desktop exited or was replaced.').catch(error => console.error((error as Error).message));
        return false;
      }
      return true;
    }
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
      if (!await originalDesktopIsAlive()) throw new Error('Desktop connection ownership changed.');
      ensureRunning();
      const connection = await services.connect(validateSocketUrl(target.webSocketDebuggerUrl!, port));
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
              detach: async () => { setTimeout(onSignal, 80); },
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
        if (!await originalDesktopIsAlive()) return;
        const targets = (await services.targets(port)).filter(isDesktopTarget);
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
      } catch { /* A failed probe is not proof of exit. Retry; never restart Codex here. */ }
      finally { pollBusy = false; }
    }
    readyCheck = requestedPort => work.run(async () => {
      if (stopping) throw new Error('Codex Sidecar is stopping.');
      if (requestedPort !== undefined && requestedPort !== port) throw new Error('Sidecar is already connected on another debugging port.');
      if (!await originalDesktopIsAlive()) throw new Error('The previous Codex desktop has exited. Open Sidecar again after it finishes closing.');
      const health = await Promise.allSettled([...pages.values()].map(page => page.connection.evaluate('Boolean(window.__CODEX_SIDECAR__)', page.contextId)));
      if (stopping || !health.some(result => result.status === 'fulfilled' && result.value === true)) throw new Error('The existing Sidecar has no healthy attached window. Wait for the Codex window to finish opening, then try again.');
      return { port, version: VERSION };
    });
    await work.run(reconcile);
    const readyDeadline = Date.now() + services.startupMs;
    while (!pages.size && !stopping && Date.now() < readyDeadline) {
      await delay(services.startupPollMs);
      if (stopping) break;
      await work.run(reconcile);
    }
    if (stopping) { await shutdown(); return; }
    if (!pages.size) throw new Error('No supported Codex window accepted the components. Check Sidecar compatibility; the official app was left unchanged.');
    resolveReady();
    console.log('SIDECAR_READY=1');
    void refreshQuota();
    intervals.push(setInterval(() => { void work.run(reconcile).catch(() => {}); }, services.pollMs));
    intervals.push(setInterval(() => { void refreshQuota(); }, 60000));
    console.log(`Codex Sidecar ${VERSION} · desktop ${app.packageVersion} · loopback ${port}`);
    console.log('Use codex-sidecar stop to remove the components.');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Sidecar startup failed.';
    rejectReady(new Error(reason));
    await shutdown(reason);
    throw error;
  }
}
