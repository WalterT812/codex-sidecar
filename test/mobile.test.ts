import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createMobileServer} from '../src/mobile/server.js';
import {validateCommand} from '../src/mobile/protocol.js';
import {startMobileRelay} from '../src/mobile/relay.js';
import {StateStore} from '../src/store.js';

const threadId=randomUUID(),token='relay-test-token-with-more-than-32-characters';
async function fixture(t:any) {
 const dir=await mkdtemp(join(tmpdir(),'sidecar-mobile-'));
 const server=await createMobileServer({path:join(dir,'server.json'),publicUrl:'http://localhost/sidecar/',relayToken:token,assets:resolve('src/mobile/web'),secure:false});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as any).port,base=`http://127.0.0.1:${port}/sidecar/`;
 let cookie='';
 const call=async(path:string,body?:unknown,auth='mobile',origin='http://localhost')=>{
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,...(auth==='relay'?{Authorization:'Bearer '+token}:auth==='mobile'?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,headers:r.headers,data:await r.json()};
 };
 const pair=async()=>{const code=(await call('relay/pair',{},'relay')).data.code;const paired=await call('api/pair',{code},'none');cookie=paired.headers.get('set-cookie')!.split(';')[0]!;return code;};
 t.after(async()=>{server.closeAllConnections();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await rm(dir,{recursive:true,force:true});});
 return {dir,base,call,pair};
}
async function until(fn:()=>Promise<boolean>,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await delay(30);}throw Error('Timed out waiting for relay');}

test('mobile commands reject unsupported actions, paths, audio sends and oversized attachments',()=>{
 assert.throws(()=>validateCommand({id:randomUUID(),kind:'shell',text:'x'}));
 assert.throws(()=>validateCommand({id:randomUUID(),kind:'send',threadId:'../../foo',text:'x'}));
 assert.throws(()=>validateCommand({id:randomUUID(),kind:'idea',text:'x',command:'exec'}));
 assert.throws(()=>validateCommand({id:randomUUID(),kind:'send',threadId,text:'',attachments:[{mime:'audio/wav',data:'AAAA',name:'a.wav'}]}));
 assert.throws(()=>validateCommand({id:randomUUID(),kind:'idea',text:'x',attachments:[{mime:'image/svg+xml',data:'AAAA',name:'a.svg'}]}));
 assert.equal(validateCommand({id:randomUUID(),kind:'send',threadId,text:'hello'}).text,'hello');
});

test('private pairing is single use, same origin, revocable, and never returned to anonymous requests',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('api/threads')).status,401);
 assert.equal((await f.call('relay/poll',{},'none')).status,401);
 const code=await f.pair();
 assert.equal((await f.call('api/pair',{code},'none')).status,401);
 assert.equal((await f.call('api/send',{id:randomUUID(),kind:'idea',text:'x'},'mobile','https://attacker.example')).status,403);
 assert.equal((await f.call('api/threads')).status,200);
 await f.call('relay/revoke',{},'relay');
 assert.equal((await f.call('api/threads')).status,401);
 const disk=await readFile(join(f.dir,'server.json'),'utf8');assert.ok(!disk.includes(code));assert.ok(!disk.includes(token));
});

test('offline sends persist, deduplicate all content, and history is cached behind authentication',async t=>{
 const f=await fixture(t);await f.pair();
 await f.call('relay/poll',{threads:[{id:threadId,title:'Synthetic task',updatedAt:1,status:'idle'}]},'relay');
 const command={id:randomUUID(),kind:'send',threadId,text:'hello',attachments:[]};
 assert.equal((await f.call('api/send',command)).status,202);
 assert.equal((await f.call('api/send',command)).status,202);
 assert.equal((await f.call('api/send',{...command,text:'other'})).status,400);
 assert.equal((await f.call('api/send',{...command,attachments:[{mime:'image/png',name:'x.png',data:'AAAA'}]})).status,400);
 const dispatched=await f.call('relay/poll',{},'relay');assert.equal(dispatched.data.commands.length,1);
 assert.equal((await f.call('relay/poll',{},'relay')).data.commands.length,0);
 await f.call('relay/poll',{results:[{id:command.id,ok:true,data:{turnId:'turn'}}]},'relay');
 assert.equal((await f.call('api/commands')).data.commands[0].status,'delivered');
 await f.call('api/read?threadId='+threadId);
 const read=(await f.call('relay/poll',{},'relay')).data.commands[0];
 await f.call('relay/poll',{results:[{id:read.id,ok:true,data:{threadId,messages:[{id:'a',turnId:'b',role:'assistant',text:'cached text'}],cursor:null}}]},'relay');
 assert.equal((await f.call('api/read?threadId='+threadId)).data.messages[0].text,'cached text');
 assert.equal((await f.call('api/read?threadId='+threadId,undefined,'none')).status,401);
});

