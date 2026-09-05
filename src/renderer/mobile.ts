import {createNativeAccess} from './native.js';
import {messagesFromTurns} from './personal-tools.js';
import {validateCommand} from '../mobile/protocol.js';
export function createMobileAccess(win:Window) {
 const native=createNativeAccess(win);
 return async(action:string,value:unknown={})=>{
  if(action==='list') {
   const result=await native.read('thread/list',{limit:100,archived:false,sortKey:'updated_at'});
   return (result.data??[]).map((t:any)=>({id:t.id,title:t.name||t.preview?.slice(0,120)||'未命名对话',updatedAt:t.updatedAt,status:t.status?.type??'unknown'}));
  }
  if(action==='ready'){await native.read('thread/list',{limit:1,archived:false});return true;}
  const command=validateCommand(value);
  if(action==='send'&&command.kind==='send')return native.send(command);
  if(action==='read'&&command.kind==='read') {
   const result=await native.read('thread/turns/list',{threadId:command.threadId,limit:12,sortDirection:'desc',itemsView:'full',...(command.cursor?{cursor:command.cursor}:{})});
   return {threadId:command.threadId,messages:messagesFromTurns(command.threadId!,[...(result.data??[])].reverse()).map(r=>({id:r.source.messageId,turnId:r.source.turnId,role:r.role,text:r.text})),cursor:result.nextCursor??null};
  }
  throw Error('Unsupported mobile action');
 };
}
