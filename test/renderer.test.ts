import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { mountSidecar } from '../src/renderer/index.js';
import { currentThreadUrl, dateLabel, periodLabel, validLink } from '../src/renderer/components.js';
import type { BridgeRequest, QuotaSnapshot, StoredState } from '../src/shared/types.js';

const makeState = (): StoredState => ({
  version: 1, revision: 7,
  settings: { locale: 'en', enabled: { notes: true, bookmarks: true, quota: true }, panelPinned: false },
  notes: [], bookmarks: [],
});
const unknownQuota = (): QuotaSnapshot => ({ fetchedAt: new Date().toISOString(), windows: [] });
function setup(options: { state?: StoredState; quota?: QuotaSnapshot; demo?: boolean; native?: boolean } = {}) {
  const body = options.native ? '<div id="root"><main id="native-chat" data-app-shell-main-surface="default"><header data-pip-obstacle="app-shell-header" data-app-shell-header-layout="default"></header><textarea>Native conversation input</textarea></main></div>' : '<header id="sidecar-demo-titlebar"><button>Native action</button></header><main id="native-chat"><textarea>Native conversation input</textarea></main>';
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: 'https://sidecar-demo.example/', pretendToBeVisual: true });
  const win = dom.window as unknown as Window;
  if (options.native) {
    win.document.querySelector('header')!.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 1024, 48);
  }
  win.__CODEX_SIDECAR_BOOT__ = { demo: options.demo ?? true, version: 'test' };
  const requests: BridgeRequest[] = [];
  win.__codexSidecarSend = value => { requests.push(JSON.parse(value) as BridgeRequest); };
  const api = mountSidecar(win)!;
  if (api) api.receive({ type: 'snapshot', state: options.state ?? makeState(), quota: options.quota ?? unknownQuota() });
  const shadow = win.document.getElementById('codex-sidecar-root')?.shadowRoot;
  function query<T extends HTMLElement = HTMLElement>(testId: string): T {
    const found = shadow?.querySelector<T>(`[data-testid="${testId}"]`);
    assert.ok(found, `Missing ${testId}`);
    return found;
  }
  function input(testId: string, value: string): HTMLInputElement {
    const field = query<HTMLInputElement>(testId); field.value = value; field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); return field;
  }
  return { dom, win, api, requests, shadow, query, input, close() { win.__CODEX_SIDECAR__?.destroy(); dom.window.close(); } };
}

test('mount is idempotent, handshake is sent, and destroy leaves native content intact', () => {
  const app = setup();
  try {
    const native = app.win.document.getElementById('native-chat');
    const oldHost = app.win.document.getElementById('codex-sidecar-root');
    assert.equal(app.requests[0]?.action, 'ui.ready');
    const second = mountSidecar(app.win);
    assert.ok(second);
    assert.equal(oldHost?.isConnected, false);
    assert.equal(app.win.document.querySelectorAll('#codex-sidecar-root').length, 1);
    app.api.destroy(); // An obsolete API cannot delete the replacement root.
    assert.equal(app.win.document.querySelectorAll('#codex-sidecar-root').length, 1);
    second.destroy(); second.destroy();
    assert.equal(app.win.document.querySelector('#codex-sidecar-root'), null);
    assert.equal(app.win.__CODEX_SIDECAR__, undefined);
    assert.equal(app.win.document.getElementById('native-chat'), native);
    assert.equal(native?.querySelector('textarea')?.value, 'Native conversation input');
  } finally { app.close(); }
});

