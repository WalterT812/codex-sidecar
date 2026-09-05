import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StateStore, validateLink } from '../src/store.js';

async function fixture(t: test.TestContext) {
  const base = resolve('.local/tests');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'store-'));
  t.after(async () => { assert.ok(dir.startsWith(base)); await rm(dir, { recursive: true, force: true }); });
  return join(dir, 'state.json');
}

test('theme preference survives reload without altering notes or other component settings', async t => {
  const path = await fixture(t); const store = await StateStore.open(path);
  await store.mutate('note.save', { revision: 0, title: 'Keep', body: 'Keep this note' });
  await store.mutate('settings.patch', { revision: 1, enabled: { theme: false } });
  const restored = await StateStore.open(path);
  assert.equal(restored.snapshot.settings.enabled.theme, false);
  assert.equal(restored.snapshot.settings.enabled.notes, true);
  assert.equal(restored.snapshot.notes[0]?.body, 'Keep this note');
  await assert.rejects(restored.mutate('settings.patch', { revision: 2, enabled: { theme: 'yes' } }), /boolean/);
});

test('translation history queues alongside notes, survives restart and clears without affecting notes',async t=>{
 const path=await fixture(t),store=await StateStore.open(path);
 await store.mutate('note.save',{revision:0,title:'keep',body:'native note'});
 await store.appendTranslation({text:'Hello',translation:'你好',source:'en',target:'zh',model:'gpt-5.6-sol / medium'});
 await store.mutate('settings.patch',{revision:2,enabled:{motion:false,translation:true}});
 const restored=await StateStore.open(path);assert.equal(restored.snapshot.translations?.[0]?.translation,'你好');assert.equal(restored.snapshot.settings.enabled.motion,false);
 await restored.mutate('translation.clear',{revision:3});const again=await StateStore.open(path);assert.deepEqual(again.snapshot.translations,[]);assert.equal(again.snapshot.notes[0]?.body,'native note');
});

test('translation history retains the most recent 50 records and protects stored input from mutation',async t=>{
 const path=await fixture(t),store=await StateStore.open(path);
 for(let i=0;i<52;i++)await store.appendTranslation({text:String(i),translation:String(i),source:'en',target:'zh',model:'sol'});
 const saved=(await StateStore.open(path)).snapshot;assert.equal(saved.translations?.length,50);assert.equal(saved.translations?.[0]?.text,'2');assert.equal(saved.translations?.at(-1)?.text,'51');
});

test('a saved note survives reload and stale windows cannot overwrite it', async t => {
  const path = await fixture(t); const store = await StateStore.open(path);
  await store.mutate('note.save', { revision: 0, title: 'Ideas', body: 'Remember this' });
  await assert.rejects(store.mutate('note.save', { revision: 0, title: 'Stale', body: 'wrong' }), /changed|refresh/i);
  const restored = await StateStore.open(path);
  assert.equal(restored.snapshot.notes[0]?.body, 'Remember this');
  assert.equal(restored.snapshot.revision, 1);
  const snapshot = restored.snapshot; snapshot.notes.length = 0;
  assert.equal(restored.snapshot.notes.length, 1);
});

test('concurrent stale writes cannot silently lose data', async t => {
  const store = await StateStore.open(await fixture(t));
  const results = await Promise.allSettled(['a', 'b'].map(title => store.mutate('note.save', { revision: 0, title, body: title })));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(store.snapshot.notes.length, 1);
});

test('corrupt state is preserved and never replaced with empty state', async t => {
  const path = await fixture(t); await writeFile(path, '{broken');
  await assert.rejects(StateStore.open(path), /preserv|invalid|corrupt/i);
  assert.equal(await readFile(path, 'utf8'), '{broken');
});

test('hostile or invalid mutation does not change persisted state', async t => {
  const store = await StateStore.open(await fixture(t));
  await assert.rejects(store.mutate('settings.patch', { revision: 0, enabled: { notes: 'yes' } }), /boolean/i);
  await assert.rejects(store.mutate('note.save', { revision: 0, title: 'x', body: 'x'.repeat(100001) }), /100000/);
  await assert.rejects(store.mutate('note.delete', { revision: 0, id: 'missing' }), /not found/i);
  assert.equal(store.snapshot.revision, 0);
});

test('bookmark URLs cannot execute code or arbitrary local protocols', () => {
  assert.equal(validateLink('https://example.com/read?q=a'), 'https://example.com/read?q=a');
  assert.equal(validateLink('codex://threads/11111111-1111-4111-8111-111111111111'), 'codex://threads/11111111-1111-4111-8111-111111111111');
  for (const url of ['javascript:alert(1)', 'file:///C:/secret', 'http://localhost/', 'https://user:pass@example.com', 'codex://threads/new?path=C:/', 'codex://threads/%2e%2e/secrets', 'codex://settings', 'https://example.com\n']) {
    assert.throws(() => validateLink(url), Error, url);
  }
});

