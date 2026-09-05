import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, access, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startCompanion, type RuntimeServices, type DesktopConnection } from '../src/runtime.js';
import { requestStop } from '../src/lock.js';

const page = { id: 'main', type: 'page', url: 'app://-/index.html', title: 'Codex', webSocketDebuggerUrl: 'ws://127.0.0.1:23456/devtools/page/main' };
class FakePage extends EventEmitter {
  connected = true;
  present = false;
  async request<T = any>(method: string): Promise<T> {
    if (method === 'Runtime.enable') this.emit('Runtime.executionContextCreated', { context: { id: 7, auxData: { isDefault: true, frameId: 'main-frame' } } });
    return (method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'main-frame', url: page.url } } } : {}) as T;
  }
  async evaluate<T = unknown>(expression: string): Promise<T> {
    if (expression.startsWith('window.__CODEX_SIDECAR_BOOT__=')) this.present = true;
    if (expression === 'window.__CODEX_SIDECAR__?.destroy()') this.present = false;
    return (expression.startsWith('Boolean(') ? this.present : undefined) as T;
  }
  close() { if (this.connected) { this.connected = false; this.emit('disconnected'); } }
}
async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
async function until(check: () => Promise<boolean>, timeoutMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (!await check() && Date.now() < deadline) await delay(10);
  assert.equal(await check(), true, 'Expected lifecycle condition before timeout');
}
async function fixture(t: test.TestContext) {
  const base = resolve('.local/tests'); await mkdir(base, { recursive: true });
  // Keep Unix-domain socket paths below sockaddr_un's limit on CI checkouts.
  const directory = await mkdtemp(join(base, 'r-'));
  let owner: { pid: number; startedAt: string } | null = { pid: 101, startedAt: '2026-09-05T00:00:00.0000000Z' };
  let discoveryGate: Promise<void> | undefined;
  let targetFailure = false;
  const connections: FakePage[] = [];
  let launches = 0;
  const services: Partial<RuntimeServices> = {
    directory,
    discoverApp: async () => { await discoveryGate; return { guiPath: 'C:\\Package\\app\\ChatGPT.exe', packageVersion: 'test' }; },
    choosePort: async () => { launches++; return 23456; },
    owner: async () => owner,
    renderer: async () => '/* Fake renderer: no native app or account access. */',
    discoverCli: async () => { throw new Error('No account helper in lifecycle tests.'); },
    targets: async () => { if (targetFailure) throw new Error('Transient CDP failure'); return [page]; },
    connect: async () => { const connection = new FakePage(); connections.push(connection); return connection as unknown as DesktopConnection; },
    pollMs: 20, startupMs: 2000, startupPollMs: 10, stopPollMs: 10,
  };
  const lockPath = join(directory, 'companion.lock');
  t.after(async () => {
    if (await exists(lockPath)) { await requestStop(directory); await until(async () => !await exists(lockPath)); }
    assert.ok(directory.startsWith(base)); await rm(directory, { recursive: true, force: true });
  });
  return { directory, lockPath, services, connections, launches: () => launches,
    setOwner: (value: typeof owner) => { owner = value; },
    setGate: (value: Promise<void>) => { discoveryGate = value; },
    breakTargets: () => { targetFailure = true; },
  };
}

test('closing the original desktop releases its coordinator without a manual stop', async t => {
  const app = await fixture(t);
  await startCompanion({}, app.services);
  app.setOwner(null);
  await until(async () => !await exists(app.lockPath));
  assert.ok(app.connections.every(connection => !connection.connected));
});

test('a replacement desktop with a reused PID does not keep the old coordinator alive', async t => {
  const app = await fixture(t);
  await startCompanion({}, app.services);
  app.setOwner({ pid: 101, startedAt: '2026-09-05T00:01:00.0000000Z' });
  await until(async () => !await exists(app.lockPath));
});

test('a temporary CDP listing failure keeps the verified original session alive', async t => {
  const app = await fixture(t);
  await startCompanion({}, app.services);
  app.breakTargets();
  await delay(90);
  assert.equal(await exists(app.lockPath), true);
});

