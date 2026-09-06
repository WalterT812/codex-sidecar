import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createPersonalTools,insertComposer} from '../src/renderer/personal-tools.js';
import type {BridgeRequest,StoredState} from '../src/shared/types.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
function setup(){
 const dom=new JSDOM(`<div data-above-composer-conversation-id="${a}"></div><div data-codex-composer="true" contenteditable="true">existing draft</div>`,{url:'https://sidecar.example',pretendToBeVisual:true});
 const win=dom.window as unknown as Window,requests:BridgeRequest[]=[];win.__codexSidecarSend=json=>requests.push(JSON.parse(json));
 const tools=createPersonalTools(win,()=>{}),shadow=win.document.getElementById('codex-sidecar-personal-tools')!.shadowRoot!;
 const state:StoredState={version:1,revision:0,settings:{locale:'zh-CN',enabled:{quota:true,notes:true,bookmarks:true},panelPinned:false},notes:[],bookmarks:[],library:[]};
 const snapshot=()=>tools.receive({type:'snapshot',state,quota:{fetchedAt:'',windows:[]}});snapshot();
 const button=(name:string)=>{const found=[...shadow.querySelectorAll<HTMLButtonElement>('button')].find(e=>e.textContent===name);assert.ok(found,name);return found;};
 return {dom,win,tools,shadow,state,requests,snapshot,button,close(){tools.destroy();dom.window.close();}};
}
test('personal editors preserve their actual draft nodes and independent visibility across task switches',async()=>{
 const f=setup();try{
  f.tools.open('snippets');f.button('新建').click();const field=f.shadow.querySelector('textarea')!;field.value='unsaved snippet';
  const scope=f.win.document.querySelector('[data-above-composer-conversation-id]')!;scope.setAttribute('data-above-composer-conversation-id',b);await delay(390);
  assert.equal((f.shadow.querySelector('[data-tool="snippets"]') as HTMLElement).hidden,true);
  f.tools.open('snippets');assert.ok(!f.shadow.querySelector('textarea'));
  scope.setAttribute('data-above-composer-conversation-id',a);await delay(390);
  assert.equal(f.shadow.querySelector('textarea'),field);assert.equal(field.value,'unsaved snippet');
 }finally{f.close();}
});
test('snippet insertion preserves native composer editing and never submits a message',()=>{
 const f=setup();try{let calls:unknown[]=[];f.win.document.execCommand=(...args)=>{calls=args;return true;};assert.equal(insertComposer(f.win,'new text'),true);assert.deepEqual(calls,['insertText',false,'\n\nnew text']);assert.equal(f.requests.length,0);}finally{f.close();}
});

test('message bookmark status survives re-hover and resets after its last bookmark is deleted',async()=>{
 const f=setup();try{
  const node=f.win.document.createElement('div');node.dataset.responseAnnotationConversation=a;node.dataset.responseAnnotationTarget='message-1';node.textContent='A useful explanation';f.win.document.body.append(node);
  const hover=()=>node.dispatchEvent(new f.dom.window.MouseEvent('mouseover',{bubbles:true}));hover();
  const button=f.shadow.querySelector<HTMLButtonElement>('[data-testid="personal-收藏消息"]')!;
  button.click();button.click();assert.equal(f.requests.filter(r=>r.action==='bookmark.save').length,1);assert.equal(button.disabled,true);
  const request=f.requests.at(-1)!;
  const bookmark={id:b,title:'Saved',url:'codex://threads/'+a,excerpt:node.textContent,source:{threadId:a,messageId:'message-1',quote:node.textContent},createdAt:'2026-09-06T00:00:00Z'};
  f.state.bookmarks=[bookmark];f.state.revision++;f.snapshot();f.tools.receive({type:'result',id:request.id,ok:true});await delay(0);
  hover();assert.equal(button.textContent,'已收藏');assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(button.disabled,true);
  await f.tools.captureBookmark(bookmark.source,bookmark.excerpt);assert.equal(f.requests.filter(r=>r.action==='bookmark.save').length,1);
  f.state.bookmarks=[];f.state.revision++;f.snapshot();assert.equal(button.textContent,'收藏消息');assert.equal(button.disabled,false);
 }finally{f.close();}
});

test('failed bookmark save leaves the same message available for retry',async()=>{
 const f=setup();try{
  const node=f.win.document.createElement('div');node.dataset.responseAnnotationConversation=a;node.dataset.responseAnnotationTarget='message-2';node.textContent='Retry me';f.win.document.body.append(node);node.dispatchEvent(new f.dom.window.MouseEvent('mouseover',{bubbles:true}));
  const button=f.shadow.querySelector<HTMLButtonElement>('[data-testid="personal-收藏消息"]')!;button.click();const request=f.requests.at(-1)!;
  f.tools.receive({type:'result',id:request.id,ok:false,error:'Storage unavailable'});await delay(0);
  assert.equal(button.disabled,false);assert.notEqual(button.textContent,'已收藏');assert.equal(f.state.bookmarks.length,0);
 }finally{f.close();}
});
test('learning requires an answer and saves student answer and feedback alongside questions',()=>{
 const f=setup();try{
  f.state.library=[{id:a,kind:'learning',title:'Stack',body:'Stack is last in first out.',status:'active',createdAt:'2026-09-05T00:00:00Z',updatedAt:'2026-09-05T00:00:00Z',details:JSON.stringify({questions:[{question:'Which leaves first?',answer:'Last item',evidence:'last in first out'}]})}];f.state.revision++;f.snapshot();f.tools.open('learning');f.button('开始练习').click();f.button('作答后看参考答案').click();assert.ok(!f.shadow.textContent?.includes('参考答案\nLast item'));
  const input=f.shadow.querySelector('textarea')!;input.value='Last inserted';input.dispatchEvent(new f.dom.window.Event('input'));f.button('作答后看参考答案').click();assert.ok(f.shadow.textContent?.includes('Last item'));f.button('保存这次练习').click();const request=f.requests.at(-1)!;assert.equal(JSON.parse(request.payload.details as string).questions[0].studentAnswer,'Last inserted');f.tools.receive({type:'result',id:request.id,ok:true});
 }finally{f.close();}
});
test('mobile Markdown creates readable nodes without executing HTML or unsafe links',async()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'});try{
  dom.window.eval(await readFile('src/mobile/web/markdown.js','utf8'));
  const rendered=(dom.window as any).sidecarMarkdown('**bold**\n\n<script>alert(1)</script>\n[x](javascript:alert(1))\n[good](https://example.com/)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');dom.window.document.querySelector('main')!.append(rendered);
  const doc=dom.window.document;assert.equal(doc.querySelector('strong')?.textContent,'bold');assert.equal(doc.querySelector('script'),null);assert.equal(doc.querySelectorAll('a').length,1);assert.equal(doc.querySelector('a')?.rel,'noopener noreferrer');assert.equal(doc.querySelectorAll('td').length,2);
 }finally{dom.window.close();}
});
