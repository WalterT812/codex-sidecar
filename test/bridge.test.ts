import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { handleRequest, type BridgeContext } from '../src/bridge.js';
import { StateStore } from '../src/store.js';

async function fixture(t: test.TestContext) {
  const base = resolve('.local/tests'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'bridge-'));
  t.after(async () => { assert.ok(dir.startsWith(base)); await rm(dir, { recursive: true, force: true }); });
  const calls: string[] = [];
  const context: BridgeContext = {
    store: await StateStore.open(join(dir, 'state.json')),
    refreshQuota: async () => { calls.push('quota'); },
    openLink: async url => { calls.push(url); },
    detach: async () => { calls.push('detach'); },
  };
  return { context, calls };
}

test('allowlisted host actions and mutations return correlated results', async t => {
  const { context, calls } = await fixture(t);
  for (const action of ['ui.ready', 'quota.refresh', 'ui.detach']) {
    assert.deepEqual(await handleRequest(JSON.stringify({ id: action, action, payload: {} }), context), { type: 'result', id: action, ok: true });
  }
  assert.deepEqual(await handleRequest({ id: 'open', action: 'open.link', payload: { url: 'https://example.com/read' } }, context), { type: 'result', id: 'open', ok: true });
  assert.deepEqual(calls, ['quota', 'detach', 'https://example.com/read']);
  const result = await handleRequest({ id: 'save', action: 'note.save', payload: { revision: 0, title: 'Note', body: 'Text' } }, context);
  assert.deepEqual(result, { type: 'result', id: 'save', ok: true });
  assert.equal(context.store.snapshot.notes[0]!.body, 'Text');
  const stale = await handleRequest({ id: 'stale', action: 'note.delete', payload: { revision: 0, id: context.store.snapshot.notes[0]!.id } }, context);
  assert.equal(stale.type, 'result'); if (stale.type === 'result') { assert.equal(stale.ok, false); assert.match(stale.error!, /changed|refresh/i); }
});

test('translation validates languages before invoking the helper and persists successful output',async t=>{
 const {context}=await fixture(t);let count=0;context.translate=async()=>{count++;return '你好';};
 const rejected=await handleRequest({id:'bad',action:'translate',payload:{text:'Hello',source:'constructor',target:'zh'}},context);assert.equal(rejected.type==='result'&&rejected.ok,false);assert.equal(count,0);
 const result=await handleRequest({id:'good',action:'translate',payload:{text:'Hello',source:'en',target:'zh'}},context);assert.deepEqual(result,{type:'result',id:'good',ok:true,translation:'你好'});assert.equal(context.store.snapshot.translations?.[0]?.model,'gpt-5.6-sol / medium');
});

test('hostile malformed requests never reach privileged handlers', async t => {
  const { context, calls } = await fixture(t);
  const hostile: unknown[] = [
    '{invalid', null, [], 42, {},
    { id: 'bad', action: 'shell.exec', payload: { command: 'whoami' } },
    { id: 'bad', action: 'quota.refresh', payload: { arbitrary: true } },
    { id: 'bad', action: 'open.link', payload: { url: 'javascript:alert(1)' } },
    { id: 'bad', action: 'open.link', payload: { url: 'codex://threads/new?prompt=run' } },
    { id: 'bad', action: 'note.save', payload: { revision: 0, title: 'Text', body: [] } },
    { id: 'bad', action: 'quota.refresh', payload: [], extra: true },
    { id: 'bad', action: 'quota.refresh' },
    { id: {}, action: 'quota.refresh', payload: {} },
    { id: 'x'.repeat(10000), action: 'quota.refresh', payload: {} },
    { id: 'line\nbreak', action: 'quota.refresh', payload: {} },
    JSON.parse('{"id":"bad","action":"settings.patch","payload":{"revision":0,"__proto__":{"polluted":true}}}'),
    Object.create({ id: 'bad', action: 'ui.detach', payload: {} }),
  ];
  for (const input of hostile) {
    const result = await handleRequest(input, context);
    assert.equal(result.type, 'result');
    if (result.type === 'result') { assert.equal(result.ok, false); assert.ok(result.id.length <= 128); assert.ok(result.error && result.error.length <= 500); }
  }
  assert.deepEqual(calls, []); assert.equal(context.store.snapshot.revision, 0);
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('request accessors are rejected without invoking application code', async t => {
  const { context, calls } = await fixture(t); let invoked = false;
  const input = { id: 'getter', action: 'open.link', get payload() { invoked = true; throw new Error('secret'); } };
  const result = await handleRequest(input, context);
  assert.equal(result.type, 'result'); if (result.type === 'result') assert.equal(result.ok, false);
  assert.equal(invoked, false); assert.deepEqual(calls, []);
});

test('host handler errors are bounded and safely returned to their caller', async t => {
  const { context } = await fixture(t);
  context.refreshQuota = async () => { throw new Error('Unavailable'); };
  assert.deepEqual(await handleRequest({ id: 'retry', action: 'quota.refresh', payload: {} }, context), { type: 'result', id: 'retry', ok: false, error: 'Unavailable' });
});
