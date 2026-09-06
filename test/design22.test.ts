import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {changeTimer,timerCommand} from '../src/shared/timer.js';
import {createStudyTimer} from '../src/renderer/study-timer.js';
import {messageTimeFromRollout} from '../src/bookmark-time.js';
import {createPersonalTools} from '../src/renderer/personal-tools.js';
const threadId='11111111-1111-4111-8111-111111111111',turnId='22222222-2222-4222-8222-222222222222';
test('drag move supports both directions, rejects stale targets and keeps running deadline',()=>{
 let t=changeTimer(undefined,{op:'add',title:'Current',minutes:25,kind:'study'},0,'current');t=changeTimer(t,{op:'start'},1000,'unused');for(const id of ['a','b','c'])t=changeTimer(t,{op:'add',title:id,minutes:5,kind:'break'},2000,id);
 const active={...t.current};t=changeTimer(t,timerCommand({op:'move',id:'a',to:2}),2000,'unused');assert.deepEqual(t.queue.map(b=>b.id),['b','c','a']);t=changeTimer(t,{op:'move',id:'a',to:0},2000,'unused');assert.deepEqual(t.queue.map(b=>b.id),['a','b','c']);assert.deepEqual(t.current,active);assert.throws(()=>changeTimer(t,{op:'move',id:'missing',to:0},2000,'unused'));assert.throws(()=>timerCommand({op:'move',id:'a',to:-1}));
});
test('queue grip provides keyboard ordering and add form retains input when folded',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://test.example',pretendToBeVisual:true}),commands:any[]=[];const ui=createStudyTimer(dom.window as unknown as Window,async c=>{commands.push(c);},()=>{});try{dom.window.document.body.append(ui.element);ui.receive({current:null,queue:[{id:'a',title:'A',minutes:5,kind:'study'},{id:'b',title:'B',minutes:5,kind:'study'}]});ui.element.querySelector('button.timer-grip')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await Promise.resolve();assert.deepEqual(commands,[{op:'move',id:'a',to:1}]);const form=ui.element.querySelector('form')!,toggle=ui.element.querySelector<HTMLButtonElement>('[data-testid="timer-add-toggle"]')!,input=form.querySelector('input')!;assert.equal(form.hidden,true);toggle.click();input.value='Keep draft';toggle.click();toggle.click();assert.equal(input.value,'Keep draft');}finally{ui.destroy();dom.window.close();}
});
test('message timestamp uses exact message evidence; ambiguous quotations never get fabricated dates',()=>{
 const a={threadId,turnId,messageId:'msg1',quote:'A sufficiently distinctive quote for this message'};const row=(id:string,date:string)=>({type:'response_item',timestamp:date,payload:{type:'message',id,role:'assistant',content:[{type:'output_text',text:a.quote}]}});const rows=[{type:'turn_context',payload:{turn_id:turnId}},row('msg1','2026-09-05T03:00:00Z'),row('msg2','2026-09-05T03:01:00Z')].map(v=>JSON.stringify(v)).join('\n');assert.equal(messageTimeFromRollout(rows,a),'2026-09-05T03:00:00.000Z');assert.equal(messageTimeFromRollout(rows,{...a,messageId:'unknown'}),undefined);assert.equal(messageTimeFromRollout(rows,{...a,messageId:'unknown',turnId:threadId}),undefined);
});
test('tool groups fold independently and persist across a recreated toolbox',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://test.example',pretendToBeVisual:true}),win=dom.window as unknown as Window;let tools=createPersonalTools(win,()=>{});try{tools.open();let groups=win.document.getElementById('codex-sidecar-personal-tools')!.shadowRoot!.querySelectorAll('details');assert.deepEqual([...groups].map(g=>g.open),[true,true,false,false]);groups[0]!.open=false;await new Promise(r=>setTimeout(r,20));assert.equal(groups[1]!.open,true);tools.destroy();tools=createPersonalTools(win,()=>{});tools.open();groups=win.document.getElementById('codex-sidecar-personal-tools')!.shadowRoot!.querySelectorAll('details');assert.deepEqual([...groups].map(g=>g.open),[false,true,false,false]);}finally{tools.destroy();dom.window.close();}
});

