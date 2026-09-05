import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {clampFrame,changeFrame,readFrame,createFloatingFrame} from '../src/renderer/floating.js';
const bounds={width:1200,height:900,top:94},start={x:700,y:250,width:390,height:500};
test('movement stays visible and oversized saved layouts fit a smaller viewport',()=>{
 assert.deepEqual(changeFrame(start,'move',900,-900,bounds),{...start,x:794,y:94});
 const small=clampFrame(start,{width:300,height:330,top:94});assert.deepEqual(small,{x:16,y:94,width:268,height:220});
});
test('resizing west and north preserves opposite edges at minimum size',()=>{
 const f=changeFrame(start,'nw',900,900,bounds);assert.equal(f.width,320);assert.equal(f.height,300);assert.equal(f.x+f.width,start.x+start.width);assert.equal(f.y+f.height,start.y+start.height);
});
test('all eight resize handles stay in viewport',()=>{
 for(const kind of ['n','e','s','w','nw','ne','sw','se'])for(const delta of [-10000,10000]){const f=changeFrame(start,kind,delta,delta,bounds);assert.ok(f.x>=16&&f.y>=94&&f.x+f.width<=1184&&f.y+f.height<=884);assert.ok(f.width>=320&&f.height>=300);}
});
test('malformed or nonnumeric saved frames are ignored',()=>{
 for(const raw of ['bad','null','{}','{"x":0,"y":0,"width":-1,"height":300}','{"x":"16","y":0,"width":320,"height":300}','{"x":1e999,"y":0,"width":320,"height":300}'])assert.equal(readFrame(raw),null);
 assert.deepEqual(readFrame(JSON.stringify(start)),start);
});
function fixture(){
 const dom=new JSDOM('<section><header><button>Settings</button></header></section>',{url:'https://sidecar.example',pretendToBeVisual:true});
 const win=dom.window as unknown as Window,drawer=win.document.querySelector('section')!,header=win.document.querySelector('header')!;
 let visible=start;drawer.getBoundingClientRect=()=>new dom.window.DOMRect(visible.x,visible.y,visible.width,visible.height);
 const mount=()=>createFloatingFrame(win,drawer,header,()=>bounds,()=>{visible=api.current()??start});let api=mount();
 const pointer=(target:EventTarget,type:string,x:number,y:number)=>{const e=new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e)};
 return{dom,win,drawer,header,pointer,get api(){return api},remount(){api.destroy();api=mount();},close(){api.destroy();dom.window.close()}};
}
test('dragging persists, remount restores, and reset returns to default',()=>{
 const f=fixture();try{f.pointer(f.header,'pointerdown',700,250);f.pointer(f.win,'pointermove',500,150);f.pointer(f.win,'pointerup',500,150);assert.deepEqual(f.api.current(),{...start,x:500,y:150});f.remount();assert.equal(f.api.current()?.x,500);f.api.reset();assert.equal(f.api.current(),null);f.remount();assert.equal(f.api.current(),null);}finally{f.close()}
});
test('buttons do not start dragging and cancelled drags restore geometry',()=>{
 const f=fixture();try{f.pointer(f.header.querySelector('button')!,'pointerdown',700,250);assert.equal(f.api.interacting,false);f.pointer(f.header,'pointerdown',700,250);f.pointer(f.win,'pointermove',500,150);assert.equal(f.api.interacting,true);f.pointer(f.win,'pointercancel',500,150);assert.equal(f.api.current(),null);assert.equal(f.api.interacting,false);}finally{f.close()}
});
test('keyboard resize persists and destroying removes handles and listeners',()=>{
 const f=fixture();try{const handle=f.drawer.querySelector('[data-resize="se"]')!;handle.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(f.api.current()?.width,398);f.api.destroy();assert.equal(f.drawer.querySelectorAll('.resize-handle').length,0);f.pointer(f.header,'pointerdown',700,250);assert.equal(f.api.interacting,false);}finally{f.close()}
});
