import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createConnection, createServer, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireLock, type LockOwner } from '../src/lock.js';
import { InstanceOwnerChangedError, startInstanceServer, waitForInstance } from '../src/instance.js';

const READY = { port: 32123, version: '0.1.0-alpha.1' };
function endpoint(directory: string, owner: LockOwner) {
  return process.platform === 'win32' ? `\\\\.\\pipe\\codex-sidecar-${owner.token}` : join(directory, '.ipc', `${createHash('sha256').update(owner.token).digest('hex').slice(0, 20)}.sock`);
}

async function fixture(t: test.TestContext) {
  const base = resolve('.local/i'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'i-'));
  const previous = process.env.CODEX_SIDECAR_DATA; process.env.CODEX_SIDECAR_DATA = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.CODEX_SIDECAR_DATA; else process.env.CODEX_SIDECAR_DATA = previous;
    assert.ok(directory.startsWith(base)); await rm(directory, { recursive: true, force: true });
  });
  const lock = await acquireLock(directory);
  const owner = { pid: process.pid, token: lock.token };
  return { directory, owner, lock };
}

function rawRequest(path: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path); let output = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Raw request timed out')); }, 1500);
    socket.once('connect', () => { socket.write(input); });
    socket.on('data', chunk => { output += chunk.toString(); if (output.length > 4096) { socket.destroy(); reject(new Error('Oversized response')); } });
    socket.once('error', reject);
    socket.once('close', () => { clearTimeout(timer); resolve(output); });
  });
}

test('concurrent duplicate starts wait for actual readiness and all succeed', async t => {
  const { directory, owner, lock } = await fixture(t);
  let ready!: () => void; const gate = new Promise<void>(resolve => { ready = resolve; });
  let calls = 0; let completed = 0;
  const server = await startInstanceServer(owner, async requestedPort => { calls++; assert.equal(requestedPort, READY.port); await gate; return READY; });
  try {
    const callers = Array.from({ length: 3 }, () => waitForInstance(directory, owner, READY.port, 2500).then(result => { completed++; return result; }));
    await delay(50); assert.equal(completed, 0);
    ready(); assert.deepEqual(await Promise.all(callers), [READY, READY, READY]);
    assert.equal(calls, 3);
  } finally { await server.close(); await lock.release(); }
});

test('a duplicate can arrive after lock creation but before the pipe is listening', async t => {
  const { directory, owner, lock } = await fixture(t);
  const pending = waitForInstance(directory, owner, undefined, 2000);
  await delay(40);
  const server = await startInstanceServer(owner, async () => READY);
  try { assert.deepEqual(await pending, READY); }
  finally { await server.close(); await lock.release(); }
});

test('an explicit server directory matches its waiter despite a different environment default', async t => {
  const { directory, owner, lock } = await fixture(t);
  const unrelatedDefault = join(directory, 'other');
  process.env.CODEX_SIDECAR_DATA = unrelatedDefault;
  const server = await startInstanceServer(owner, async () => READY, directory);
  try {
    assert.deepEqual(await waitForInstance(directory, owner, undefined, 1500), READY);
    await assert.rejects(readFile(join(unrelatedDefault, 'companion.lock')), { code: 'ENOENT' });
  } finally { await server.close(); await lock.release(); }
});

test('duplicate starts receive the startup failure instead of an already-running error', async t => {
  const { directory, owner, lock } = await fixture(t);
  const server = await startInstanceServer(owner, async () => { throw new Error('Unsupported desktop layout'); });
  try { await assert.rejects(waitForInstance(directory, owner, undefined, 2000), /Unsupported desktop layout/); }
  finally { await server.close(); await lock.release(); }
});

test('responses cannot authorize a replaced owner or a different requested port', async t => {
  const { directory, owner, lock } = await fixture(t);
  const path = join(directory, 'companion.lock'); const original = await readFile(path, 'utf8');
  const server = await startInstanceServer(owner, async () => READY);
  try {
    await assert.rejects(waitForInstance(directory, owner, READY.port + 1, 2000), /port/i);
    await writeFile(path, JSON.stringify({ pid: process.pid, token: randomUUID() }));
    await assert.rejects(waitForInstance(directory, owner, undefined, 2000), InstanceOwnerChangedError);
  } finally { await writeFile(path, original); await server.close(); await lock.release(); }
});

test('a ready response is rechecked against the authoritative lock', async t => {
  const { directory, owner, lock } = await fixture(t);
  const path = join(directory, 'companion.lock'); const original = await readFile(path, 'utf8');
  const server = await startInstanceServer(owner, async () => {
    await writeFile(path, JSON.stringify({ pid: process.pid, token: randomUUID() })); return READY;
  });
  try { await assert.rejects(waitForInstance(directory, owner, undefined, 2000), InstanceOwnerChangedError); }
  finally { await writeFile(path, original); await server.close(); await lock.release(); }
});

