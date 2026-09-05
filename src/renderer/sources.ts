import {UUID, validateAnchor, type MessageAnchor} from '../shared/anchors.js';
import {conversationScope} from './conversation-layouts.js';
import {createNativeAccess} from './native.js';

export interface SourceMessage {anchor:MessageAnchor; text:string; role:'user'|'assistant'; node:HTMLElement}
export function sourceMessages(doc:Document):SourceMessage[] {
  const threadId=conversationScope(doc);if(!UUID.test(threadId))return [];
  const result:SourceMessage[]=[];
  const nodes=doc.querySelectorAll<HTMLElement>('[data-local-conversation-user-anchor], [data-response-annotation-conversation][data-response-annotation-target]');
  for(const node of nodes) {
    if(node.closest('[hidden],[aria-hidden="true"],[inert]'))continue;
    if(node.dataset.responseAnnotationConversation && node.dataset.responseAnnotationConversation!==threadId)continue;
    const key=node.getAttribute('data-content-search-unit-key') ?? node.closest('[data-content-search-unit-key]')?.getAttribute('data-content-search-unit-key');
    const turnId=key?.split(':')[0];
    const messageId=node.dataset.responseAnnotationTarget ?? key?.slice((key?.indexOf(':')??-1)+1);
    const body=node.querySelector('[data-markdown-text-tone="user-message"], [data-markdown-text-style="assistant-message"]') ?? node;
    const text=(body.textContent??'').trim();
    if(!messageId || !text)continue;
    result.push({anchor:{threadId,messageId,...(turnId&&UUID.test(turnId)?{turnId}:{}),quote:text.slice(0,10000)},text,role:node.hasAttribute('data-local-conversation-user-anchor')?'user':'assistant',node});
  }
  return result;
}
export function selectedSource(win:Window):SourceMessage|null {
  const selection=win.getSelection();if(!selection || selection.isCollapsed || !selection.rangeCount)return null;
  const range=selection.getRangeAt(0),text=selection.toString().trim();if(!text || text.length>10000)return null;
  const source=sourceMessages(win.document).find(row=>row.node.contains(range.startContainer)&&row.node.contains(range.endContainer));
  return source?{...source,text,anchor:{...source.anchor,quote:text}}:null;
}
export function findSource(doc:Document,anchor:MessageAnchor):HTMLElement|null {
  if(conversationScope(doc)!==anchor.threadId)return null;
  return sourceMessages(doc).find(row=>row.anchor.messageId===anchor.messageId)?.node??null;
}
export function createSourceNavigator(win:Window,native=createNativeAccess(win)) {
  let request=0,disposed=false;
  const delay=(ms:number)=>new Promise<void>(resolve=>win.setTimeout(resolve,ms));
  async function go(value:MessageAnchor) {
    const anchor=validateAnchor(value),id=++request;
    if(conversationScope(win.document)!==anchor.threadId)await native.navigate(anchor.threadId);
    for(let i=0;i<60 && conversationScope(win.document)!==anchor.threadId;i++) {if(disposed||id!==request)return;await delay(100);}
    if(conversationScope(win.document)!==anchor.threadId)throw Error('无法打开原对话，可能已归档或删除。');
    if(!findSource(win.document,anchor)) {await native.hydrate(anchor);await native.reveal(anchor);}
    for(let i=0;i<60;i++) {
      if(disposed||id!==request)return;
      const node=findSource(win.document,anchor);
      if(node) {
        node.scrollIntoView?.({block:'center',behavior:'instant'});node.setAttribute('data-sidecar-source-highlight','true');
        win.setTimeout(()=>node.removeAttribute('data-sidecar-source-highlight'),2500);return;
      }
      await delay(100);
    }
    throw Error('已打开原对话，但未找到这条消息。原文可能已被编辑或删除。');
  }
  return {go,destroy(){disposed=true;request++;}};
}
