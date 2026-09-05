import { createConnection, createServer, type Socket } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { dataDirectory } from './paths.js';
import { getLockOwner, type LockOwner } from './lock.js';

export interface InstanceReady { port: number; version: string }
export class InstanceOwnerChangedError extends Error {
  constructor() { super('The previous Sidecar owner disappeared or was replaced.'); this.name = 'InstanceOwnerChangedError'; }
}
class ListenerUnavailableError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 2048;
const MAX_CLIENTS = 16;
const HELLO_TIMEOUT = 2000;
const READY_TIMEOUT = 50000;

function endpoint(directory: string, owner: LockOwner): string {
  if (process.platform === 'win32') return `\\\\.\\pipe\\codex-sidecar-${owner.token}`;
  const path = join(directory, '.ipc', `${createHash('sha256').update(owner.token).digest('hex').slice(0, 20)}.sock`);
  if (Buffer.byteLength(path) > 103) throw new Error('The local socket path is too long; set CODEX_SIDECAR_DATA to a shorter directory.');
  return path;
}

function validOwner(owner: LockOwner): void {
  if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.token !== 'string' || !UUID.test(owner.token)) throw new Error('Invalid Sidecar owner.');
}
function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid instance protocol message.');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some(key => !expected.includes(key))) throw new Error('Invalid instance protocol fields.');
}
function message(error: unknown): string {
  let text = 'The Sidecar instance could not become ready.';
  try { if (error instanceof Error && typeof error.message === 'string') text = error.message; else if (typeof error === 'string') text = error; } catch { /* Host errors may contain non-data accessors. */ }
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').slice(0, 500) || 'The Sidecar instance could not become ready.';
}
function ready(value: unknown): InstanceReady {
  const data = record(value);
  if (!validPort(data.port) || typeof data.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(data.version)) throw new Error('The instance returned invalid readiness information.');
  return { port: data.port, version: data.version };
}

async function assertOwner(directory: string, expected: LockOwner): Promise<void> {
  const current = await getLockOwner(directory);
  if (!current || current.pid !== expected.pid || current.token !== expected.token) throw new InstanceOwnerChangedError();
  try { process.kill(current.pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') throw new InstanceOwnerChangedError(); }
}

/** A local status-only rendezvous. The handler supplies freshly checked readiness. */
export async function startInstanceServer(ownerInput: LockOwner, handler: (requestedPort?: number) => Promise<InstanceReady>, directory = dataDirectory()): Promise<{ close(reason?: string): Promise<void> }> {
  validOwner(ownerInput); const owner = { ...ownerInput };
  if (owner.pid !== process.pid) throw new Error('An instance server must belong to the current process.');
  const path = endpoint(directory, owner);
  if (process.platform !== 'win32') await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const sockets = new Set<Socket>();
  const slots = new Set<object>();
  const replies = new Map<Socket, (reason: string) => void>();
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => { socket.destroy(); });
    socket.once('close', () => { sockets.delete(socket); });
    if (closing || slots.size >= MAX_CLIENTS) {
      socket.end(`${JSON.stringify({ type: 'error', nonce: 'invalid', ...owner, error: 'The instance is busy; retry shortly.' })}\n`);
      socket.destroySoon(); return;
    }
    const slot = {}; slots.add(slot);
    let received = false; let processing = false; let replied = false; let nonce = 'invalid';
    let buffer = Buffer.alloc(0);
    let timer: ReturnType<typeof setTimeout>;
    const respond = (payload: Record<string, unknown>) => {
      if (replied || socket.destroyed) return;
      replied = true; clearTimeout(timer);
      socket.end(`${JSON.stringify({ ...payload, nonce, ...owner })}\n`);
      socket.destroySoon();
    };
    const fail = (reason: unknown) => respond({ type: 'error', error: message(reason) });
    timer = setTimeout(() => { fail('The instance handshake timed out.'); socket.destroySoon(); }, HELLO_TIMEOUT);
    replies.set(socket, fail);
    socket.once('close', () => {
      clearTimeout(timer); sockets.delete(socket); replies.delete(socket);
      if (!processing) slots.delete(slot);
    });
    socket.on('data', chunk => {
      if (replied) { socket.destroy(); return; }
      if (received || buffer.length + chunk.length > MAX_BYTES) { fail('Invalid or oversized instance request.'); return; }
      buffer = Buffer.concat([buffer, chunk]);
      const newline = buffer.indexOf(10);
      if (newline < 0) return;
      received = true; clearTimeout(timer);
      try {
        if (newline !== buffer.length - 1) throw new Error('Only one instance request is allowed per connection.');
        const request = record(JSON.parse(buffer.subarray(0, newline).toString('utf8')));
        if (typeof request.nonce === 'string' && UUID.test(request.nonce)) nonce = request.nonce;
        fields(request, Object.hasOwn(request, 'requestedPort') ? ['type', 'nonce', 'token', 'pid', 'requestedPort'] : ['type', 'nonce', 'token', 'pid']);
        if (request.type !== 'hello' || nonce === 'invalid' || request.token !== owner.token || request.pid !== owner.pid) throw new Error('The instance request identity does not match its owner.');
        if (Object.hasOwn(request, 'requestedPort') && !validPort(request.requestedPort)) throw new Error('Invalid requested port.');
        const requestedPort = request.requestedPort as number | undefined;
        processing = true;
        timer = setTimeout(() => { fail('The existing Sidecar did not become ready in time.'); socket.destroySoon(); }, READY_TIMEOUT);
        void Promise.resolve().then(() => handler(requestedPort)).then(value => {
          if (closing || replied || socket.destroyed) return;
          const result = ready(value);
          if (requestedPort !== undefined && requestedPort !== result.port) throw new Error('The existing Sidecar uses a different debugging port.');
          respond({ type: 'ready', ...result });
        }).catch(fail).finally(() => { processing = false; slots.delete(slot); });
      } catch (error) { fail(error); }
    });
  });
  // Listen failures remain ordinary startup failures; no stale socket is stolen.
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => { server.off('listening', opened); reject(error); };
    const opened = () => { server.off('error', failed); resolve(); };
    server.once('error', failed); server.once('listening', opened); server.listen(path);
  });
  server.on('error', () => { void close('The local instance listener failed.'); });
  function close(reason = 'The Sidecar instance is stopping.'): Promise<void> {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = new Promise<void>(resolve => {
      const force = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 250);
      server.close(() => { clearTimeout(force); server.removeAllListeners(); resolve(); });
      for (const reply of replies.values()) reply(reason);
      for (const socket of sockets) if (!replies.has(socket)) socket.destroy();
    });
    return closePromise;
  }
  return { close };
}