test('owner disappearance aborts a pending join and close does not wait on an unresolved handler', async t => {
  const { directory, owner } = await fixture(t);
  let started!: () => void; const called = new Promise<void>(resolve => { started = resolve; });
  const server = await startInstanceServer(owner, async () => { started(); return await new Promise<never>(() => {}); });
  const pending = assert.rejects(waitForInstance(directory, owner, undefined, 2000), InstanceOwnerChangedError);
  await called; await unlink(join(directory, 'companion.lock'));
  await pending;
  const before = Date.now(); await server.close('Desktop closed');
  assert.ok(Date.now() - before < 1000);
});

test('an authenticated stopping reply waits for actual lock release before permitting a retry', async t => {
  const { directory, owner, lock } = await fixture(t);
  let started!: () => void; const called = new Promise<void>(resolve => { started = resolve; });
  const server = await startInstanceServer(owner, async () => { started(); return await new Promise<never>(() => {}); });
  let settled = false;
  const waiter = waitForInstance(directory, owner, undefined, 2000);
  void waiter.then(() => { settled = true; }, () => { settled = true; });
  const pending = assert.rejects(waiter, InstanceOwnerChangedError); void pending.catch(() => {});
  try {
    await called; await server.close('Desktop ended');
    await delay(150);
    assert.equal(settled, false, 'closing the pipe must not authorize ownership transfer');
    assert.equal(JSON.parse(await readFile(join(directory, 'companion.lock'), 'utf8')).token, owner.token);
    await lock.release(); await pending;
  } finally { await server.close(); await lock.release(); }
});

test('stopping without releasing the lock times out with its reason and preserves ownership', async t => {
  const { directory, owner, lock } = await fixture(t);
  let started!: () => void; const called = new Promise<void>(resolve => { started = resolve; });
  const server = await startInstanceServer(owner, async () => { started(); return await new Promise<never>(() => {}); });
  const pending = assert.rejects(waitForInstance(directory, owner, undefined, 250), error => {
    assert.ok(!(error instanceof InstanceOwnerChangedError));
    assert.match((error as Error).message, /Desktop ended/);
    assert.match((error as Error).message, /timeout|timed out/i); return true;
  }); void pending.catch(() => {});
  try {
    await called; await server.close('Desktop ended'); await pending;
    assert.equal(JSON.parse(await readFile(join(directory, 'companion.lock'), 'utf8')).token, owner.token);
  } finally { await server.close(); await lock.release(); }
});

test('malformed, oversized, and wrong-owner protocol requests never reach the handler', async t => {
  const { directory, owner, lock } = await fixture(t); let calls = 0;
  const server = await startInstanceServer(owner, async () => { calls++; return READY; });
  try {
    for (const raw of ['null\n', '[]\n', '{invalid\n', 'x'.repeat(3000) + '\n', JSON.stringify({ type: 'hello', nonce: randomUUID(), token: randomUUID(), pid: owner.pid }) + '\n']) {
      const output = await rawRequest(endpoint(directory, owner), raw);
      assert.ok(output.length <= 2048);
      assert.equal(JSON.parse(output).type, 'error');
    }
    assert.equal(calls, 0);
    assert.deepEqual(await waitForInstance(directory, owner, undefined, 2000), READY);
  } finally { await server.close(); await lock.release(); }
});

test('a live PID without a responding instance times out without altering its lock', async t => {
  const { directory, owner, lock } = await fixture(t);
  const path = join(directory, 'companion.lock'); const original = await readFile(path, 'utf8');
  await assert.rejects(waitForInstance(directory, owner, undefined, 120), /respond|ready|timed out/i);
  assert.equal(await readFile(path, 'utf8'), original); await lock.release();
});

test('excess and half-open sockets cannot block bounded server shutdown', async t => {
  const { directory, owner, lock } = await fixture(t);
  const server = await startInstanceServer(owner, async () => READY);
  const sockets: Socket[] = [];
  try {
    for (let index = 0; index < 16; index++) {
      const socket = createConnection({ path: endpoint(directory, owner), allowHalfOpen: true });
      socket.on('error', () => {}); sockets.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    }
    // The server rejects this connection before reading a hello. Sending bytes
    // after that close can legitimately yield ECONNRESET on Unix sockets.
    const excess = await rawRequest(endpoint(directory, owner), '');
    assert.match(JSON.parse(excess).error, /busy/i);
    const before = Date.now(); await server.close('Closing');
    assert.ok(Date.now() - before < 1000);
  } finally { sockets.forEach(socket => socket.destroy()); await server.close(); await lock.release(); }
});

test('a mismatched nonce from a local listener cannot be mistaken for readiness', async t => {
  const { directory, owner, lock } = await fixture(t);
  const path = endpoint(directory, owner); if (process.platform !== 'win32') await mkdir(join(directory, '.ipc'), { recursive: true });
  const sockets = new Set<Socket>();
  const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.once('data', () => socket.end(JSON.stringify({ type: 'ready', nonce: randomUUID(), ...owner, ...READY }) + '\n')); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  try { await assert.rejects(waitForInstance(directory, owner, undefined, 2000), /identity|nonce/i); }
  finally { sockets.forEach(socket => socket.destroy()); await new Promise<void>(resolve => server.close(() => resolve())); await lock.release(); }
});
