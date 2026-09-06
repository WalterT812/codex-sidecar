export interface StudyBlock { id:string; title:string; minutes:number; kind:'study'|'break' }
export interface ActiveBlock extends StudyBlock { status:'running'|'paused'|'finished'; remainingMs:number; endsAt:number|null }
export interface StudyTimer { queue:StudyBlock[]; current:ActiveBlock|null }
export type TimerCommand = {op:'add';title:string;minutes:number;kind:'study'|'break'} | {op:'remove'|'up';id:string} | {op:'move';id:string;to:number} | {op:'start'|'pause'|'finish'|'dismiss'};
const MAX_MS=180*60_000;
function object(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid timer data');
 const r=value as Record<string,unknown>;
 if(Object.getPrototypeOf(r)!==Object.prototype&&Object.getPrototypeOf(r)!==null)throw Error('Invalid timer data');
 if(Object.keys(r).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(r,k)))throw Error('Invalid timer fields');
 return r;
}
function block(value:unknown,active=false):StudyBlock {
 const r=object(value,['id','title','minutes','kind',...(active?['status','remainingMs','endsAt']:[])]);
 if(typeof r.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(r.id)||typeof r.title!=='string'||!r.title.trim()||r.title.length>120||!Number.isInteger(r.minutes)||Number(r.minutes)<1||Number(r.minutes)>180||!['study','break'].includes(String(r.kind)))throw Error('学习块需要标题和 1–180 分钟时长');
 return {id:r.id,title:r.title,minutes:r.minutes as number,kind:r.kind as StudyBlock['kind']};
}
export function validateTimer(value:unknown):StudyTimer {
 const r=object(value,['queue','current']);if(!Array.isArray(r.queue)||r.queue.length>30)throw Error('最多安排 30 个学习块');
 const queue=r.queue.map(v=>block(v));let current:ActiveBlock|null=null;
 if(r.current!==null){const b=block(r.current,true),c=r.current as ActiveBlock;
  if(!['running','paused','finished'].includes(c.status)||!Number.isSafeInteger(c.remainingMs)||c.remainingMs<0||c.remainingMs>b.minutes*60_000||c.remainingMs>MAX_MS|| (c.status==='running'?(!Number.isSafeInteger(c.endsAt)||Number(c.endsAt)<0||Number(c.endsAt)>8640000000000000):c.endsAt!==null)|| (c.status==='finished'&&c.remainingMs!==0))throw Error('Invalid timer clock');
  current={...b,status:c.status,remainingMs:c.remainingMs,endsAt:c.endsAt};
 }
 const ids=[...queue.map(b=>b.id),...(current?[current.id]:[])];if(new Set(ids).size!==ids.length)throw Error('Duplicate timer block');
 return {queue,current};
}
export function timerCommand(value:unknown):TimerCommand {
 const op=(value as any)?.op;
 const keys=op==='add'?['op','title','minutes','kind']:op==='move'?['op','id','to']:['remove','up'].includes(op)?['op','id']:['op'];const r=object(value,keys);
 if(op==='move'){if(typeof r.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(r.id)||!Number.isInteger(r.to)||Number(r.to)<0||Number(r.to)>29)throw Error('Invalid timer move');return {op,id:r.id,to:r.to as number};}
 if(op==='add'){const b=block({id:'validate',title:r.title,minutes:r.minutes,kind:r.kind});return {op,title:b.title.trim(),minutes:b.minutes,kind:b.kind};}
 if(op==='remove'||op==='up'){if(typeof r.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(r.id))throw Error('Invalid timer block');return {op,id:r.id};}
 if(!['start','pause','finish','dismiss'].includes(op))throw Error('Unknown timer operation');return {op} as TimerCommand;
}
export function remaining(current:ActiveBlock|null,now=Date.now()):number {
 if(!current)return 0;
 return current.status==='running'?Math.max(0,Math.min(current.remainingMs,(current.endsAt??now)-now)):current.remainingMs;
}
export function timerDone(current:ActiveBlock|null,now=Date.now()):boolean{return !!current&&(current.status==='finished'||(current.status==='running'&&remaining(current,now)===0));}
export function changeTimer(value:StudyTimer|undefined,command:TimerCommand,now:number,id:string):StudyTimer {
 const t=validateTimer(value??{queue:[],current:null});
 if(timerDone(t.current,now))t.current={...t.current!,status:'finished',remainingMs:0,endsAt:null};
 switch(command.op){
  case 'move': {const index=t.queue.findIndex(b=>b.id===command.id);if(index<0||command.to<0||command.to>=t.queue.length||!Number.isInteger(command.to))throw Error('学习块已被更改，请重试');const [b]=t.queue.splice(index,1);t.queue.splice(command.to,0,b!);break;}
  case 'add': if(t.queue.length>=30)throw Error('最多安排 30 个学习块');t.queue.push({id,title:command.title,minutes:command.minutes,kind:command.kind});break;
  case 'remove': case 'up': {const index=t.queue.findIndex(b=>b.id===command.id);if(index<0)throw Error('学习块已被更改，请重试');if(command.op==='remove')t.queue.splice(index,1);else if(index>0)[t.queue[index-1],t.queue[index]]=[t.queue[index]!,t.queue[index-1]!];break;}
  case 'start': {
   if(t.current?.status==='running')throw Error('当前学习块正在计时');
   if(t.current?.status==='paused'){t.current.status='running';t.current.endsAt=now+t.current.remainingMs;break;}
   const next=t.queue.shift();if(!next)throw Error('先添加一个学习块');t.current={...next,status:'running',remainingMs:next.minutes*60_000,endsAt:now+next.minutes*60_000};break;
  }
  case 'pause': if(t.current?.status==='running')t.current={...t.current,remainingMs:remaining(t.current,now),endsAt:null,status:'paused'};break;
  case 'finish': if(t.current)t.current={...t.current,status:'finished',endsAt:null,remainingMs:0};break;
  case 'dismiss': if(t.current&&t.current.status!=='finished')throw Error('先暂停或结束当前学习块');t.current=null;break;
 }
 return validateTimer(t);
}
export function timerLabel(ms:number):string{const seconds=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}
