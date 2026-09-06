import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {changeTimer,remaining,timerDone,timerLabel,timerCommand,validateTimer,type StudyTimer,type TimerCommand} from '../src/shared/timer.js';
import {createStudyTimer} from '../src/renderer/study-timer.js';
const add=(title:string,minutes=25):TimerCommand=>({op:'add',title,minutes,kind:'study'});
test('timer pauses precisely, survives sleep/reload and never starts the next block automatically',()=>{
 let t=changeTimer(undefined,add('A'),0,'a');t=changeTimer(t,add('B'),0,'b');
 t=changeTimer(t,{op:'start'},1000,'unused');assert.equal(remaining(t.current,61000),24*60_000);
 t=changeTimer(t,{op:'pause'},61000,'unused');assert.equal(remaining(t.current,9999999),24*60_000);
 t=changeTimer(t,{op:'start'},10000000,'unused');const restored=validateTimer(JSON.parse(JSON.stringify(t)));
 assert.equal(remaining(restored.current,10060000),23*60_000);
 assert.equal(timerDone(restored.current,12000000),true);assert.equal(restored.queue[0]?.title,'B');assert.equal(restored.current?.title,'A');
 t=changeTimer(restored,{op:'start'},12000000,'unused');assert.equal(t.current?.title,'B');assert.equal(remaining(t.current,12000000),25*60_000);
});
test('timer rejects malformed durations, unknown commands and duplicate IDs',()=>{
 for(const minutes of [0,-5,181,NaN,1.5,'25'])assert.throws(()=>timerCommand({...add('A'),minutes}));
 assert.throws(()=>timerCommand({...add('A'),shell:'bad'}));assert.throws(()=>timerCommand({op:'unknown'}));
 const t=changeTimer(undefined,add('A'),0,'a');assert.throws(()=>changeTimer(t,add('B'),0,'a'));
 assert.equal(timerLabel(1001),'00:02');assert.equal(timerLabel(0),'00:00');
});
test('queue can be reordered and removed without changing the active block',()=>{
 let t=changeTimer(undefined,add('A'),0,'a');t=changeTimer(t,add('B'),0,'b');t=changeTimer(t,add('C'),0,'c');t=changeTimer(t,{op:'start'},1000,'unused');
 const active={...t.current};t=changeTimer(t,{op:'up',id:'c'},2000,'unused');assert.deepEqual(t.queue.map(b=>b.id),['c','b']);
 t=changeTimer(t,{op:'remove',id:'b'},2000,'unused');assert.deepEqual(t.current,active);assert.equal(t.queue.length,1);
 assert.throws(()=>changeTimer(t,{op:'start'},2000,'unused'),/正在计时/);
 assert.throws(()=>changeTimer(t,{op:'dismiss'},2000,'unused'));
 t=changeTimer(t,{op:'finish'},2000,'unused');assert.equal(timerDone(t.current,2000),true);t=changeTimer(t,{op:'dismiss'},2000,'unused');assert.equal(t.current,null);assert.equal(t.queue.length,1);
});
test('timer UI keeps planning drafts while snapshots and expiry update the clock',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://timer.example',pretendToBeVisual:true}),win=dom.window as unknown as Window;
 const commands:TimerCommand[]=[];const ui=createStudyTimer(win,async c=>{commands.push(c);},()=>{});dom.window.document.body.append(ui.style,ui.element,ui.badge);
 try{
  const input=ui.element.querySelector<HTMLInputElement>('[aria-label="学习块名称"]')!;input.value='Draft for later';
  const state:StudyTimer={queue:[{id:'next',title:'Next',minutes:5,kind:'break'}],current:{id:'current',title:'Current',minutes:25,kind:'study',status:'running',remainingMs:1500000,endsAt:Date.now()+1500000}};
  ui.receive(state);assert.equal(input.value,'Draft for later');assert.equal(ui.badge.hidden,false);
  const ended=structuredClone(state);ended.current!.endsAt=Date.now()-1;ui.receive(ended);
  assert.match(ui.badge.textContent!,/时间到/);assert.equal(ui.element.querySelector('.timer-clock')!.textContent,'00:00');assert.equal(input.value,'Draft for later');assert.equal(commands.length,0);
  const next=ui.element.querySelector<HTMLButtonElement>('[data-testid="timer-start"]')!;assert.equal(next.textContent,'开始下一块');next.click();await Promise.resolve();assert.deepEqual(commands,[{op:'start'}]);
 }finally{ui.destroy();dom.window.close();}
});
