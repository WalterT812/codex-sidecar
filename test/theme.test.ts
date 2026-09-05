import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createNativeTheme, nativeThemeCss } from '../src/renderer/theme.js';

test('whole-window theme preserves native controls, drafts, listeners, and exact restore', () => {
  const dom = new JSDOM('<html style="--codex-base-accent:#00a240"><head><style id="native">button{color:red}</style></head><body><div id="root"><aside data-app-shell-left-panel-appearance="default"><button>Native</button></aside><main data-app-shell-main-surface="default"><textarea>my draft</textarea></main></div></body></html>');
  const doc = dom.window.document;
  const before = doc.documentElement.outerHTML;
  const input = doc.querySelector('textarea')!;
  input.value = 'unsent draft'; input.setSelectionRange(2, 7);
  let clicked = 0; doc.querySelector('button')!.onclick = () => { clicked++; };
  const theme = createNativeTheme(doc, 'data:image/png;base64,aGVsbG8=');
  assert.ok(theme);
  theme.setEnabled(true); theme.setEnabled(true);
  assert.equal(doc.querySelectorAll('#codex-sidecar-native-theme').length, 1);
  assert.equal(doc.documentElement.dataset.codexSidecarTheme, 'pearl');
  assert.equal(doc.querySelector('textarea'), input);
  assert.equal(input.value, 'unsent draft'); assert.equal(input.selectionStart, 2);
  doc.querySelector('button')!.click(); assert.equal(clicked, 1);
  theme.setEnabled(false);
  assert.equal(doc.documentElement.outerHTML, before);
  theme.setEnabled(true); theme.destroy(); theme.destroy();
  assert.equal(doc.documentElement.outerHTML, before);
  dom.window.close();
});

test('theme refuses unknown surfaces and occupied ownership markers', () => {
  for (const markup of ['<main>other app</main>', '<main data-app-shell-main-surface="default"></main><style id="codex-sidecar-native-theme">:root{--foreign:1}</style>']) {
    const dom = new JSDOM(markup); const before = dom.window.document.documentElement.outerHTML;
    assert.equal(createNativeTheme(dom.window.document, ''), null);
    assert.equal(dom.window.document.documentElement.outerHTML, before); dom.window.close();
  }
});

test('theme accepts only bundled PNG data and covers semantic surfaces without external CSS requests', () => {
  assert.throws(() => nativeThemeCss('https://example.org/wallpaper.png'), /bundled/);
  assert.throws(() => nativeThemeCss('data:image/svg+xml,<svg onload=alert(1)>'), /bundled/);
  const css = nativeThemeCss('');
  for (const anchor of ['data-app-action-sidebar-thread-row', 'data-user-message-bubble', 'data-composer-surface-variant', '[role="dialog"]', 'data-app-shell-left-panel-appearance']) assert.ok(css.includes(anchor));
  assert.doesNotMatch(css, /@import|https?:\/\//);
});
