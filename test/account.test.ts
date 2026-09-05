import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { test, mock, afterEach } from 'node:test';
import { AccountClient } from '../src/account/client.js';

type Message = { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code: number } };

function fakeServer(handle: (message: Message, reply: (message: unknown) => void) => void, closeOnEnd = true) {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: Writable; kill: () => boolean };
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const messages: Message[] = [];
  let killed = false;
  let input = '';
  const reply = (message: unknown) => child.stdout.write(`${JSON.stringify(message)}\n`);
  child.stdin = new Writable({ write(chunk, _encoding, callback) {
    input += chunk.toString();
    while (input.includes('\n')) {
      const end = input.indexOf('\n');
      const message = JSON.parse(input.slice(0, end)) as Message;
      input = input.slice(end + 1); messages.push(message);
      queueMicrotask(() => handle(message, reply));
    }
    callback();
  }, final(callback) { callback(); if (closeOnEnd) queueMicrotask(() => child.emit('close', 0)); } });
  child.kill = () => { killed = true; queueMicrotask(() => child.emit('close', 0)); return true; };
  mock.method(childProcess, 'spawn', (executable: string, args: string[], options: Record<string, unknown>) => {
    assert.equal(executable, 'D:\\Tools\\codex.exe');
    assert.deepEqual(args, ['app-server']);
    assert.equal(options.shell, false);
    return child;
  });
  return { child, messages, reply, wasKilled: () => killed };
}

function initialize(message: Message, reply: (message: unknown) => void): boolean {
  if (message.method !== 'initialize') return false;
  reply({ id: message.id, result: { userAgent: 'codex-test' } }); return true;
}

afterEach(() => mock.restoreAll());

test('initializes once, reads only account quota, and closes its own stdio server cleanly', async () => {
  const server = fakeServer((message, reply) => {
    if (initialize(message, reply)) return;
    if (message.method === 'account/rateLimits/read') reply({ id: message.id, result: {
      rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_789_200_000 } },
    } });
  });
  const client = new AccountClient('D:\\Tools\\codex.exe');
  try {
    const quota = await client.getQuota();
    assert.equal(quota.windows[0]?.remainingPercent, 75);
    assert.equal(quota.windows[0]?.resetsAt, 1_789_200_000);
    await client.getQuota();
    assert.deepEqual(server.messages.map((message) => message.method), ['initialize', 'initialized', 'account/rateLimits/read', 'account/rateLimits/read']);
  } finally { await client.close(); }
  assert.equal(server.child.stdin.writableEnded, true);
  assert.equal(server.wasKilled(), false);
  await assert.rejects(client.getQuota(), /closed/i);
});

test('rejects unsolicited server requests without executing actions', async () => {
  const server = fakeServer((message, reply) => {
    if (initialize(message, reply)) return;
    if (message.method === 'account/rateLimits/read') {
      reply({ id: 'hostile-1', method: 'item/commandExecution/requestApproval', params: { command: 'never execute' } });
      reply({ id: message.id, result: { rateLimits: null } });
    }
  });
  const client = new AccountClient('D:\\Tools\\codex.exe');
  try {
    assert.deepEqual((await client.getQuota()).windows, []);
    assert.equal(server.messages.find((message) => message.id === 'hostile-1')?.error?.code, -32601);
  } finally { await client.close(); }
});

test('times out bounded requests and terminates only an unresponsive owned helper', async () => {
  const server = fakeServer((message, reply) => { initialize(message, reply); }, false);
  const client = new AccountClient('D:\\Tools\\codex.exe', { requestTimeoutMs: 20, shutdownTimeoutMs: 20 });
  await assert.rejects(client.getQuota(), /timed out/i);
  await client.close();
  assert.equal(server.wasKilled(), true);
});

test('rejects malformed and oversized RPC streams instead of retaining unbounded data', async () => {
  for (const payload of ['{broken json}\n', 'x'.repeat(1_048_577)]) {
    mock.restoreAll();
    const server = fakeServer((message, reply) => {
      if (initialize(message, reply)) return;
      if (message.method === 'account/rateLimits/read') server.child.stdout.write(payload);
    });
    const client = new AccountClient('D:\\Tools\\codex.exe');
    try { await assert.rejects(client.getQuota(), /invalid|limit|large/i); }
    finally { await client.close(); }
  }
});

test('an unexpected helper exit rejects pending reads immediately', async () => {
  const server = fakeServer((message, reply) => {
    if (initialize(message, reply)) return;
    if (message.method === 'account/rateLimits/read') server.child.emit('close', 1);
  });
  const client = new AccountClient('D:\\Tools\\codex.exe');
  try { await assert.rejects(client.getQuota(), /exited|closed/i); }
  finally { await client.close(); }
});

test('limits outbound responses when an unsolicited requester stops reading its input', async () => {
  const server = fakeServer((message, reply) => {
    if (initialize(message, reply)) return;
    if (message.method === 'account/rateLimits/read') {
      Object.defineProperty(server.child.stdin, 'writableLength', { get: () => 70_000 });
      reply({ id: 'hostile-1', method: 'item/commandExecution/requestApproval' });
    }
  });
  const client = new AccountClient('D:\\Tools\\codex.exe', { requestTimeoutMs: 50 });
  try { await assert.rejects(client.getQuota(), /invalid RPC|buffer limit/i); }
  finally { await client.close(); }
});

test('collapses simultaneous refreshes and reports provider errors without echoing raw details', async () => {
  const server = fakeServer((message, reply) => {
    if (initialize(message, reply)) return;
    if (message.method === 'account/rateLimits/read') reply({ id: message.id, error: { code: -32001, message: 'private-detail' } });
  });
  const client = new AccountClient('D:\\Tools\\codex.exe');
  try {
    const results = await Promise.allSettled([client.getQuota(), client.getQuota()]);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 2);
    const failure = results[0];
    assert.ok(failure?.status === 'rejected');
    assert.match(String(failure.reason), /-32001/);
    assert.doesNotMatch(String(failure.reason), /private-detail/);
    assert.equal(server.messages.filter((message) => message.method === 'account/rateLimits/read').length, 1);
  } finally { await client.close(); }
});
