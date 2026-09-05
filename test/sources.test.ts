import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {validateAnchor} from '../src/shared/anchors.js';
import {sourceMessages,selectedSource,findSource} from '../src/renderer/sources.js';
import {StateStore} from '../src/store.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const threadId='11111111-1111-4111-8111-111111111111',turnId='22222222-2222-4222-8222-222222222222';
test('message sources use IDs, preserve repeated text identity, and exclude composer selections',()=>{
 const dom=new JSDOM(`<div data-above-composer-conversation-id="${threadId}"></div><article data-content-search-unit-key="${turnId}:msg_a"><div data-response-annotation-conversation="${threadId}" data-response-annotation-target="msg_a"><p data-markdown-text-style="assistant-message">相同文字</p></div></article><div data-response-annotation-conversation="${threadId}" data-response-annotation-target="msg_b">相同文字</div><div contenteditable="true">草稿</div>`);
 const doc=dom.window.document,rows=sourceMessages(doc);assert.equal(rows.length,2);assert.equal(rows[0]!.anchor.turnId,turnId);assert.equal(findSource(doc,rows[1]!.anchor),rows[1]!.node);
 const range=doc.createRange();range.selectNodeContents(rows[0]!.node.querySelector('p')!);dom.window.getSelection()!.addRange(range);assert.equal(selectedSource(dom.window as unknown as Window)?.anchor.messageId,'msg_a');
 dom.window.getSelection()!.removeAllRanges();range.selectNodeContents(doc.querySelector('[contenteditable]')!);dom.window.getSelection()!.addRange(range);assert.equal(selectedSource(dom.window as unknown as Window),null);dom.window.close();
});
test('source validators reject invalid routes and retain optional turn IDs',()=>{
 assert.throws(()=>validateAnchor({threadId:'../../',messageId:'x',quote:'x'}));assert.throws(()=>validateAnchor({threadId,messageId:'x',quote:'x',script:'alert(1)'}));
 assert.deepEqual(validateAnchor({threadId,messageId:'msg_1',turnId,quote:'原文'}),{threadId,messageId:'msg_1',turnId,quote:'原文'});
});
test('bookmarks, appearance and personal records round-trip without losing original sources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sidecar-source-test-'));try{const path=join(dir,'state.json'),store=await StateStore.open(path),source={threadId,messageId:'msg_a',turnId,quote:'原文'};
 await store.mutate('bookmark.save',{revision:0,title:'回看',url:'codex://threads/'+threadId,excerpt:'原文',source});
 await store.mutate('library.save',{revision:1,kind:'decision',title:'主题',body:'明亮',status:'active',source});
 await store.mutate('settings.patch',{revision:2,appearance:{font:'harmony',size:17,lineHeight:1.8,opacity:95,wallpaper:40}});
 const restored=await StateStore.open(path);assert.deepEqual(restored.snapshot.bookmarks[0]?.source,source);assert.deepEqual(restored.snapshot.library?.[0]?.source,source);assert.equal(restored.snapshot.settings.appearance?.size,17);
 await assert.rejects(store.mutate('settings.patch',{revision:3,appearance:{font:'url(evil)',size:17,lineHeight:1.8,opacity:95,wallpaper:40}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
