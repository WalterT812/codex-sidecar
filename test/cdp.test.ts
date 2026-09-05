import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpConnection, isDesktopTarget, validateSocketUrl } from '../src/cdp.js';

test('only packaged desktop pages can receive components', () => {
  const base = { id: '1', type: 'page', title: 'Codex', webSocketDebuggerUrl: 'ws://127.0.0.1:9000/devtools/page/1' };
  assert.equal(isDesktopTarget({ ...base, url: 'app://./index.html#/thread/a' }), true);
  assert.equal(isDesktopTarget({ ...base, url: 'app://./#/thread/a' }), true);
  for (const url of ['https://chatgpt.com', 'https://example.com', 'file:///C:/test.html', 'app://./avatar.html', 'app://./login.html', 'app://./preview.html', 'app://./nested/index.html', 'app://./index.html#/login', 'app://./index.html#/%70review', 'app://./index.html?view=pet-overlay', 'app://user:password@./index.html', 'bad url']) {
    assert.equal(isDesktopTarget({ ...base, url }), false, url);
  }
  assert.equal(isDesktopTarget({ ...base, type: 'iframe', url: 'app://./index.html' }), false);
});

class FakeSocket extends EventTarget {
  static OPEN = 1;
  static latest: FakeSocket;
  readyState = 0;
  sent: string[] = [];
  closeCalls = 0;
  constructor(_url: string) { super(); FakeSocket.latest = this; }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  send(value: string) { this.sent.push(value); }
  receive(value: string) { this.dispatchEvent(new MessageEvent('message', { data: value })); }
  close() { this.closeCalls++; this.readyState = 3; this.dispatchEvent(new Event('close')); }
}

function useFakeSockets(t: test.TestContext) {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  return async () => {
    const pending = CdpConnection.connect('ws://127.0.0.1:9000/devtools/page/test');
    const socket = FakeSocket.latest; socket.open();
    const connection = await pending;
    t.after(() => connection.close());
    return { socket, connection };
  };
}

test('malformed CDP records close cleanly and reject outstanding requests', async t => {
  const connect = useFakeSockets(t);
  for (const raw of ['null', '[]', 'true', '12', '"string"', '{broken', '{"method":"Runtime.bindingCalled","params":null}']) {
    const { connection, socket } = await connect();
    const pending = connection.request('Runtime.enable');
    const rejected = assert.rejects(pending, /disconnected/i);
    socket.receive(raw);
    await rejected;
    assert.equal(connection.connected, false, raw);
    assert.equal(socket.closeCalls, 1, raw);
  }
});

test('remote messages cannot emit reserved host lifecycle events', async t => {
  const { connection, socket } = await useFakeSockets(t)();
  let disconnected = 0; let bindingCalls = 0;
  connection.on('disconnected', () => { disconnected++; });
  connection.on('Runtime.bindingCalled', () => { bindingCalls++; });
  for (const method of ['error', 'disconnected', 'newListener', 'removeListener', '__proto__']) socket.receive(JSON.stringify({ method, params: {} }));
  assert.equal(disconnected, 0); assert.equal(connection.connected, true);
  socket.receive(JSON.stringify({ method: 'Runtime.bindingCalled', params: { name: '__codexSidecarSend', executionContextId: 1, payload: '{}' } }));
  assert.equal(bindingCalls, 1);
});

test('CDP response correlation and timeout leave the connection usable', async t => {
  const { connection, socket } = await useFakeSockets(t)();
  const first = connection.request('Runtime.enable');
  const firstId = JSON.parse(socket.sent[0]!).id;
  socket.receive(JSON.stringify({ id: firstId + 1, result: {} }));
  socket.receive(JSON.stringify({ id: firstId, result: { enabled: true } }));
  assert.deepEqual(await first, { enabled: true });
  await assert.rejects(connection.request('Page.getFrameTree', {}, 5), /timed out/);
  const retry = connection.request('Runtime.enable');
  socket.receive(JSON.stringify({ id: JSON.parse(socket.sent.at(-1)!).id, result: {} }));
  assert.deepEqual(await retry, {});
});

test('debugger cannot redirect the companion to a remote socket', () => {
  assert.equal(validateSocketUrl('ws://localhost:9000/devtools/page/1', 9000), 'ws://127.0.0.1:9000/devtools/page/1');
  for (const value of ['ws://example.com:9000/devtools/page/1', 'ws://127.0.0.1:9001/devtools/page/1', 'wss://127.0.0.1:9000/devtools/page/1', 'ws://x:y@localhost:9000/devtools/page/1', 'ws://localhost:9000/unexpected']) {
    assert.throws(() => validateSocketUrl(value, 9000));
  }
});
