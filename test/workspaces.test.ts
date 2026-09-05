import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createWorkspaces} from '../src/renderer/workspaces.js';

test('workspace selection filters native records and new-chat routing, then restores exact native DOM',async()=>{
  const dom=new JSDOM(`<aside data-app-shell-left-panel-appearance><button aria-label="New chat">new</button><div data-app-action-sidebar-scroll><section data-app-action-sidebar-section data-app-action-sidebar-section-heading="Recents"><button aria-label="New chat">new</button><a>old chat</a></section><section data-app-action-sidebar-section data-app-action-sidebar-section-heading="学习"><button aria-label="New chat in 学习">new</button><a>course chat</a></section></div></aside>`,{url:'https://test.example'});
  const doc=dom.window.document;const before=doc.body.innerHTML;const old=doc.querySelector('a');
  let creates=0;doc.querySelector<HTMLButtonElement>('[aria-label="New chat in 学习"]')!.onclick=()=>creates++;
  const control=createWorkspaces(dom.window as unknown as Window)!;
  const picker=doc.querySelector<HTMLSelectElement>('select')!;picker.value='学习';picker.dispatchEvent(new dom.window.Event('change'));
  await new Promise(r=>setTimeout(r,10));
  assert.equal(doc.querySelector('[data-app-action-sidebar-section-heading="Recents"]')?.getAttribute('data-codex-sidecar-space-hidden'),'true');
  assert.equal(doc.querySelector('a'),old);
  doc.querySelector<HTMLButtonElement>('aside>button')!.click();assert.equal(creates,1);
  doc.querySelector<HTMLButtonElement>('[data-testid="workspace-new-chat"]')!.click();assert.equal(creates,2);
  control.setEnabled(false);assert.equal(doc.querySelectorAll('[data-codex-sidecar-space-hidden]').length,0);
  control.destroy();await new Promise(r=>setTimeout(r,5));assert.equal(doc.body.innerHTML,before);dom.window.close();
});

test('removed workspace falls back to all records, and native additions refresh without losing selection',async()=>{
 const dom=new JSDOM('<aside data-app-shell-left-panel-appearance><div data-app-action-sidebar-scroll><section data-app-action-sidebar-section data-app-action-sidebar-section-heading="日常"></section></div></aside>',{url:'https://test.example'});
 const doc=dom.window.document,control=createWorkspaces(dom.window as unknown as Window)!;const picker=doc.querySelector('select')!;
 picker.value='日常';picker.dispatchEvent(new dom.window.Event('change'));
 const section=doc.createElement('section');section.setAttribute('data-app-action-sidebar-section','');section.setAttribute('data-app-action-sidebar-section-heading','开发');doc.querySelector('[data-app-action-sidebar-scroll]')!.append(section);
 await new Promise(r=>setTimeout(r,5));assert.equal(picker.value,'日常');assert.equal(picker.options.length,3);
 doc.querySelector('[data-app-action-sidebar-section-heading="日常"]')!.remove();await new Promise(r=>setTimeout(r,5));assert.equal(picker.value,'');assert.equal(doc.querySelectorAll('[data-codex-sidecar-space-hidden]').length,0);
 control.destroy();dom.window.close();
});
