import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {validateCommand,type MobileCommand} from './protocol.js';
import type {StateStore} from '../store.js';

interface Config {endpoint:string;token:string}
interface Result {id:string;ok:boolean;unknown?:boolean;error?:string;data?:unknown}
interface Entry {id:string;state:'dispatching'|'done';result?:Result;at:number}
export interface RelayHost {call:(action:string,value?:unknown)=>Promise<any>;store:StateStore;broadcast:()=>Promise<void>}
export async function startMobileRelay(directory:string,host:RelayHost,options:{allowHttp?:boolean;pollMs?:number}={}) {
 let config:Config;
 try{config=JSON.parse(await readFile(join(directory,'mobile.json'),'utf8'));}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
 const endpoint=new URL(config.endpoint);
 if((endpoint.protocol!=='https:'&&!options.allowHttp)||endpoint.username||endpoint.password||!endpoint.pathname.endsWith('/')||typeof config.token!=='string'||config.token.length<32)throw Error('Invalid private mobile configuration');
 const path=join(directory,'mobile-journal.json');let entries:Entry[]=[];
 try{entries=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(entries))throw Error('Invalid relay journal');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 async function persist(){await mkdir(directory,{recursive:true});const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(entries),{mode:0o600,flush:true});await rename(tmp,path);}
 // A restart cannot establish whether the native coordinator accepted a send.
 for(const e of entries)if(e.state==='dispatching'){e.state='done';e.result={id:e.id,ok:false,unknown:true,error:'桌面在发送期间重启，请核对原对话；不会自动重发。'};}
 let stopped=false,lastSeen=0,lastList=0,error='',busy:Promise<void>|undefined;
 entries=entries.filter(e=>e.at>Date.now()-14*86400000);
 const pending=new Map<string,Result>(entries.filter(e=>e.result).map(e=>[e.id,e.result!]));
 async function post(action:string,payload:unknown):Promise<any>{const response=await fetch(new URL('relay/'+action,endpoint),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('手机入口连接失败 ('+response.status+')');return response.json();}
 async function idea(command:MobileCommand) {
  const folder=join(directory,'mobile-inbox',command.id);await mkdir(folder,{recursive:true});
  const names:string[]=[];const ext:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg','audio/wav':'wav'};
  for(const [i,file] of (command.attachments??[]).entries()){const target=join(folder,`${i+1}.${ext[file.mime]}`);await writeFile(target,Buffer.from(file.data,'base64'),{mode:0o600});names.push(target);}
  await host.store.importIdea(command.id,{title:(command.text?.trim()||'手机随手记').slice(0,100),body:(command.text??'')+(names.length?'\n\n附件：\n'+names.join('\n'):''),details:folder});
  await host.broadcast();return {saved:true};
 }
 async function execute(command:MobileCommand):Promise<Result> {
  const clean=validateCommand({id:command.id,kind:command.kind,...(command.threadId?{threadId:command.threadId}:{}),...(command.cursor?{cursor:command.cursor}:{}),...(command.kind!=='read'?{text:command.text,attachments:command.attachments}:{})});
  if(command.kind==='read'){try{return {id:command.id,ok:true,data:await host.call('read',clean)};}catch{return {id:command.id,ok:false,error:'暂时无法读取桌面历史，请稍后刷新。'};}}
  const existing=entries.find(e=>e.id===command.id);
  if(existing)return existing.result??{id:command.id,ok:false,unknown:true,error:'发送结果未知，请核对原对话。'};
  // Verify a compatible live desktop before crossing the irreversible send boundary.
  await host.call('ready');
  const entry:Entry={id:command.id,state:'dispatching',at:Date.now()};entries.push(entry);await persist();
  let result:Result;
  try{result={id:command.id,ok:true,data:command.kind==='idea'?await idea(command):await host.call('send',clean)};}
  catch{result={id:command.id,ok:false,unknown:command.kind==='send',error:command.kind==='send'?'桌面送达结果未知，请先核对原对话。':'随手记保存失败，附件已尽量保留在本机。'};}
  entry.state='done';entry.result=result;await persist();return result;
 }
 async function tick() {
  if(stopped)return;
  try{
   let threads;
   if(Date.now()-lastList>10000){threads=await host.call('list');lastList=Date.now();}else await host.call('ready');
   const results=[...pending.values()].slice(0,20),response=await post('poll',{...(threads?{threads}:{}),results});
   for(const result of results)pending.delete(result.id);lastSeen=Date.now();error='';
   for(const command of (response.commands??[]).slice(0,4)){if(stopped)break;try{pending.set(command.id,await execute(command));}catch{pending.set(command.id,{id:command.id,ok:false,error:'桌面尚未就绪，消息未发送。'});}}
  }catch{error='连接暂不可用；服务器中的消息会保留。';}
 }
 function poll(){if(!busy&&!stopped)busy=tick().finally(()=>{busy=undefined;});}
 const timer=setInterval(poll,options.pollMs??2500);poll();
 return {
  status:()=>({configured:true,url:endpoint.href,online:Date.now()-lastSeen<15000,lastSeen,error}),
  pair:()=>post('pair',{}),revoke:()=>post('revoke',{}),
  async stop(){stopped=true;clearInterval(timer);await busy;},
 };
}