test('relay delivers once through native owner, saves idea attachments, and preserves unknown journal state',async t=>{
 const f=await fixture(t);await f.pair();const desktop=join(f.dir,'desktop');
 await (await import('node:fs/promises')).mkdir(desktop);
 await writeFile(join(desktop,'mobile.json'),JSON.stringify({endpoint:f.base,token}));
 const store=await StateStore.open(join(desktop,'state.json'));let sent=0;
 const relay=await startMobileRelay(desktop,{store,broadcast:async()=>{},call:async(action,value:any)=>{
  if(action==='list')return [{id:threadId,title:'Synthetic task',updatedAt:1,status:'idle'}];
  if(action==='send'){sent++;assert.equal(value.text,'one send');return {turnId:'turn'};}
  return true;
 }},{allowHttp:true,pollMs:35});t.after(()=>relay!.stop());
 await until(async()=>(await f.call('api/threads')).data.threads.length===1);
 const command={id:randomUUID(),kind:'send',threadId,text:'one send'};await f.call('api/send',command);await f.call('api/send',command);
 await until(async()=>(await f.call('api/commands')).data.commands[0]?.status==='delivered');assert.equal(sent,1);
 const idea={id:randomUUID(),kind:'idea',text:'my idea',attachments:[{mime:'image/png',name:'../../unsafe.png',data:'AAAA'}]};await f.call('api/send',idea);
 await until(async()=>!!store.snapshot.library?.some(r=>r.id===idea.id));
 assert.equal((await readFile(join(desktop,'mobile-inbox',idea.id,'1.png'))).length,3);
 assert.ok(store.snapshot.library?.find(r=>r.id===idea.id)?.body.includes('my idea'));
 await relay!.stop();
 const pendingId=randomUUID();await writeFile(join(desktop,'mobile-journal.json'),JSON.stringify([{id:pendingId,state:'dispatching',at:Date.now()}]));
 await f.call('api/send',{id:pendingId,kind:'send',threadId,text:'must not replay'});
 const relay2=await startMobileRelay(desktop,{store,broadcast:async()=>{},call:async action=>{if(action==='send')sent++;return action==='list'?[{id:threadId,title:'Synthetic task',updatedAt:1,status:'idle'}]:true;}},{allowHttp:true,pollMs:35});
 try{await until(async()=>(await f.call('api/commands')).data.commands.find((c:any)=>c.id===pendingId)?.status==='unknown');assert.equal(sent,1);}finally{await relay2!.stop();}
});

test('expired send leases become unknown without redispatch, and a late recorded acknowledgement can resolve them',async t=>{
 const f=await fixture(t);await f.pair();await f.call('relay/poll',{threads:[{id:threadId,title:'Synthetic task',updatedAt:1,status:'idle'}]},'relay');
 const command={id:randomUUID(),kind:'send',threadId,text:'uncertain'};await f.call('api/send',command);assert.equal((await f.call('relay/poll',{},'relay')).data.commands.length,1);
 const original=Date.now;t.mock.method(Date,'now',()=>original()+91000);
 assert.equal((await f.call('relay/poll',{},'relay')).data.commands.length,0);
 assert.equal((await f.call('api/commands')).data.commands[0].status,'unknown');
 await f.call('relay/poll',{results:[{id:command.id,ok:true,data:{turnId:'actual-turn'}}]},'relay');
 assert.equal((await f.call('api/commands')).data.commands[0].status,'delivered');
});
