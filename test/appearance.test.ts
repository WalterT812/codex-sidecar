import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createAppearance} from '../src/renderer/appearance.js';

test('focus uses a dedicated button and preserves existing open/closed panel state',()=>{
 const dom=new JSDOM('<div data-app-shell-left-panel-appearance style="width:312px"></div><div id="codex-sidecar-personal-tools"><section id="open"></section><section id="closed" hidden></section></div>');
 const win=dom.window as unknown as Window,doc=win.document,appearance=createAppearance(win);
 try{
  appearance.setFocus(true);
  const exit=doc.getElementById('codex-sidecar-exit-focus')!;
  assert.equal(exit.hidden,false);assert.equal(exit.textContent,'退出专注');
  assert.equal(doc.getElementById('open')!.hidden,false);assert.equal(doc.getElementById('closed')!.hidden,true);
  win.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',cancelable:true}));
  assert.equal(appearance.focused,true,'Sidecar must not bind native stop-generation Escape');
  exit.click();assert.equal(appearance.focused,false);
  assert.equal(doc.getElementById('open')!.hidden,false);assert.equal(doc.getElementById('closed')!.hidden,true);
  assert.equal(doc.querySelector('[data-app-shell-left-panel-appearance]')!.getAttribute('style'),'width:312px');
 }finally{appearance.destroy();dom.window.close();}
});
