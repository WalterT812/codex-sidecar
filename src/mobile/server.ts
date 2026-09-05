import {createServer, type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {MAX_BODY,validateCommand,type MobileCommand,type MobileThread,type MobileRead} from './protocol.js';

interface Data {version:1;commands:MobileCommand[];threads:MobileThread[];reads:Record<string,MobileRead>;sessions:{hash:string;expires:number}[];pair?:{hash:string;expires:number};lastSeen:number}
interface Options {path:string;publicUrl:string;relayToken:string;assets:string;secure?:boolean}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const equal=(a:string,b:string)=>{const aa=Buffer.from(hash(a)),bb=Buffer.from(hash(b));return timingSafeEqual(aa,bb);};
export async function createMobileServer(options:Options) {
 const publicUrl=new URL(options.publicUrl),base=publicUrl.pathname.replace(/\/$/,'');
 let data:Data={version:1,commands:[],threads:[],reads:{},sessions:[],lastSeen:0};
 try{data=JSON.parse(await readFile(options.path,'utf8'));if(data.version!==1||!Array.isArray(data.commands)||!Array.isArray(data.sessions))throw Error('Invalid mobile state');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 let serial=Promise.resolve();
 async function transact<T>(fn:()=>T|Promise<T>):Promise<T> {
  let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const result=new Promise<T>((a,b)=>{resolve=a;reject=b;});
  serial=serial.then(async()=>{const previous=structuredClone(data);try{const value=await fn();await mkdir(dirname(options.path),{recursive:true,mode:0o700});const tmp=options.path+'.tmp';trim();const encoded=JSON.stringify(data);if(Buffer.byteLength(encoded)>64*1024*1024)throw Error('手机存储已满，请等待附件同步');await writeFile(tmp,encoded,{mode:0o600,flush:true});await rename(tmp,options.path);resolve(value);}catch(e){data=previous;reject(e);}});return result;
 }
 const fingerprint=(c:Pick<MobileCommand,'text'|'kind'|'threadId'|'attachments'>)=>hash(JSON.stringify([c.text,c.kind,c.threadId,c.attachments??[]]));
 const failures=new Map<string,{count:number;until:number}>();
 function json(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
 async function body(req:IncomingMessage):Promise<any> {if(!req.headers['content-type']?.startsWith('application/json'))throw Error('JSON required');const buffers:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Error('消息过大');buffers.push(chunk);}return JSON.parse(Buffer.concat(buffers).toString('utf8'));}
 function session(req:IncomingMessage) {const value=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('sidecar_session='))?.slice(16);return value&&data.sessions.some(s=>s.expires>Date.now()&&equal(s.hash,hash(value)));}
 function relay(req:IncomingMessage) {return typeof req.headers.authorization==='string'&&equal(req.headers.authorization,'Bearer '+options.relayToken);}
 function origin(req:IncomingMessage) {return req.headers.origin===publicUrl.origin&&req.headers['sec-fetch-site']!=='cross-site';}
 const cookie=(value:string,maxAge:number)=>`sidecar_session=${value}; Path=${base||''}/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${options.secure===false?'':'; Secure'}`;
 function trim(){data.sessions=data.sessions.filter(s=>s.expires>Date.now()).slice(-20);const waiting=data.commands.filter(c=>['queued','dispatching'].includes(c.status));const done=data.commands.filter(c=>!['queued','dispatching'].includes(c.status)&&c.createdAt>Date.now()-7*86400000).slice(-150);data.commands=[...waiting,...done].sort((a,b)=>a.createdAt-b.createdAt);const keys=Object.keys(data.reads).sort((a,b)=>data.reads[a]!.updatedAt-data.reads[b]!.updatedAt);while(keys.length>20||keys.length>1&&Buffer.byteLength(JSON.stringify(data.reads))>20*1024*1024)delete data.reads[keys.shift()!];}
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
   const url=new URL(req.url??'/',publicUrl.origin);let path=url.pathname;
   if(base && path.startsWith(base+'/'))path=path.slice(base.length);
   if(path==='/health'){json(res,200,{ok:true});return;}
   if(path.startsWith('/relay/')) {
    if(!relay(req)){json(res,401,{error:'Unauthorized'});return;}
    if(req.method!=='POST'){json(res,405,{error:'POST required'});return;}
    if(path==='/relay/pair') {await body(req);const code=randomBytes(9).toString('hex');await transact(()=>{data.pair={hash:hash(code),expires:Date.now()+10*60000};});json(res,200,{code,expiresIn:600,url:options.publicUrl.replace(/\/$/,'/')});return;}
    if(path==='/relay/revoke'){await body(req);await transact(()=>{data.sessions=[];delete data.pair;});json(res,200,{ok:true});return;}
    if(path==='/relay/poll') {
     const input=await body(req);
     const commands=await transact(()=>{
      data.lastSeen=Date.now();
      if(Array.isArray(input.threads))data.threads=input.threads.slice(0,100).filter((t:any)=>typeof t.id==='string'&&typeof t.title==='string'&&typeof t.updatedAt==='number'&&typeof t.status==='string').map((t:any)=>({id:t.id,title:t.title.slice(0,200),updatedAt:t.updatedAt,status:t.status.slice(0,100)}));
      if(Array.isArray(input.results))for(const result of input.results.slice(0,20)) {
       const command=data.commands.find(c=>c.id===result.id);if(!command||!['dispatching','unknown'].includes(command.status))continue;
       command.status=result.ok?'delivered':result.unknown?'unknown':'failed';command.error=typeof result.error==='string'?result.error.slice(0,300):undefined;
       if(command.kind==='read'&&result.ok&&result.data?.threadId===command.threadId&&Array.isArray(result.data.messages)){
        const rows=result.data.messages.slice(-400).filter((m:any)=>typeof m.id==='string'&&typeof m.turnId==='string'&&['user','assistant'].includes(m.role)&&typeof m.text==='string').map((m:any)=>({id:m.id,turnId:m.turnId,role:m.role,text:m.text.slice(0,60000)}));
        if(command.cursor){const previous=data.reads[command.threadId!]!;const merged=[...rows,...previous?.messages??[]];data.reads[command.threadId!]={threadId:command.threadId!,messages:merged.filter((m,i)=>merged.findIndex(x=>x.id===m.id)===i).slice(0,400),cursor:result.data.cursor??null,updatedAt:Date.now()};}
        else {const previous=data.reads[command.threadId!];const ids=new Set(rows.map((m:any)=>m.id));const merged=[...(previous?.messages??[]).filter(m=>!ids.has(m.id)),...rows];data.reads[command.threadId!]={threadId:command.threadId!,messages:merged.slice(-400),cursor:previous?.cursor??result.data.cursor??null,updatedAt:Date.now()};}
       }
       if(command.kind==='send'&&result.ok){command.attachments=[];command.result={turnId:typeof result.data?.turnId==='string'?result.data.turnId:undefined};}
       if(command.kind==='idea'&&result.ok){command.attachments=[];command.result={saved:true};}
      }
      for(const c of data.commands)if(c.status==='dispatching'&&Date.now()-(c.dispatchedAt??0)>90000){c.status=c.kind==='read'?'queued':'unknown';c.error=c.kind==='read'?undefined:'连接中断，送达结果未知；请先核对原对话，不要重复发送。';}
      const next=data.commands.filter(c=>c.status==='queued').slice(0,4);for(const c of next){c.status='dispatching';c.dispatchedAt=Date.now();}trim();return structuredClone(next);
     });json(res,200,{commands});return;
    }
    json(res,404,{error:'Not found'});return;
   }
   if(path==='/api/pair'&&req.method==='POST') {
    if(!origin(req)){json(res,403,{error:'Origin rejected'});return;}
    // Caddy sets this header; loopback-only deployment prevents direct spoofing.
    const ip=String(req.headers['x-forwarded-for']??req.socket.remoteAddress).slice(0,100),entry=failures.get(ip);
    if(entry&&entry.until>Date.now()&&entry.count>=5){json(res,429,{error:'尝试太多，请 10 分钟后重试。'});return;}
    const input=await body(req),code=typeof input.code==='string'?input.code.replace(/[-\s]/g,'').toLowerCase():'';
    const token=randomBytes(32).toString('base64url');
    const ok=await transact(()=>{if(!data.pair||data.pair.expires<Date.now()||!equal(data.pair.hash,hash(code)))return false;delete data.pair;data.sessions.push({hash:hash(token),expires:Date.now()+30*86400000});trim();return true;});
    if(!ok){failures.set(ip,{count:entry&&entry.until>Date.now()?entry.count+1:1,until:Date.now()+600000});if(failures.size>1000)failures.delete(failures.keys().next().value!);json(res,401,{error:'配对码不正确或已过期。'});return;}
    failures.delete(ip);res.setHeader('Set-Cookie',cookie(token,30*86400));json(res,200,{ok:true});return;
   }
   if(path.startsWith('/api/')) {
    if(!session(req)){json(res,401,{error:'请先与桌面配对'});return;}
    if(req.method!=='GET'&&!origin(req)){json(res,403,{error:'Origin rejected'});return;}
    if(path==='/api/logout'&&req.method==='POST'){const raw=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('sidecar_session='))?.slice(16);await transact(()=>{data.sessions=data.sessions.filter(s=>!raw||s.hash!==hash(raw));});res.setHeader('Set-Cookie',cookie('',0));json(res,200,{ok:true});return;}
    if(path==='/api/threads'&&req.method==='GET'){json(res,200,{threads:data.threads,online:Date.now()-data.lastSeen<15000,lastSeen:data.lastSeen});return;}
    if(path==='/api/read'&&req.method==='GET') {
     const threadId=url.searchParams.get('threadId')??'',cursor=url.searchParams.get('cursor')??undefined;
     if(!data.threads.some(t=>t.id===threadId)){json(res,404,{error:'对话尚未同步'});return;}
     if(!data.commands.some(c=>c.kind==='read'&&c.threadId===threadId&&c.cursor===cursor&&['queued','dispatching'].includes(c.status))) {
      await transact(()=>{if(data.commands.filter(c=>['queued','dispatching'].includes(c.status)).length>=50)throw Error('读取队列已满，请稍后刷新');data.commands.push({...validateCommand({id:randomUUID(),kind:'read',threadId,...(cursor?{cursor}:{})}),createdAt:Date.now(),status:'queued'});trim();});
     }
     json(res,200,{...(data.reads[threadId]??{threadId,messages:[],cursor:null,updatedAt:0}),online:Date.now()-data.lastSeen<15000});return;
    }
    if(path==='/api/commands'&&req.method==='GET'){json(res,200,{commands:data.commands.filter(c=>c.kind!=='read').slice(-50).map(({attachments,result,...c})=>({...c,attachmentCount:attachments?.length??0})),online:Date.now()-data.lastSeen<15000});return;}
    if(path==='/api/send'&&req.method==='POST') {
     const command=validateCommand(await body(req));if(command.kind==='read'){json(res,400,{error:'Invalid action'});return;}
     if(command.kind==='send'&&!data.threads.some(t=>t.id===command.threadId)){json(res,404,{error:'请选择已同步的对话'});return;}
     const saved=await transact(()=>{const existing=data.commands.find(c=>c.id===command.id) as (MobileCommand & {fingerprint?:string})|undefined;if(existing){if(existing.text!==command.text||existing.kind!==command.kind||existing.threadId!==command.threadId||existing.fingerprint!==fingerprint(command))throw Error('消息编号已用于其他内容');return existing;}
      if(data.commands.filter(c=>['queued','dispatching'].includes(c.status)).length>=50)throw Error('待处理消息已满，请等待同步');
      const next:MobileCommand & {fingerprint:string}={...command,fingerprint:fingerprint(command),createdAt:Date.now(),status:'queued'};data.commands.push(next);trim();return next;});json(res,202,{id:saved.id,status:saved.status});return;
    }
    json(res,404,{error:'Not found'});return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'Method not allowed'});return;}
   const files:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/markdown.js':['markdown.js','text/javascript; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/sw.js':['sw.js','text/javascript; charset=utf-8'],'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],'/icon.svg':['icon.svg','image/svg+xml']};
   const file=files[path];if(!file){json(res,404,{error:'Not found'});return;}const content=await readFile(join(options.assets,file[0]));res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){json(res,400,{error:error instanceof Error?error.message.slice(0,200):'请求失败'});}
 });
 server.requestTimeout=20000;server.headersTimeout=15000;return server;
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
 const config=JSON.parse(await readFile(process.env.SIDECAR_MOBILE_CONFIG??'/etc/codex-sidecar-mobile/config.json','utf8'));
 const server=await createMobileServer({...config,assets:join(dirname(fileURLToPath(import.meta.url)),'web')});server.listen(config.port??4388,'127.0.0.1',()=>console.log('Sidecar mobile listening on loopback'));
}