test('quota shows the shared Codex week first and never substitutes Spark or unknown model pools', () => {
  const makeWindow = (id: string, minutes: number, remaining: number | null) => ({ id, label: id.startsWith('codex:') ? 'Codex' : 'GPT-5.3-Codex-Spark', usedPercent: remaining === null ? null : 100 - remaining, remainingPercent: remaining, windowDurationMins: minutes, resetsAt: null });
  const quota: QuotaSnapshot = { fetchedAt: new Date().toISOString(), windows: [makeWindow('codex_bengalfox:primary', 300, 100), makeWindow('codex_bengalfox:secondary', 10080, 100), makeWindow('codex:primary', 300, 70), makeWindow('codex:secondary', 10080, 38)] };
  const app = setup({ quota });
  try {
    assert.match(app.query('quota-chip').textContent!, /Codex.*7d 38%/);
    assert.ok(app.query('quota-chip').textContent!.indexOf('7d') < app.query('quota-chip').textContent!.indexOf('5h'));
    assert.doesNotMatch(app.query('quota-summary').textContent!, /Spark|100%/);
    app.api.receive({ type: 'snapshot', state: makeState(), quota: { ...quota, windows: quota.windows.slice(0, 2) } });
    assert.match(app.query('quota-chip').textContent!, /unknown/i);
    assert.doesNotMatch(app.query('quota-chip').textContent!, /100%/);
    app.api.receive({ type: 'snapshot', state: makeState(), quota: { ...quota, windows: [makeWindow('codex:primary', 10080, null)] } });
    assert.match(app.query('quota-chip').textContent!, /7d —/);
  } finally { app.close(); }
});

test('native theme switch restores the whole window and preserves unsent native input', () => {
  const app = setup({ native: true, demo: false });
  try {
    const input = app.win.document.querySelector('textarea')!;
    input.value = 'Keep my native draft';
    assert.equal(app.win.document.documentElement.dataset.codexSidecarTheme, 'pearl');
    app.query('settings-open').click();
    const toggle = app.query<HTMLInputElement>('setting-theme'); toggle.click();
    assert.deepEqual(app.requests.at(-1)?.payload, { enabled: { theme: false }, revision: 7 });
    const state = makeState(); state.revision = 8; state.settings.enabled.theme = false;
    app.api.receive({ type: 'snapshot', state, quota: unknownQuota() });
    assert.equal(app.win.document.getElementById('codex-sidecar-native-theme'), null);
    assert.equal(app.win.document.documentElement.hasAttribute('data-codex-sidecar-theme'), false);
    assert.equal(app.win.document.querySelector('textarea'), input);
    assert.equal(input.value, 'Keep my native draft');
    state.revision = 9; state.settings.enabled.theme = true;
    app.api.receive({ type: 'snapshot', state, quota: unknownQuota() });
    assert.equal(app.win.document.documentElement.dataset.codexSidecarTheme, 'pearl');
  } finally { app.close(); }
});

test('production refuses an unsupported page without changing native DOM', () => {
  const app = setup({ demo: false });
  try {
    assert.equal(app.api, null);
    assert.equal(app.win.document.querySelector('#codex-sidecar-root'), null);
    assert.match(app.win.__CODEX_SIDECAR_DIAGNOSTIC__ ?? '', /supported app shell/);
    assert.equal(app.win.document.querySelector('main textarea')?.textContent, 'Native conversation input');
  } finally { app.close(); }
});

test('production accepts the source-backed native shell even when header actions are empty', () => {
  const app = setup({ demo: false, native: true });
  try {
    assert.ok(app.api);
    assert.equal(app.win.__CODEX_SIDECAR_DIAGNOSTIC__, undefined);
    assert.ok(app.query('drawer-trigger'));
    assert.equal(app.win.document.querySelector('header button'), null);
    assert.equal(app.win.document.querySelector('main textarea')?.textContent, 'Native conversation input');
    assert.equal(app.query('quota-chip').style.visibility, 'visible');
  } finally { app.close(); }
});

test('production rejects generic, partial, and hidden native-looking headers', () => {
  for (const change of ['main-marker', 'header-marker', 'hidden'] as const) {
    const app = setup({ demo: false, native: true });
    try {
      const header = app.win.document.querySelector('header')!;
      if (change === 'main-marker') app.win.document.querySelector('main')!.removeAttribute('data-app-shell-main-surface');
      else if (change === 'header-marker') header.removeAttribute('data-pip-obstacle');
      else header.hidden = true;
      assert.equal(mountSidecar(app.win), null, change);
      assert.equal(app.win.document.querySelector('#codex-sidecar-root'), null);
      assert.match(app.win.__CODEX_SIDECAR_DIAGNOSTIC__ ?? '', /supported app shell/);
    } finally { app.close(); }
  }
});