test('a duplicate during startup waits for the same owner and never launches twice', async t => {
  const app = await fixture(t);
  let ready!: () => void;
  app.setGate(new Promise<void>(resolve => { ready = resolve; }));
  const first = startCompanion({}, app.services);
  await until(() => exists(app.lockPath));
  let secondFinished = false;
  const second = startCompanion({}, app.services).then(() => { secondFinished = true; });
  // Observe rejection immediately so a failing regression run is not unhandled.
  void second.catch(() => {});
  await delay(30);
  const prematurelyFinished = secondFinished;
  ready();
  await first;
  await second;
  assert.equal(prematurelyFinished, false);
  assert.equal(app.launches(), 1);
});

test('a ready duplicate validates the live desktop and a manual stop drains all coordination', async t => {
  const app = await fixture(t);
  await startCompanion({}, app.services);
  await startCompanion({}, app.services);
  assert.equal(app.launches(), 1);
  await requestStop(app.directory);
  await until(async () => !await exists(app.lockPath));
  assert.ok(app.connections.every(connection => !connection.connected));
});

test('stopping during discovery prevents the delayed first start from launching Codex', async t => {
  const app = await fixture(t);
  app.services.stopPollMs=10000; // The boundary check, not a timing lucky poll, must prevent launch.
  let finishDiscovery!: () => void;
  app.setGate(new Promise<void>(resolve => { finishDiscovery = resolve; }));
  const starting = startCompanion({}, app.services);
  await until(() => exists(app.lockPath));
  await requestStop(app.directory);
  await delay(35);
  assert.equal(await exists(app.lockPath), true, 'Retain ownership until startup work is drained');
  finishDiscovery();
  await starting;
  await until(async () => !await exists(app.lockPath));
  assert.equal(app.launches(), 0);
  assert.equal(app.connections.length, 0);
});

test('stopping during mobile initialization drains the new relay before releasing ownership',async t=>{
  const app=await fixture(t);let enter!:()=>void,finish!:()=>void,stops=0;
  const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>finish=r);
  app.services.startMobile=async()=>{enter();await gate;return {status:()=>({configured:true,url:'https://example.com/',online:false,lastSeen:0,error:''}),pair:async()=>({}),revoke:async()=>({}),stop:async()=>{stops++;}};};
  const starting=startCompanion({},app.services);await entered;
  await requestStop(app.directory);await delay(35);assert.equal(await exists(app.lockPath),true);
  finish();await starting;await until(async()=>!await exists(app.lockPath));assert.equal(stops,1);
});

test('an old ready result cannot hide the loss of all mounted widgets', async t => {
  const app = await fixture(t);
  // Avoid periodic reconciliation repairing our deliberate unhealthy fixture.
  app.services.pollMs = 10_000;
  await startCompanion({}, app.services);
  app.connections.forEach(connection => { connection.present = false; });
  await assert.rejects(startCompanion({}, app.services), /no healthy attached window/);
  assert.equal(app.launches(), 1);
});

test('immediate reopening waits for the previous coordinator to stop, then launches once', async t => {
  const app = await fixture(t);
  app.services.pollMs = 10_000;
  await startCompanion({}, app.services);
  app.setOwner(null);
  let reopened = 0;
  app.services.choosePort = async () => {
    reopened++;
    app.setOwner({ pid: 102, startedAt: '2026-09-05T00:02:00.0000000Z' });
    return 23456;
  };
  await startCompanion({}, app.services);
  assert.equal(reopened, 1);
  assert.equal(await exists(app.lockPath), true);
  assert.equal(app.connections.filter(connection => connection.connected && connection.present).length, 1);
});

for (const phase of ['choosePort', 'renderer', 'discoverCli'] as const) {
  test(`stop during ${phase} retains ownership until that operation settles`, async t => {
    const app = await fixture(t);
    let entered!: () => void; let finish!: () => void;
    const entry = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const stopInPhase = async () => { entered(); await gate; };
    if (phase === 'choosePort') app.services.choosePort = async () => { await stopInPhase(); return 23456; };
    if (phase === 'renderer') app.services.renderer = async () => { await stopInPhase(); return 'fixture'; };
    if (phase === 'discoverCli') app.services.discoverCli = async () => { await stopInPhase(); return 'C:\\fixture\\codex.exe'; };
    const starting = startCompanion({}, app.services);
    await Promise.race([entry, delay(5000).then(()=>{finish();throw Error('Startup phase was not reached');})]);
    await requestStop(app.directory); await delay(35);
    assert.equal(await exists(app.lockPath), true);
    finish(); await starting;
    await until(async () => !await exists(app.lockPath));
    assert.equal(app.connections.length, 0);
  });
}
