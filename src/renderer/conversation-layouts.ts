export type ToolKind='notes'|'bookmarks'|'translation';
const KEY='codex-sidecar.context-open.v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** The app uses an in-memory router; location.href does not change between tasks. */
export function conversationScope(doc:Document):string {
 const ids=[...doc.querySelectorAll('[data-above-composer-conversation-id]')].filter(e=>!e.closest('[hidden],[aria-hidden="true"],[inert]')).map(e=>e.getAttribute('data-above-composer-conversation-id')!).filter(id=>UUID.test(id));
 if(new Set(ids).size===1)return ids[0]!.toLowerCase();
 const selected=doc.querySelector('[data-app-action-sidebar-thread-selected="true"][data-app-action-sidebar-thread-id]')?.getAttribute('data-app-action-sidebar-thread-id')?.split(':').at(-1);
 if(selected&&UUID.test(selected)&&doc.querySelector('[data-app-action-timeline-scroll]'))return selected.toLowerCase();
 return 'page';
}
export function createConversationLayouts(win:Window,onChange:(scope:string)=>void){
 let scope=conversationScope(win.document),closed=false;
 const records=new Map<string,Partial<Record<ToolKind,boolean>>>();
 try{const rows=JSON.parse(win.sessionStorage.getItem(KEY)??'[]');if(Array.isArray(rows))for(const [id,value] of rows.slice(-100)){if((id==='page'||UUID.test(id))&&value&&typeof value==='object'){const row:Partial<Record<ToolKind,boolean>>={};for(const k of ['notes','bookmarks','translation'] as const)if(typeof value[k]==='boolean')row[k]=value[k];records.set(id,row);}}}catch{}
 const check=()=>{if(closed)return;const next=conversationScope(win.document);if(next!==scope){scope=next;onChange(scope);}};
 const Observer=(win as unknown as {MutationObserver:typeof MutationObserver}).MutationObserver;
 const observer=new Observer(check);const root=win.document.getElementById('root');if(root)observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-above-composer-conversation-id','data-app-action-sidebar-thread-selected','data-app-action-sidebar-thread-id','hidden','aria-hidden']});
 return{
  get scope(){return scope;},check,
  isOpen(kind:ToolKind){return records.get(scope)?.[kind]===true;},
  setOpen(kind:ToolKind,value:boolean){const row={...records.get(scope),[kind]:value};records.delete(scope);records.set(scope,row);while(records.size>100)records.delete(records.keys().next().value!);try{win.sessionStorage.setItem(KEY,JSON.stringify([...records]));}catch{}},
  destroy(){closed=true;observer.disconnect();},
 };
}
