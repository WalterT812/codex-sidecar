import {readdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {validateAnchor,type MessageAnchor} from './shared/anchors.js';

// Read only the requested conversation. Never use a turn's completion time as
// a message timestamp: intermediate replies can precede it by many minutes.
export function messageTimeFromRollout(text:string,anchor:MessageAnchor):string|undefined{
 let turn:string|undefined;const exact=new Set<string>(),quoted=new Set<string>();
 const normalize=(s:string)=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
 const quote=normalize(anchor.quote);
 for(const line of text.split('\n')){let row:any;try{row=JSON.parse(line);}catch{continue;}
  if(row.type==='turn_context')turn=row.payload?.turn_id;
  if(row.type==='event_msg'&&row.payload?.type==='task_started')turn=row.payload.turn_id;
  const p=row.payload;if(row.type!=='response_item'||p?.type!=='message'||!['user','assistant'].includes(p.role)||!Array.isArray(p.content))continue;
  const date=new Date(row.timestamp);if(typeof row.timestamp!=='string'||!Number.isFinite(date.getTime()))continue;const at=date.toISOString();
  if(p.id===anchor.messageId)exact.add(at);
  else if(anchor.turnId&&turn===anchor.turnId&&quote.length>=16){const body=p.content.filter((c:any)=>['input_text','output_text','text'].includes(c.type)&&typeof c.text==='string').map((c:any)=>c.text).join('\n');if(normalize(body).includes(quote))quoted.add(at);}
 }
 return exact.size===1?[...exact][0]:exact.size?undefined:quoted.size===1?[...quoted][0]:undefined;
}
export function createBookmarkTimeReader(home=process.env.CODEX_HOME||join(homedir(),'.codex')){
 const paths=new Map<string,string>();
 return async(value:MessageAnchor):Promise<string|undefined>=>{
  const anchor=validateAnchor(value);try{
   let path=paths.get(anchor.threadId);
   if(!path){for(const root of ['sessions','archived_sessions']){const base=join(home,root);let entries:string[];try{entries=await readdir(base,{recursive:true});}catch{continue;}const name=entries.find(n=>n.endsWith('-'+anchor.threadId+'.jsonl'));if(name){path=join(base,name);paths.set(anchor.threadId,path);break;}}}
   if(!path||(await stat(path)).size>64*1024*1024)return;
   return messageTimeFromRollout(await readFile(path,'utf8'),anchor);
  }catch{return undefined;}
 };
}
