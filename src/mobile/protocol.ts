import {UUID} from '../shared/anchors.js';
export interface Attachment {mime:string;data:string;name:string}
export interface MobileCommand {id:string;kind:'read'|'send'|'idea';threadId?:string;cursor?:string;text?:string;attachments?:Attachment[];createdAt:number;status:'queued'|'dispatching'|'delivered'|'unknown'|'failed';error?:string;result?:unknown;dispatchedAt?:number}
export interface MobileThread {id:string;title:string;updatedAt:number;status:string}
export interface MobileMessage {id:string;turnId:string;role:'user'|'assistant';text:string}
export interface MobileRead {threadId:string;messages:MobileMessage[];cursor:string|null;updatedAt:number}
export const MAX_BODY=9*1024*1024;
export function attachments(value:unknown):Attachment[] {
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>3)throw Error('最多添加 3 个附件');
 let total=0;
 return value.map(v=>{if(!v||typeof v!=='object'||typeof v.mime!=='string'||!['image/png','image/jpeg','image/webp','audio/webm','audio/mp4','audio/wav','audio/ogg'].includes(v.mime)||typeof v.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.data)||v.data.length%4!==0||typeof v.name!=='string'||v.name.length>200)throw Error('附件格式不支持');total+=v.data.length;if(total>7*1024*1024)throw Error('附件合计请小于 5 MB');return {mime:v.mime,data:v.data,name:v.name};});
}
export function validateCommand(value:unknown):Pick<MobileCommand,'id'|'kind'|'threadId'|'cursor'|'text'|'attachments'> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid command');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['id','kind','threadId','cursor','text','attachments'].includes(k))||typeof v.id!=='string'||!UUID.test(v.id)||!['read','send','idea'].includes(String(v.kind)))throw Error('Invalid command');
 const kind=v.kind as MobileCommand['kind'];
 if(kind!=='idea'&&(typeof v.threadId!=='string'||!UUID.test(v.threadId)))throw Error('请选择一个对话');
 if(v.cursor!==undefined&&(kind!=='read'||typeof v.cursor!=='string'||v.cursor.length>4000))throw Error('Invalid history cursor');
 const files=attachments(v.attachments);
 if(kind!=='read'&&(typeof v.text!=='string'||v.text.length>30000||(!v.text.trim()&&!files.length)))throw Error('请输入消息或添加附件');
 if(kind==='send'&&files.some(a=>a.mime.startsWith('audio/')))throw Error('录音请先保存到随手记，或使用键盘语音输入转为文字');
 return {id:v.id,kind,...(kind!=='idea'?{threadId:v.threadId as string}:{}),...(v.cursor!==undefined?{cursor:v.cursor as string}:{}),...(kind!=='read'?{text:v.text as string,attachments:files}:{})};
}
