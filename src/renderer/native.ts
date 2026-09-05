import {UUID, type MessageAnchor} from '../shared/anchors.js';
import {validateCommand} from '../mobile/protocol.js';

// A deliberately versioned adapter. No installed application files are patched.
// Unknown bundles fail closed; ordinary Sidecar notes/theme remain usable.
const BUNDLE = 'app://-/assets/app-initial-14e7352db43a.js';
const PRIMARY = 'app://-/assets/app-primary-cf3627f46e1e.js';
type NativeModule = Record<string, any>;
export function createNativeAccess(win: Window) {
  let module: Promise<NativeModule> | undefined;
  const load = () => module ??= import(/* @vite-ignore */ BUNDLE);
  function scope(m: NativeModule): any {
    const nodes = [win.document.querySelector('[data-thread-find-target="conversation"]'), win.document.querySelector('[data-codex-composer="true"]'), win.document.querySelector('main')];
    for (const node of nodes) {
      if (!node) continue;
      const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
      let fiber = key ? (node as any)[key] : null;
      for (let depth=0; fiber && depth++<100; fiber=fiber.return) {
        let hook=fiber.memoizedState;
        for (let count=0; hook && count++<150; hook=hook.next) {
          const ref=hook.memoizedState?.current;
          if (ref?.scope===m.h1t && typeof ref.get==='function') return ref;
        }
      }
    }
    throw Error('当前 Codex 页面尚未就绪，或版本尚未适配。');
  }
  async function manager() { const m=await load(); return m.p1t(scope(m),'local'); }
  const allowed = new Set(['thread/list','thread/read','thread/turns/list','thread/search','thread/searchOccurrences']);
  async function read(method:string, params:Record<string,unknown>):Promise<any> {
    if(!allowed.has(method))throw Error('Unsupported native read');
    return (await manager()).sendRequest(method,params,{priority:'background',source:'thread'});
  }
  async function navigate(threadId:string) {
    if(!UUID.test(threadId))throw Error('Invalid thread');
    (await load()).bun.dispatchHostMessage({type:'navigate-to-route',path:'/local/'+threadId});
  }
  async function hydrate(anchor:MessageAnchor) {
    if(!anchor.turnId)return;
    const client=await manager();
    const matches=await read('thread/searchOccurrences',{threadId:anchor.threadId,searchTerm:anchor.quote.trim().slice(0,100),limit:100});
    const hit=matches.data?.find((v:any)=>v.itemId===anchor.messageId && v.turnId===anchor.turnId);
    if(!hit?.turnCursor){await client.ensureConversationHistoryLoaded(anchor.threadId,[],{force:true});return;}
    try {
      await client.hydrateConversationSearchMatch({conversationId:anchor.threadId,itemId:anchor.messageId,turnId:anchor.turnId,turnCursor:hit.turnCursor});
    } catch(error) {
      if(!String(error).includes('Persisted conversation search match'))throw error;
      // Some desktop builds return a valid turn cursor but hydrate an empty
      // item page. Use the native complete-history path, preserving ownership.
      await client.ensureConversationHistoryLoaded(anchor.threadId,[],{force:true});
    }
  }
  async function reveal(anchor:MessageAnchor) {
    const m=await load(), primary=await import(/* @vite-ignore */ PRIMARY);
    // Read the native registered reveal controller through its registration API.
    // The synthetic scope only captures the atom; it never replaces the controller.
    let atom:unknown;
    primary.fi({set:(a:unknown)=>{atom=a;}},anchor.threadId,null);
    const controller=scope(m).get(atom,anchor.threadId);
    if(controller?.revealItem)await controller.revealItem({conversationId:anchor.threadId,itemId:anchor.messageId,turnKey:anchor.turnId});
  }
  async function voiceState():Promise<any> {return (await load()).kWt('global-dictation-hotkey-state');}
  async function setVoiceToggle(hotkey:string):Promise<any> {
    if(!['Ctrl+Alt+D','CommandOrControl+Alt+D'].includes(hotkey))throw Error('Unsupported dictation shortcut');
    return (await load()).kWt('global-dictation-set-toggle-hotkey',{params:{hotkey}});
  }
  async function send(value:unknown) {
    const command=validateCommand(value);
    if(command.kind!=='send')throw Error('Unsupported native send');
    const client=await manager();
    if(typeof client.sendFollowUpMessage!=='function')throw Error('当前 Codex 版本不支持手机发送');
    const turnId=await client.sendFollowUpMessage(command.threadId,{
      prompt:command.text?.trim()||'请查看附图。',
      inputItems:command.attachments?.map(a=>({type:'image',url:`data:${a.mime};base64,${a.data}`}))??[],
      messageMetadata:{sidecarMessageId:command.id},
    });
    return {turnId:typeof turnId==='string'?turnId:undefined};
  }
  return {read,navigate,hydrate,reveal,voiceState,setVoiceToggle,send};
}