test('unsafe, incompatible, and duplicate loaded records are preserved', async t => {
  const path = await fixture(t); const store = await StateStore.open(path);
  const good = await store.mutate('note.save', { revision: 0, title: 'Safe', body: 'Text' });
  const candidates: unknown[] = [
    { ...good, version: 2 },
    { ...good, revision: -1 },
    { ...good, notes: [...good.notes, ...good.notes] },
    { ...good, notes: [{ ...good.notes[0], threadUrl: 'javascript:alert(1)' }] },
    { ...good, settings: { ...good.settings, panelPinned: 'true' } },
    { ...good, notes: [{ ...good.notes[0], body: 'x'.repeat(100001) }] },
    { ...good, notes: [{ ...good.notes[0], createdAt: 'yesterday' }] },
    { ...good, extra: 'unrecognized' },
  ];
  for (const candidate of candidates) {
    const raw = JSON.stringify(candidate); await writeFile(path, raw);
    await assert.rejects(StateStore.open(path), /preserv|invalid|unsupported/i);
    assert.equal(await readFile(path, 'utf8'), raw);
  }
});

test('failed atomic replacement preserves memory and can be retried', async t => {
  const path = await fixture(t); const store = await StateStore.open(path);
  await mkdir(path);
  await assert.rejects(store.mutate('note.save', { revision: 0, title: 'Cannot write', body: 'Text' }));
  assert.equal(store.snapshot.revision, 0);
  assert.equal(store.snapshot.notes.length, 0);
  await rm(path, { recursive: true });
  await store.mutate('note.save', { revision: 0, title: 'Retry', body: 'Text' });
  assert.equal(store.snapshot.revision, 1);
  assert.deepEqual(await readdir(join(path, '..')), ['state.json']);
});

test('updates retain identity and creation time; deletes and partial settings persist', async t => {
  const path = await fixture(t); const store = await StateStore.open(path);
  let state = await store.mutate('note.save', { revision: 0, title: '', body: 'Draft', threadUrl: 'https://example.com/read' });
  const note = state.notes[0]!;
  assert.match(note.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  state = await store.mutate('note.save', { revision: 1, id: note.id, title: 'Finished', body: 'Edited' });
  assert.equal(state.notes[0]!.createdAt, note.createdAt);
  assert.equal(state.notes[0]!.threadUrl, undefined);
  state = await store.mutate('bookmark.save', { revision: 2, title: 'Link', url: 'https://example.com/read', excerpt: '<script>literal</script>' });
  const bookmark = state.bookmarks[0]!;
  state = await store.mutate('bookmark.save', { revision: 3, id: bookmark.id, title: 'Updated', url: 'https://example.com/new', excerpt: '' });
  assert.equal(state.bookmarks[0]!.createdAt, bookmark.createdAt);
  state = await store.mutate('settings.patch', { revision: 4, enabled: { notes: false }, panelPinned: true, locale: 'en' });
  assert.deepEqual(state.settings, { enabled: { quota: true, notes: false, bookmarks: true }, panelPinned: true, locale: 'en' });
  await store.mutate('note.delete', { revision: 5, id: note.id });
  await store.mutate('bookmark.delete', { revision: 6, id: bookmark.id });
  const loaded = (await StateStore.open(path)).snapshot;
  assert.equal(loaded.revision, 7); assert.deepEqual(loaded.notes, []); assert.deepEqual(loaded.bookmarks, []);
  assert.equal(loaded.settings.locale, 'en');
});

test('store rejects unknown keys, prototype-bearing inputs, and queued input changes', async t => {
  const store = await StateStore.open(await fixture(t));
  for (const payload of [
    JSON.parse('{"revision":0,"enabled":{"__proto__":{"polluted":true}}}'),
    Object.assign(Object.create({ panelPinned: true }), { revision: 0 }),
    { revision: 0, enabled: { unknown: true } },
    { revision: 0, constructor: { prototype: { polluted: true } } },
  ]) await assert.rejects(store.mutate('settings.patch', payload));
  const payload = { revision: 0, title: 'Original', body: 'Text' };
  const pending = store.mutate('note.save', payload); payload.title = 'Changed later';
  await pending;
  assert.equal(store.snapshot.notes[0]!.title, 'Original');
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('loaded collection limits also apply to the next new record', async t => {
  const path = await fixture(t); const store = await StateStore.open(path);
  const state = await store.mutate('note.save', { revision: 0, title: 'One', body: 'Text' });
  state.notes = Array.from({ length: 500 }, (_, index) => ({ ...state.notes[0]!, id: `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  await writeFile(path, JSON.stringify(state));
  const full = await StateStore.open(path);
  await assert.rejects(full.mutate('note.save', { revision: 1, title: 'Overflow', body: 'Text' }), /500/);
  await full.mutate('note.save', { revision: 1, id: state.notes[0]!.id, title: 'Edit allowed', body: 'Text' });
  assert.equal(full.snapshot.notes.length, 500);
});

test('aggregate storage budget rejects oversized loads and writes without losing data', async t => {
  const path = await fixture(t); const store = await StateStore.open(path);
  const state = await store.mutate('note.save', { revision: 0, title: 'One', body: 'x'.repeat(100000) });
  state.notes = Array.from({ length: 19 }, (_, index) => ({ ...state.notes[0]!, id: `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  const original = JSON.stringify(state); await writeFile(path, original);
  const nearlyFull = await StateStore.open(path);
  await assert.rejects(nearlyFull.mutate('note.save', { revision: 1, title: 'Too much', body: 'x'.repeat(100000) }), /2,?000,?000|2 MB/);
  assert.equal(nearlyFull.snapshot.revision, 1);
  assert.equal(await readFile(path, 'utf8'), original);
  const oversized = original + ' '.repeat(100000); await writeFile(path, oversized);
  await assert.rejects(StateStore.open(path), /preserved/);
  assert.equal(await readFile(path, 'utf8'), oversized);
});