test('source-backed header obstacles and page titles cannot be covered by the quota chip', () => {
  const app = setup({ demo: false, native: true });
  try {
    const header = app.win.document.querySelector('header')!;
    const tabs = app.win.document.createElement('div');
    tabs.setAttribute('data-app-shell-header-obstacle', 'true');
    tabs.getBoundingClientRect = () => new app.dom.window.DOMRect(600, 0, 300, 48);
    header.append(tabs);
    app.win.dispatchEvent(new app.dom.window.Event('resize'));
    assert.equal(app.query('quota-chip').style.right, '434px');
    const title = app.win.document.createElement('div');
    title.setAttribute('data-app-shell-page-header', 'true');
    title.textContent = 'Native title';
    title.getBoundingClientRect = () => new app.dom.window.DOMRect(0, 0, 590, 48);
    header.prepend(title);
    app.win.dispatchEvent(new app.dom.window.Event('resize'));
    assert.equal(app.query('quota-chip').style.visibility, 'hidden');
    assert.ok(app.query('drawer-trigger'));
    assert.equal(title.textContent, 'Native title');
    assert.equal(header.children.length, 2);
  } finally { app.close(); }
});

test('stored and user text is rendered literally without HTML interpretation', () => {
  const state = makeState();
  state.notes.push({ id: 'note-1', title: '<img src=x onerror=alert(1)>', body: '<script>evil()</script> & plain text', createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z' });
  const app = setup({ state });
  try {
    assert.match(app.query('note-card').textContent ?? '', /<img src=x onerror=alert\(1\)>/);
    assert.match(app.query('note-card').textContent ?? '', /<script>evil\(\)<\/script>/);
    assert.equal(app.shadow?.querySelector('img, script'), null);
    app.query<HTMLButtonElement>('note-edit').click();
    assert.equal(app.query<HTMLInputElement>('editor-title').value, state.notes[0]?.title);
  } finally { app.close(); }
});

test('unknown and stale quota never render fabricated percentages', () => {
  const app = setup();
  try {
    assert.match(app.query('quota-chip').textContent ?? '', /Quota unknown/);
    assert.match(app.query('quota-summary').textContent ?? '', /unavailable/);
    assert.doesNotMatch(app.query('quota-summary').textContent ?? '', /100%|0%/);
    app.api.receive({ type: 'snapshot', state: makeState(), quota: { fetchedAt: '2020-01-01T00:00:00Z', windows: [{ id: 'codex:primary', label: 'Codex', usedPercent: null, remainingPercent: null, resetsAt: null, windowDurationMins: 300 }] } });
    assert.match(app.query('quota-chip').textContent ?? '', /Stale/);
    assert.match(app.query('quota-summary').textContent ?? '', /5h/);
    assert.match(app.query('quota-summary').textContent ?? '', /Unknown/);
    assert.equal(app.shadow?.querySelector('.quota-value')?.textContent, '—');
  } finally { app.close(); }
});

test('drawer click, deliberate hover, scoped Escape, and pin preference work', async () => {
  const app = setup();
  try {
    assert.equal(app.query('drawer').hidden, true);
    app.query<HTMLButtonElement>('drawer-trigger').click();
    assert.equal(app.query('drawer').hidden, false);
    assert.equal(app.query('drawer-trigger').getAttribute('aria-expanded'), 'true');
    app.query('drawer').dispatchEvent(new app.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(app.query('drawer').hidden, true);
    app.query('drawer-trigger').dispatchEvent(new app.dom.window.Event('pointerenter'));
    assert.equal(app.query('drawer').hidden, true);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(app.query('drawer').hidden, false);
    app.win.document.querySelector('main textarea')?.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(app.query('drawer').hidden, false, 'Native input Escape must not be intercepted');
    app.query<HTMLButtonElement>('drawer-pin').click();
    assert.deepEqual(app.requests.at(-1)?.payload, { panelPinned: true, revision: 7 });
    const state = makeState(); state.settings.panelPinned = true; state.revision = 8;
    app.api.receive({ type: 'snapshot', state, quota: unknownQuota() });
    assert.equal(app.query('drawer-pin').getAttribute('aria-pressed'), 'true');
    app.query('drawer').dispatchEvent(new app.dom.window.Event('pointerleave'));
    await new Promise(resolve => setTimeout(resolve, 360));
    assert.equal(app.query('drawer').hidden, false);
  } finally { app.close(); }
});

test('quota snapshots preserve draft input nodes, caret, and revision payload', () => {
  const app = setup();
  try {
    app.query<HTMLButtonElement>('new-note').click();
    app.input('editor-title', 'My draft');
    const body = app.input('editor-body', 'A thought with <literal> markup');
    body.focus(); body.setSelectionRange(4, 11);
    app.api.receive({ type: 'snapshot', state: makeState(), quota: unknownQuota() });
    assert.equal(app.query('editor-body'), body);
    assert.equal(app.shadow?.activeElement, body);
    assert.equal(body.selectionStart, 4);
    assert.equal(body.selectionEnd, 11);
    app.query<HTMLButtonElement>('editor-save').click();
    assert.equal(app.requests.at(-1)?.action, 'note.save');
    assert.deepEqual(app.requests.at(-1)?.payload, { title: 'My draft', body: 'A thought with <literal> markup', revision: 7 });
    assert.equal('threadUrl' in app.requests.at(-1)!.payload, false);
  } finally { app.close(); }
});

test('concurrent revision changes keep draft and require an explicit revision update', () => {
  const app = setup();
  try {
    app.query<HTMLButtonElement>('new-note').click();
    app.input('editor-title', 'Keep this'); app.input('editor-body', 'Original draft');
    const newState = makeState(); newState.revision = 9;
    app.api.receive({ type: 'snapshot', state: newState, quota: unknownQuota() });
    assert.equal(app.query('revision-conflict').hidden, false);
    const before = app.requests.length;
    app.query<HTMLButtonElement>('editor-save').click();
    assert.equal(app.requests.length, before);
    app.query<HTMLButtonElement>('revision-adopt').click();
    app.query<HTMLButtonElement>('editor-save').click();
    assert.equal(app.requests.at(-1)?.payload.revision, 9);
    assert.equal(app.requests.at(-1)?.payload.body, 'Original draft');
    const save = app.requests.at(-1)!;
    app.api.receive({ type: 'result', id: save.id, ok: false, error: 'Disk write failed' });
    assert.match(app.query('operation-status').textContent ?? '', /Disk write failed/);
    assert.equal(app.query<HTMLInputElement>('editor-body').value, 'Original draft');
    assert.equal(app.query<HTMLButtonElement>('editor-save').disabled, false);
  } finally { app.close(); }
});

test('bookmark save uses a validated manual link and exact flat bridge payload', () => {
  const app = setup();
  try {
    app.query<HTMLButtonElement>('tab-bookmarks').click();
    app.query<HTMLButtonElement>('new-bookmark').click();
    app.input('editor-title', 'Read again'); app.input('editor-body', 'My own excerpt');
    app.input('editor-url', 'javascript:alert(1)');
    const count = app.requests.length;
    app.query<HTMLButtonElement>('editor-save').click();
    assert.equal(app.requests.length, count);
    assert.match(app.query('operation-status').textContent ?? '', /valid HTTPS/);
    app.input('editor-url', 'https://example.com/conversation');
    app.query<HTMLButtonElement>('editor-save').click();
    assert.equal(app.requests.at(-1)?.action, 'bookmark.save');
    assert.deepEqual(app.requests.at(-1)?.payload, { title: 'Read again', url: 'https://example.com/conversation', excerpt: 'My own excerpt', revision: 7 });
  } finally { app.close(); }
});

test('master settings stay available when every component is disabled', () => {
  const state = makeState(); state.settings.enabled = { quota: false, notes: false, bookmarks: false, translation: false };
  const app = setup({ state });
  try {
    assert.equal(app.query('quota-chip').hidden, true);
    assert.equal(app.query('quota-summary').hidden, true);
    assert.equal(app.query<HTMLButtonElement>('drawer-trigger').disabled, false);
    app.query<HTMLButtonElement>('drawer-trigger').click();
    assert.equal(app.query('drawer').hidden, false);
    const toggle = app.query<HTMLInputElement>('setting-notes'); toggle.click();
    assert.deepEqual(app.requests.at(-1)?.payload, { enabled: { notes: true }, revision: 7 });
    const request = app.requests.at(-1)!;
    app.api.receive({ type: 'result', id: request.id, ok: false, error: 'Settings could not be saved' });
    assert.equal(app.query<HTMLInputElement>('setting-notes').disabled, false);
    assert.equal(app.query<HTMLInputElement>('setting-notes').checked, false);
  } finally { app.close(); }
});

test('tab keyboard navigation focuses the newly selected tab', () => {
  const app = setup();
  try {
    app.query<HTMLButtonElement>('drawer-trigger').click();
    const notes = app.query('tab-notes'); notes.focus();
    notes.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(app.query('tab-bookmarks').getAttribute('aria-selected'), 'true');
    assert.equal(app.shadow?.activeElement, app.query('tab-bookmarks'));
  } finally { app.close(); }
});

test('destroy cancels pending hover so removed components cannot reopen', async () => {
  const app = setup();
  try {
    app.query('drawer-trigger').dispatchEvent(new app.dom.window.Event('pointerenter'));
    app.api.destroy();
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(app.win.document.getElementById('codex-sidecar-root'), null);
    assert.equal(app.query('drawer').hidden, true);
  } finally { app.close(); }
});

test('link and date helpers preserve protocol and unknown-value boundaries', () => {
  assert.equal(validLink('codex://threads/11111111-2222-3333-4444-555555555555'), true);
  for (const link of ['codex://threads/guessed', 'file:///C:/private', 'javascript:alert(1)', 'https://user:secret@example.com', 'codex://threads/11111111-2222-3333-4444-555555555555?cmd=run']) assert.equal(validLink(link), false, link);
  assert.equal(currentThreadUrl({ href: 'https://sidecar-demo.example/' } as Location), undefined);
  assert.equal(periodLabel(null, 'Unknown period', false), 'Unknown period');
  assert.equal(periodLabel(10_080, 'Weekly', false), '7d');
  assert.equal(dateLabel(null, 'en'), 'Unknown');
});

test('bundled artwork is optional, isolated, default-on, and independently configurable', () => {
  const ambient = globalThis as unknown as { __SIDECAR_ART_URL__?: string };
  ambient.__SIDECAR_ART_URL__ = 'data:image/png;base64,iVBORw0KGgo=';
  const app = setup();
  try {
    const nativeBefore = app.win.document.getElementById('native-chat')?.outerHTML;
    const picture = app.query('artwork-cover').querySelector('img');
    assert.ok(picture);
    assert.equal(picture.src, ambient.__SIDECAR_ART_URL__);
    assert.equal(picture.alt, '');
    assert.equal(app.win.document.querySelector('img'), null, 'Artwork stays entirely inside the Shadow DOM');
    app.query<HTMLButtonElement>('tab-bookmarks').click();
    assert.ok(app.query('artwork-cover'));
    app.query<HTMLButtonElement>('settings-open').click();
    assert.equal(app.shadow?.querySelector('[data-testid="artwork-cover"]'), null);
    const toggle = app.query<HTMLInputElement>('setting-artwork');
    assert.equal(toggle.checked, true, 'Older stores without artwork enabled default to on');
    toggle.click();
    assert.equal(app.requests.at(-1)?.action, 'settings.patch');
    assert.deepEqual(app.requests.at(-1)?.payload, { enabled: { artwork: false }, revision: 7 });
    const disabled = makeState(); disabled.revision = 8; disabled.settings.enabled.artwork = false;
    app.api.receive({ type: 'snapshot', state: disabled, quota: unknownQuota() });
    app.query<HTMLButtonElement>('settings-open').click();
    assert.equal(app.shadow?.querySelector('[data-testid="artwork-cover"]'), null);
    assert.equal(app.win.document.getElementById('native-chat')?.outerHTML, nativeBefore);
  } finally { app.close(); delete ambient.__SIDECAR_ART_URL__; }
});

test('artwork updates preserve the active editor and quota refresh preserves its caret', () => {
  const ambient = globalThis as unknown as { __SIDECAR_ART_URL__?: string };
  ambient.__SIDECAR_ART_URL__ = 'data:image/png;base64,iVBORw0KGgo=';
  const app = setup();
  try {
    app.query<HTMLButtonElement>('new-note').click();
    assert.equal(app.shadow?.querySelector('[data-testid="artwork-cover"]'), null);
    const body = app.input('editor-body', 'Artwork must not replace this draft.');
    body.focus(); body.setSelectionRange(8, 12);
    const changed = makeState(); changed.revision = 8; changed.settings.enabled.artwork = false;
    app.api.receive({ type: 'snapshot', state: changed, quota: unknownQuota() });
    app.api.receive({ type: 'snapshot', state: changed, quota: unknownQuota() });
    assert.equal(app.query('editor-body'), body);
    assert.equal(body.value, 'Artwork must not replace this draft.');
    assert.equal(body.selectionStart, 8);
    assert.equal(body.selectionEnd, 12);
    assert.equal(app.shadow?.activeElement, body);
    assert.equal(app.shadow?.querySelector('[data-testid="artwork-cover"]'), null);
  } finally { app.close(); delete ambient.__SIDECAR_ART_URL__; }
});

test('native summary clicks and Sidecar opening remain independent',()=>{
 const app=setup({native:true,demo:false});
 try{
  const summary=app.win.document.createElement('button');summary.setAttribute('aria-label','Toggle pinned summary');summary.setAttribute('aria-pressed','true');
  let clicks=0;summary.onclick=()=>{clicks++;summary.setAttribute('aria-pressed',String(summary.getAttribute('aria-pressed')!=='true'));};
  app.win.document.querySelector('header')!.append(summary);
  app.query('drawer-trigger').click();assert.equal(clicks,0);assert.equal(summary.getAttribute('aria-pressed'),'true');
  summary.click();assert.equal(app.query('drawer').hidden,false);summary.click();assert.equal(app.query('drawer').hidden,false);
  app.query('drawer-close').click();assert.equal(summary.getAttribute('aria-pressed'),'true');
  app.api.destroy();assert.equal(clicks,2);
 }finally{app.close();}
});

test('notes, bookmarks and translation open concurrently without duplicate visible tabs',()=>{
 const app=setup();try{
  for(const kind of ['notes','bookmarks','translation'])app.query('rail-'+kind).click();
  const doc=app.win.document,book=doc.getElementById('codex-sidecar-root-bookmarks')!.shadowRoot!,translation=doc.getElementById('codex-sidecar-root-translation')!.shadowRoot!;
  for(const shadow of [app.shadow!,book,translation]){assert.equal((shadow.querySelector('.drawer') as HTMLElement).hidden,false);assert.equal((shadow.querySelector('.tabs') as HTMLElement).hidden,true);}
  (translation.querySelector('[data-testid="translate-input"]') as HTMLTextAreaElement).value='Preserve my translation';
  (book.querySelector('[data-testid="new-bookmark"]') as HTMLButtonElement).click();
  const title=book.querySelector('[data-testid="editor-title"]') as HTMLInputElement;title.value='My bookmark';title.dispatchEvent(new app.dom.window.Event('input',{bubbles:true}));
  (book.querySelector('[data-testid="drawer-close"]') as HTMLButtonElement).click();
  assert.equal((translation.querySelector('.drawer') as HTMLElement).hidden,false);
  app.query('rail-bookmarks').click();assert.equal((book.querySelector('[data-testid="editor-title"]') as HTMLInputElement).value,'My bookmark');assert.equal((translation.querySelector('[data-testid="translate-input"]') as HTMLTextAreaElement).value,'Preserve my translation');
  app.api.destroy();assert.equal(doc.querySelectorAll('[id^="codex-sidecar-root"]').length,0);
 }finally{app.close()}
});
test('translation results are delivered only to the requesting tool window',async()=>{
 const app=setup();try{
  app.query('rail-translation').click();const shadow=app.win.document.getElementById('codex-sidecar-root-translation')!.shadowRoot!;
  (shadow.querySelector('[data-testid="translate-input"]') as HTMLTextAreaElement).value='A clear space.';
  shadow.querySelector('form')!.dispatchEvent(new app.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  const request=app.requests.find(r=>r.action==='translate')!;assert.ok(request);assert.match(request.id,/sidecar-translation-/);
  app.api.receive({type:'result',id:request.id,ok:true,translation:'一个清晰的空间。'});await new Promise(r=>setImmediate(r));
  assert.equal((shadow.querySelector('[data-testid="translate-output"]') as HTMLTextAreaElement).value,'一个清晰的空间。');
  assert.equal(app.shadow!.querySelector('[data-testid="translate-output"]'),null);
 }finally{app.close()}
});