function joinOnce(directory: string, owner: LockOwner, requestedPort: number | undefined, deadline: number): Promise<InstanceReady> {
  return new Promise((resolve, reject) => {
    const nonce = randomUUID(); const socket = createConnection(endpoint(directory, owner));
    let done = false; let connected = false; let checking = false; let verifyingResponse = false;
    let buffer = Buffer.alloc(0);
    let connectTimer: ReturnType<typeof setTimeout>;
    let timeout: ReturnType<typeof setTimeout>;
    let ownerPoll: ReturnType<typeof setInterval>;
    const finish = (error?: Error, result?: InstanceReady) => {
      if (done) return; done = true;
      clearTimeout(connectTimer); clearTimeout(timeout); clearInterval(ownerPoll); socket.destroy();
      if (error) reject(error); else resolve(result!);
    };
    const remaining = Math.max(1, deadline - Date.now());
    connectTimer = setTimeout(() => finish(new ListenerUnavailableError('The instance listener is not available.')), Math.min(500, remaining));
    timeout = setTimeout(() => finish(new Error('The existing Sidecar did not respond with readiness before the timeout.')), remaining);
    ownerPoll = setInterval(() => {
      if (done || checking) return; checking = true;
      void assertOwner(directory, owner).catch(error => finish(error instanceof Error ? error : new Error(message(error)))).finally(() => { checking = false; });
    }, 100);
    socket.once('connect', () => {
      connected = true; clearTimeout(connectTimer);
      socket.write(`${JSON.stringify({ type: 'hello', nonce, ...owner, ...(requestedPort === undefined ? {} : { requestedPort }) })}\n`);
    });
    socket.on('error', () => { if (!verifyingResponse) finish(new ListenerUnavailableError('The existing instance listener is unavailable.')); });
    socket.once('close', () => { if (!done && !verifyingResponse) finish(new ListenerUnavailableError(connected ? 'The instance closed before responding.' : 'The instance listener is unavailable.')); });
    socket.on('data', chunk => {
      if (done) return;
      if (buffer.length + chunk.length > MAX_BYTES) { finish(new Error('The instance response exceeds the protocol size limit.')); return; }
      buffer = Buffer.concat([buffer, chunk]);
      const newline = buffer.indexOf(10); if (newline < 0) return;
      try {
        if (newline !== buffer.length - 1) throw new Error('Invalid instance response framing.');
        const response = record(JSON.parse(buffer.subarray(0, newline).toString('utf8')));
        if (response.nonce !== nonce || response.token !== owner.token || response.pid !== owner.pid) throw new Error('The instance response nonce or owner identity does not match.');
        if (response.type === 'error') {
          fields(response, ['type', 'nonce', 'token', 'pid', 'error']);
          if (typeof response.error !== 'string' || response.error.length > 500) throw new Error('Invalid instance error response.');
          finish(new Error(message(response.error))); return;
        }
        fields(response, ['type', 'nonce', 'token', 'pid', 'port', 'version']);
        if (response.type !== 'ready') throw new Error('Invalid instance response type.');
        const result = ready(response);
        if (requestedPort !== undefined && result.port !== requestedPort) throw new Error('The existing Sidecar uses a different debugging port.');
        // Receipt of a matching nonce proves a live responder; this final read
        // also proves it is still the owner, rather than a superseded instance.
        verifyingResponse = true;
        void assertOwner(directory, owner).then(() => finish(undefined, result), error => finish(error instanceof Error ? error : new Error(message(error))));
      } catch (error) { finish(error instanceof Error ? error : new Error(message(error))); }
    });
  });
}

export async function waitForInstance(directory: string, ownerInput: LockOwner, requestedPort?: number, timeoutMs = 45000): Promise<InstanceReady> {
  validOwner(ownerInput); const owner = { ...ownerInput };
  if (requestedPort !== undefined && !validPort(requestedPort)) throw new Error('Invalid requested port.');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid instance wait timeout.');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await assertOwner(directory, owner);
    try { return await joinOnce(directory, owner, requestedPort, deadline); }
    catch (error) {
      if (!(error instanceof ListenerUnavailableError)) throw error;
      await assertOwner(directory, owner);
      const remaining = deadline - Date.now(); if (remaining > 0) await delay(Math.min(75, remaining));
    }
  }
  throw new Error('The existing Sidecar did not respond with readiness before the timeout. Its lock was preserved.');
}
