import {desktopTools,toolGroups,type ShortcutTool} from '../shared/tools.js';
import {createStudyTimer} from './study-timer.js';
import type {Action,Appearance,HostMessage,StoredState,ToolRecord} from '../shared/types.js';
import type {MessageAnchor} from '../shared/anchors.js';
import {UUID} from '../shared/anchors.js';
import {button,element,icon} from './components.js';
import {styles} from './styles.js';
import {royalStyles} from './royal-styles.js';
import {createFloatingFrame} from './floating.js';
import {conversationScope} from './conversation-layouts.js';
import {createWindowPin,readWindowPin} from './window-pin.js';
import {createAppearance,defaultAppearance} from './appearance.js';
import {createNativeAccess} from './native.js';
import {createSourceNavigator,sourceMessages,selectedSource} from './sources.js';

type Result=Extract<HostMessage,{type:'result'}>;
const titles={tools:'工具箱',timer:'学习计时',outline:'对话目录',search:'找回原文',snippets:'常用片段',resume:'接着聊',inbox:'工作收件箱',decisions:'当前决定',learning:'学习桌',resources:'软件与成果',ideas:'随手记',appearance:'外观',voice:'语音输入',mobile:'手机入口'};
type Kind=keyof typeof titles;
// Mobile use has moved to official Remote. Keep the optional bridge and data,
// but do not offer or restore the retired pairing panel in the desktop UI.
const visibleTool=(kind:Kind)=>kind!=='mobile';
interface Panel {drawer:HTMLElement;body:HTMLElement;status:HTMLElement;frame:ReturnType<typeof createFloatingFrame>;pin:ReturnType<typeof createWindowPin>;scope:string;layout:()=>void;refresh?:()=>void}
export interface ReadMessage {source:MessageAnchor;role:string;text:string}
export function messagesFromTurns(threadId:string,turns:any[]):ReadMessage[] {
 const rows:ReadMessage[]=[];
 for(const turn of turns)for(const item of turn.items??[]) {
  if(!['userMessage','agentMessage'].includes(item.type))continue;
  const text=item.type==='agentMessage'?item.text:(item.content??[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n');
  if(typeof text!=='string'||!text.trim()||typeof item.id!=='string')continue;
  rows.push({source:{threadId,messageId:item.id,turnId:turn.id,quote:text.slice(0,10000)},role:item.type==='userMessage'?'user':'assistant',text});
 }
 return rows;
}
export function insertComposer(win:Window,text:string):boolean {
 const composer=win.document.querySelector<HTMLElement>('[data-codex-composer="true"]');
 if(!composer || !text)return false;
 composer.focus();const selection=win.getSelection(),range=win.document.createRange();range.selectNodeContents(composer);range.collapse(false);selection?.removeAllRanges();selection?.addRange(range);
 return win.document.execCommand?.('insertText',false,(composer.textContent?.trim()?'\n\n':'')+text)??false;
}
export function createPersonalTools(win:Window,openTranslation:(text:string)=>void,front?:()=>number) {
 const doc=win.document,native=createNativeAccess(win),navigator=createSourceNavigator(win,native),appearance=createAppearance(win);
 let state:StoredState|null=null,seq=0,scope=conversationScope(doc),disposed=false,layer=2147400000;
 const pending=new Map<string,{resolve:(r:Result)=>void;reject:(e:Error)=>void;timer:number}>();
 const host=element(doc,'div');host.id='codex-sidecar-personal-tools';host.style.cssText='display:contents;pointer-events:none;';
 const shadow=host.attachShadow({mode:'open'}),style=element(doc,'style');
 style.textContent=styles+royalStyles+`
:host{font-family:var(--sidecar-font,"HarmonyOS Sans SC","Segoe UI",sans-serif);color:#493057;font-size:13px}
.drawer{position:fixed;right:22px;bottom:68px;width:410px;height:650px;max-height:calc(100vh - 120px);border-radius:22px;background:rgba(251,248,253,var(--sidecar-panel-opacity,.97));backdrop-filter:blur(18px);pointer-events:auto}
.content{padding:18px;overflow:auto;flex:1;min-height:0}.drawer-header{padding:15px 18px}.drawer-header h1{font-size:18px;flex:1}.list{display:flex;flex-direction:column;gap:9px}.tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.tool-grid button{justify-content:flex-start;min-height:46px;border-radius:14px}.entry{display:block;width:100%;text-align:left;padding:13px;border-radius:14px;border:1px solid #dfd5e2;background:#fffdfbaa;color:#493057;overflow-wrap:anywhere}.entry:hover{background:#eee5f4}.entry strong{display:block;margin-bottom:6px}.entry small{color:#88768d;display:block;font-size:11px}.entry p{white-space:pre-wrap;line-height:1.6;margin:6px 0;color:#6a5b71}.actions{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.help{color:#85768c;font-size:12px;line-height:1.7;margin:0 0 14px}.form textarea{min-height:120px;resize:vertical}.search-row{display:flex;gap:7px;margin-bottom:15px}.search-row input{min-width:0;flex:1;border:1px solid #d3c5dc;border-radius:12px;padding:9px;background:#fffdfb}.status{white-space:pre-wrap}.source-text{white-space:pre-wrap;line-height:1.75;overflow-wrap:anywhere}.learning-answer{margin-top:12px}.toolbar{position:fixed;display:flex;gap:3px;align-items:center;padding:5px;border:1px solid #d4c4dd;border-radius:14px;background:#fffdfb;box-shadow:0 6px 25px #34204426;pointer-events:auto;z-index:2147483600}.toolbar button{font-size:12px;border-radius:10px;padding:8px}.toolbar .toast{max-width:220px;font-size:11px;color:#74617e}input[type=range]{width:100%;accent-color:#765389}.field{display:flex;flex-direction:column;gap:8px;margin:10px 0}.big-result{white-space:pre-wrap;line-height:1.8}.meta{font-size:11px;color:#8b7a93}.form select{padding:8px;border:1px solid #d3c5dc;border-radius:10px}
`;
 shadow.append(style);doc.body.append(host);
 const panels=new Map<Kind,Panel>(),openByScope=new Map<string,Kind[]>();
 try{const saved=JSON.parse(win.sessionStorage.getItem('codex-sidecar.personal-open.v1')??'[]');for(const [key,value] of saved)if(typeof key==='string'&&Array.isArray(value))openByScope.set(key,value.filter((k:Kind)=>k in titles&&visibleTool(k)));}catch{}
 const remember=()=>{const prior=openByScope.get(scope)??[];openByScope.set(scope,[...panels].filter(([k,p])=>p.pin.pinned?prior.includes(k):!p.drawer.hidden).map(([k])=>k));while(openByScope.size>100)openByScope.delete(openByScope.keys().next().value!);try{win.sessionStorage.setItem('codex-sidecar.personal-open.v1',JSON.stringify([...openByScope]));}catch{}};
 function request(action:Action,payload:Record<string,unknown>):Promise<Result> {
  return new Promise((resolve,reject)=>{
   if(!win.__codexSidecarSend){reject(Error('Sidecar 尚未连接'));return;}
   const id=`personal-${Date.now()}-${++seq}`,timer=win.setTimeout(()=>{pending.delete(id);reject(Error('操作超时，内容已保留。'));},action==='assist'?100000:15000);
   pending.set(id,{resolve,reject,timer});try{win.__codexSidecarSend(JSON.stringify({id,action,payload}));}catch(e){pending.delete(id);win.clearTimeout(timer);reject(e as Error);}
  });
 }
 const save=(action:Action,payload:Record<string,unknown>)=>{if(!state)return Promise.reject(Error('正在连接'));return request(action,{...payload,revision:state.revision});};
 const studyTimer=createStudyTimer(win,command=>save('timer.command',{command}),()=>{appearance.setFocus(false);open('timer');});shadow.append(studyTimer.style,studyTimer.badge);
 function tell(panel:Panel,message:string) {panel.status.textContent=message;panel.status.hidden=!message;}
 function act(panel:Panel,fn:()=>Promise<unknown>) {tell(panel,'');void fn().catch(e=>tell(panel,e instanceof Error?e.message:String(e)));}
 function control(label:string,fn:()=>void){const b=button(doc,label,'personal-'+label);b.onclick=fn;return b;}
 function field(form:HTMLElement,label:string,value='',multi=false) {const wrap=element(doc,'label','field'),input=multi?element(doc,'textarea'):element(doc,'input');wrap.append(element(doc,'span','',label),input);input.value=value;form.append(wrap);return input;}
 function sourceLink(panel:Panel,source:MessageAnchor) {return control('回到原消息',()=>act(panel,()=>navigator.go(source)));}
 function make(kind:Kind):Panel {
  let panel=panels.get(kind);if(panel)return panel;
  const drawer=element(doc,'section','drawer');drawer.hidden=true;drawer.dataset.tool=kind;drawer.setAttribute('aria-label',titles[kind]);
  const header=element(doc,'div','drawer-header'),heading=element(doc,'h1','grow',titles[kind]),close=button(doc,'收起','close-'+kind,'close','icon-button');if(kind==='timer'||kind==='tools'){const mark=icon(doc,kind==='timer'?'clock':'folder');mark.style.cssText='width:24px;height:24px;margin-right:10px';header.append(mark);}header.append(heading,close);
  const status=element(doc,'div','status');status.hidden=true;status.setAttribute('role','status');const body=element(doc,'div','content');drawer.append(header,status,body);shadow.append(drawer);
  const bounds=()=>({width:win.innerWidth,height:win.innerHeight,top:Math.max(60,doc.querySelector('header[data-app-shell-header-layout]')?.getBoundingClientRect().bottom??60)+10});
  const layout=()=>{const f=frame.current();if(f){Object.assign(drawer.style,{left:f.x+'px',top:f.y+'px',right:'auto',bottom:'auto',width:f.width+'px',height:f.height+'px',maxHeight:f.height+'px'});}};
  const frame=createFloatingFrame(win,drawer,header,bounds,layout,'codex-sidecar.frame.v1.'+kind);
  const pin=createWindowPin(win,kind,pinned=>{frame.carry(pinned?'$pinned':scope,pinned);if(!pinned)panel!.scope=scope;remember();});header.insertBefore(pin.button,close);
  frame.activate(pin.pinned?'$pinned':scope,false,pin.pinned);panel={drawer,body,status,frame,pin,scope,layout};panels.set(kind,panel);
  const hide=()=>{drawer.hidden=true;pin.setOpen(false);remember();};
  drawer.addEventListener('pointerdown',()=>{drawer.style.zIndex=host.style.zIndex=String(front?.()??++layer);});close.onclick=hide;
  drawer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();hide();}});return panel;
 }
 const views=new Map<Panel,Map<string,{nodes:Node[];refresh?:()=>void}>>();
 function activatePanel(p:Panel,next:string){if(p.drawer.dataset.tool==='timer'){p.scope=next;return;}if(p.scope===next)return;let cache=views.get(p);if(!cache){cache=new Map();views.set(p,cache);}cache.set(p.scope,{nodes:[...p.body.childNodes],refresh:p.refresh});while(cache.size>30)cache.delete(cache.keys().next().value!);const saved=cache.get(next);p.scope=next;p.body.replaceChildren(...saved?.nodes??[]);p.refresh=saved?.refresh;}
 function open(kind:Kind|ShortcutTool='tools') {if(kind==='focus'){appearance.setFocus(true);return;}if(!visibleTool(kind))return;const p=make(kind);if(!p.pin.pinned)activatePanel(p,scope);p.drawer.hidden=false;p.pin.setOpen(true);p.drawer.style.zIndex=host.style.zIndex=String(front?.()??++layer);if(!p.body.childNodes.length)render(kind,p);if(kind==='timer')p.body.scrollTop=0;remember();}
 function render(kind:Kind,p:Panel) {
  p.body.replaceChildren();tell(p,'');p.refresh=undefined;
  if(kind==='tools') {
   renderToolbox(p);return;
  }
  if(kind==='timer'){p.body.append(studyTimer.element);return;}
  if(kind==='appearance'){renderAppearance(p);return;}
  if(kind==='voice'){renderVoice(p);return;}
  if(kind==='mobile'){renderMobile(p);return;}
  if(kind==='outline'){renderOutline(p);return;}
  if(kind==='search'){renderSearch(p);return;}
  if(kind==='resume'){renderResume(p);return;}
  if(kind==='inbox'){renderInbox(p);return;}
  const mapping={snippets:'snippet',decisions:'decision',learning:'learning',resources:'resource',ideas:'idea'} as const;
  renderLibrary(p,mapping[kind]);
 }
 function renderMobile(p:Panel) {
  p.body.append(element(doc,'p','help','手机进入原对话继续聊。桌面离线时可看缓存，消息会等待电脑上线。配对码 10 分钟有效，只能使用一次。'));
  const status=element(doc,'p','source-text','正在读取连接状态…'),code=element(doc,'p','source-text');p.body.append(status,code);
  act(p,async()=>{const result=await request('mobile',{action:'status'}),data=result.data as any;status.textContent=data?.configured?data.url+'\n'+(data.online?'桌面已连接':data.error||'正在连接'):'尚未配置服务器连接';});
  p.body.append(control('生成手机配对码',()=>act(p,async()=>{const result=await request('mobile',{action:'pair'}),data=result.data as any;if(!data?.code)throw Error('先配置服务器连接');code.textContent=data.code;const link=data.url+'#pair='+data.code;p.body.append(control('复制配对链接',()=>act(p,()=>win.navigator.clipboard.writeText(link))));tell(p,'手机打开入口后输入此码。不要公开配对链接。');})),control('撤销所有手机登录',()=>act(p,async()=>{await request('mobile',{action:'revoke'});code.textContent='';tell(p,'所有手机登录已撤销。');})));
 }
 function renderToolbox(p:Panel){
  p.body.append(element(doc,'p','help','点图钉加入快捷栏 · 点击栏目展开或折叠'));
  const css=element(doc,'style');css.textContent=`.tool-group{margin:0 0 20px}.tool-group:last-child{margin-bottom:0}.tool-group-title{display:flex;align-items:center;gap:9px;color:#725c7e;font-size:12px;font-weight:600;margin:0 0 9px}.tool-group-title::after{content:'';height:1px;background:#e5dce9;flex:1}.tool-entry{display:flex;align-items:center;min-width:0;padding:4px;background:#fffdfb;border:1px solid #dfd4e4;border-radius:15px}.tool-entry:hover{background:#f3edf7;border-color:#cab7d5}.tool-entry .tool-launch{flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:8px 4px 8px 7px;border:0;background:transparent;font-size:12px;text-align:left;min-height:36px}.tool-launch .icon{width:16px;height:16px;color:#886b99}.tool-entry .tool-pin{flex:none;width:28px;height:30px;min-height:30px;padding:5px;border-radius:10px;color:#a295aa;background:transparent}.tool-entry .tool-pin[aria-pressed=true]{background:#e9deef;color:#573367}.tool-pin .icon{width:15px;height:15px}.tool-pin:hover{background:#eee6f3}.tool-entry:has(.tool-pin[aria-pressed=true]){border-color:#cbb8d7}`;p.body.append(css);
  const pins=new Map<ShortcutTool,HTMLButtonElement>();const pendingPins=new Set<ShortcutTool>();
  const refresh=()=>{for(const [key,pin]of pins){const saved=state?.settings.shortcuts?.includes(key)??false;pin.setAttribute('aria-pressed',String(saved));pin.title=(saved?'移出快捷栏：':'加入快捷栏：')+desktopTools[key].title;pin.setAttribute('aria-label',pin.title);pin.disabled=!state||pendingPins.has(key);}};
  const accordion=element(doc,'style');accordion.textContent=`.drawer[data-tool=tools] .drawer-header h1{font-size:16px}.tool-group{margin:0;padding:12px 0;border-bottom:1px solid #e5dce9}.tool-group:last-child{border:0}.tool-group-title{margin:0;padding:12px 14px;border-radius:12px;background:#f1ecf5;color:#493057;font-size:13px;font-weight:500;cursor:pointer;list-style:none;user-select:none}.tool-group-title::-webkit-details-marker{display:none}.tool-group-title::after{display:none}.tool-group-title .group-count{margin-left:auto;font-size:11px;color:#7e6a89}.tool-group-title .group-chevron{width:15px;height:15px;transform:rotate(180deg)}.tool-group[open] .group-chevron{transform:rotate(270deg)}.tool-group .tool-grid{display:flex;flex-direction:column;gap:4px;padding-top:8px}.tool-group .tool-entry{border-color:transparent;background:transparent;padding:2px 6px}.tool-group .tool-entry:hover,.tool-group .tool-entry:has(.tool-pin[aria-pressed=true]){background:#f1ebf5;border-color:transparent}.tool-group .tool-launch{font-size:14px;padding:10px 8px;gap:13px;min-height:44px}.tool-group .tool-launch .icon{width:23px;height:23px;color:#493057}.tool-group .tool-pin{width:34px;height:34px}.tool-group .tool-pin[aria-pressed=true]{background:transparent}.tool-group .tool-pin .icon{width:18px;height:18px}.tool-group-title:focus-visible{outline:2px solid #886b99;outline-offset:2px}`;p.body.append(accordion);
  let collapsed:string[]=[];try{const stored=JSON.parse(win.localStorage.getItem('codex-sidecar.tool-groups.v1')??'null');collapsed=Array.isArray(stored)?stored.filter(x=>typeof x==='string'):toolGroups.slice(2).map(g=>g.title);}catch{}
  for(const group of toolGroups){const section=element(doc,'details','tool-group'),heading=element(doc,'summary','tool-group-title'),grid=element(doc,'div','tool-grid');section.open=!collapsed.includes(group.title);section.setAttribute('aria-label',group.title);heading.append(element(doc,'span','group-label',group.title));heading.append(element(doc,'span','group-count',String(group.tools.length)));const chevron=button(doc,'','unused','back','icon-button').firstElementChild!;chevron.classList.add('group-chevron');heading.append(chevron);section.append(heading,grid);
   section.addEventListener('toggle',()=>{let values:string[]=[];try{const saved=JSON.parse(win.localStorage.getItem('codex-sidecar.tool-groups.v1')??JSON.stringify(collapsed));if(Array.isArray(saved))values=saved.filter(x=>typeof x==='string');}catch{}values=values.filter(x=>x!==group.title);if(!section.open)values.push(group.title);try{win.localStorage.setItem('codex-sidecar.tool-groups.v1',JSON.stringify(values));}catch{}});
   for(const key of group.tools){const info=desktopTools[key],entry=element(doc,'div','tool-entry'),launch=button(doc,info.title,'personal-'+info.title,info.icon,'tool-launch'),pin=button(doc,'加入快捷栏：'+info.title,'pin-tool-'+key,'pin','icon-button tool-pin');launch.onclick=()=>open(key);pins.set(key,pin);
    pin.onclick=()=>{if(!state||pendingPins.has(key))return;const selected=state.settings.shortcuts??[],shortcuts=selected.includes(key)?selected.filter(k=>k!==key):[...selected,key];pendingPins.add(key);refresh();act(p,async()=>{try{await save('settings.patch',{shortcuts});}finally{pendingPins.delete(key);refresh();}});};entry.append(launch,pin);grid.append(entry);
   }p.body.append(section);
  }p.refresh=refresh;refresh();
 }
 function renderAppearance(p:Panel) {
  let draft={...defaultAppearance,...state?.settings.appearance};p.body.append(element(doc,'p','help','拖动即可预览。保存后同步到所有 Codex 窗口；关闭面板前可恢复已保存的设置。'));
  const select=element(doc,'select');for(const [value,label] of [['harmony','HarmonyOS Sans · 柔和圆润'],['system','Windows 系统字体'],['yahei','微软雅黑 · 清晰稳重']]){const option=element(doc,'option','',label);option.value=value!;select.append(option);}select.value=draft.font;select.onchange=()=>{draft.font=select.value as Appearance['font'];appearance.apply(draft);};p.body.append(select);
  for(const [key,label,min,max,step] of [['size','聊天字号',13,22,1],['lineHeight','行距',1.4,2.2,.1],['opacity','工具窗不透明度',70,100,1],['wallpaper','背景显现程度',0,100,1]] as const) {
   const wrap=element(doc,'label','field'),caption=element(doc,'span','',`${label} · ${draft[key]}`),range=element(doc,'input');range.type='range';range.min=String(min);range.max=String(max);range.step=String(step);range.value=String(draft[key]);range.setAttribute('aria-label',label);range.oninput=()=>{draft[key]=Number(range.value);caption.textContent=`${label} · ${range.value}`;appearance.apply(draft);};wrap.append(caption,range);p.body.append(wrap);
  }
  const actions=element(doc,'div','actions');actions.append(control('保存外观',()=>act(p,async()=>{await save('settings.patch',{appearance:draft});tell(p,'已保存到所有窗口');})),control('恢复已保存',()=>{appearance.apply(state?.settings.appearance);renderAppearanceReset(p);}));p.body.append(actions);
 }
 function renderAppearanceReset(p:Panel){p.body.replaceChildren();renderAppearance(p);}
 function renderVoice(p:Panel) {
  p.body.append(element(doc,'p','help','用 Codex 原生录音：按一下开始，再按一下停止。无需一直按住三个键。'));
  const status=element(doc,'p','source-text','正在读取快捷键…');p.body.append(status);
  act(p,async()=>{const result=await native.voiceState();status.textContent=result.supported?`切换录音：${result.configuredToggleHotkey??'尚未绑定'}`:'当前系统不支持原生全局录音快捷键';});
  p.body.append(control('设置 Ctrl + Alt + D',()=>act(p,async()=>{const result=await native.setVoiceToggle('Ctrl+Alt+D');if(!result.success)throw Error(result.error??'快捷键未能注册');status.textContent='切换录音：Ctrl + Alt + D';tell(p,'已注册。现在按一次开始，再按一次停止。');})));
 }
 async function readMessages(threadId:string,cursor?:string) {if(!UUID.test(threadId))throw Error('先打开一个对话');const data=await native.read('thread/turns/list',{threadId,limit:30,sortDirection:'desc',itemsView:'full',...(cursor?{cursor}:{})});return {rows:messagesFromTurns(threadId,[...(data.data??[])].reverse()),cursor:data.nextCursor as string|null};}
 function renderOutline(p:Panel) {
  const list=element(doc,'div','list');p.body.append(element(doc,'p','help','按你提出的问题回看对话。点击即可定位到原消息。'),list);
  const currentScope=scope;let records:ReadMessage[]=sourceMessages(doc).filter(r=>r.role==='user').map(r=>({source:r.anchor,role:r.role,text:r.text})),cursor:string|null=null;
  const draw=()=>{list.replaceChildren();for(const [i,row] of records.entries()){const entry=element(doc,'button','entry');entry.append(element(doc,'small','',String(i+1).padStart(2,'0')),element(doc,'p','',row.text.slice(0,180)));entry.onclick=()=>act(p,()=>navigator.go(row.source));list.append(entry);}};draw();
  const more=control('读取更早的问题',()=>act(p,async()=>{const result=await readMessages(currentScope,cursor??undefined);records=[...result.rows.filter(r=>r.role==='user'),...records].filter((r,i,all)=>all.findIndex(x=>x.source.messageId===r.source.messageId)===i);cursor=result.cursor;draw();more.disabled=!cursor;}));p.body.prepend(more);
  p.refresh=()=>{if(conversationScope(doc)!==currentScope)return;records=sourceMessages(doc).filter(r=>r.role==='user').map(r=>({source:r.anchor,role:r.role,text:r.text}));draw();};
 }
 function renderSearch(p:Panel) {
  p.body.append(element(doc,'p','help','可以描述你记得的内容。先搜索原文；描述太长时可让 Sol 提炼关键词。'));
  const row=element(doc,'form','search-row'),input=element(doc,'input');input.placeholder='例如：之前说的手机入口怎么做';input.setAttribute('aria-label','搜索历史消息');const submit=button(doc,'搜索','search-submit');submit.type='submit';row.append(input,submit);p.body.append(row);const list=element(doc,'div','list');p.body.append(list);
  async function search(terms:string[]) {
   list.replaceChildren();tell(p,'正在搜索原始聊天记录…');const results=new Map<string,any>();
   for(const term of terms.slice(0,3)){const found=await native.read('thread/search',{searchTerm:term,limit:20,archived:false,sortKey:'updated_at'});for(const item of found.data??[])results.set(item.thread.id,{...item,term});}
   tell(p,results.size?'':'没有找到匹配内容。试试更短的关键词。');
   for(const item of results.values()) {
    const entry=element(doc,'article','entry');entry.append(element(doc,'strong','',item.thread.name||item.thread.preview?.slice(0,70)||'未命名对话'),element(doc,'p','',typeof item.snippet==='string'?item.snippet:JSON.stringify(item.snippet??'').slice(0,250)));
    entry.append(control('查看命中的消息',()=>act(p,async()=>{const hits=await native.read('thread/searchOccurrences',{threadId:item.thread.id,searchTerm:item.term,limit:20});if(!hits.data?.length){await native.navigate(item.thread.id);return;}entry.querySelector('.matches')?.remove();const matches=element(doc,'div','list matches');for(const hit of hits.data){const text=typeof hit.snippet==='string'?hit.snippet:hit.snippet?.text??hit.snippet?.content??item.term;const b=control(String(text).slice(0,180),()=>act(p,()=>navigator.go({threadId:item.thread.id,messageId:hit.itemId,turnId:hit.turnId,quote:item.term})));matches.append(b);}entry.append(matches);})));list.append(entry);
   }
  }
  row.onsubmit=e=>{e.preventDefault();if(input.value.trim())act(p,()=>search([input.value.trim()]));};
  p.body.insertBefore(control('用 Sol 理解这句描述',()=>act(p,async()=>{if(!input.value.trim())return;tell(p,'Sol 正在提炼关键词…');const result=await request('assist',{kind:'search',text:input.value});const terms=JSON.parse(result.text??'[]');if(!Array.isArray(terms)||!terms.every(t=>typeof t==='string'&&t.length<100))throw Error('关键词结果无法解析，请直接搜索');await search(terms);})),list);
 }
 function renderResume(p:Panel) {
  const currentScope=scope,rows=sourceMessages(doc).slice(-6);p.body.append(element(doc,'p','help','最近几条原文就在这里。需要时再生成续聊卡片，不会把摘要当成新的全局记忆。'));
  const result=element(doc,'div','big-result');p.body.append(result);
  for(const row of rows){const card=element(doc,'article','entry');card.append(element(doc,'small','',row.role==='user'?'你上次说':'最近回复'),element(doc,'p','',row.text.slice(0,300)),sourceLink(p,row.anchor));p.body.append(card);}
  p.body.prepend(control('生成续聊卡片 · Sol',()=>act(p,async()=>{tell(p,'正在整理最近的消息…');const {rows}=await readMessages(currentScope);const response=await request('assist',{kind:'resume',text:JSON.stringify(rows.slice(-16).map(r=>({id:r.source.messageId,role:r.role,text:r.text.slice(0,5000)})))});result.textContent=response.text??'';tell(p,'根据原文生成，请以原消息为准。');})));
 }
 function renderInbox(p:Panel) {
  p.body.append(element(doc,'p','help','汇总最近任务的实际状态。状态来自 Codex；打开任务后查看具体问题或结果。'));const list=element(doc,'div','list');p.body.append(list);
  const refresh=()=>act(p,async()=>{tell(p,'正在读取任务状态…');const result=await native.read('thread/list',{limit:50,archived:false,sortKey:'updated_at'});list.replaceChildren();for(const thread of result.data??[]){const status=thread.status?.type??'unknown';const flags=thread.status?.activeFlags??[];const label=status==='active'?(flags.includes('waitingOnUserInput')?'等你回答':flags.includes('waitingOnApproval')?'需要批准':'进行中'):status==='systemError'?'运行异常':status==='idle'?'已结束 · 可回看':'状态未知';const entry=element(doc,'button','entry');entry.append(element(doc,'small','',label),element(doc,'strong','',thread.name||thread.preview?.slice(0,80)||'未命名'),element(doc,'small','',new Date(thread.updatedAt*1000).toLocaleString('zh-CN')));entry.onclick=()=>act(p,()=>native.navigate(thread.id));list.append(entry);}tell(p,'');});p.body.prepend(control('刷新',refresh));refresh();
 }
 function renderLibrary(p:Panel,kind:ToolRecord['kind']) {
  const help={snippet:'保存常用表达，点击插入当前输入框，检查后再发送。',decision:'只记录你确认的决定。旧方案可标为已替代，原文仍可回看。',learning:'选取一段材料后打开学习桌。先作答，再看反馈与材料依据。',resource:'给软件、文件和输出留一个有用途说明的入口。',idea:'保存临时想法，再决定放进哪个对话。'};
  p.body.append(element(doc,'p','help',help[kind]));
  p.body.append(control('新建',()=>editRecord(p,kind)));
  if(kind==='learning')p.body.append(control('用当前选中文字学习',()=>{const source=selectedSource(win);editRecord(p,kind,undefined,source?.text,source?.anchor);}));
  const list=element(doc,'div','list');p.body.append(list);
  const draw=()=>{list.replaceChildren();const records=(state?.library??[]).filter(r=>r.kind===kind).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));if(!records.length)list.append(element(doc,'p','help','还没有内容。可以从选中的消息开始。'));for(const record of records){const card=element(doc,'article','entry');card.append(element(doc,'small','',record.status==='superseded'?'已被新决定替代':record.status==='done'?'已完成':''),element(doc,'strong','',record.title||'未命名'),element(doc,'p','',record.body.slice(0,240)));const actions=element(doc,'div','actions');actions.append(control('编辑',()=>editRecord(p,kind,record)));if(record.source)actions.append(sourceLink(p,record.source));if(kind==='snippet')actions.append(control('插入草稿',()=>tell(p,insertComposer(win,record.body)?'已插入输入框，检查后再发送。':'请先打开一个可输入的对话。')));if(kind==='learning')actions.append(control('开始练习',()=>learningSession(p,record)));if(kind==='resource'&&record.details&&/^https:\/\//.test(record.details))actions.append(control('打开',()=>act(p,()=>request('open.link',{url:record.details!}))));if(record.details&&['resource','idea'].includes(kind)&&/^[A-Za-z]:[\\/]/.test(record.details))actions.append(control('在文件夹中显示',()=>act(p,()=>request('resource.reveal',{id:record.id}))));if(kind==='idea')actions.append(control('放进当前对话草稿',()=>tell(p,insertComposer(win,record.body)?'已放入草稿。':'请先打开对话。')));card.append(actions);list.append(card);}};p.refresh=draw;draw();
 }
 function editRecord(p:Panel,kind:ToolRecord['kind'],record?:ToolRecord,body?:string,source?:MessageAnchor) {
  p.refresh=undefined;p.body.replaceChildren();const form=element(doc,'form','form');const title=field(form,'标题',record?.title??''),text=field(form,kind==='learning'?'学习材料':'内容',body??record?.body??'',true),details=kind==='resource'?field(form,'网页链接或本机路径',record?.details??''):null;
  const status=element(doc,'select');for(const [value,label] of [['active','当前使用'],['superseded','已被替代'],['done','已完成'],['pending','待处理']]){const o=element(doc,'option','',label);o.value=value!;status.append(o);}status.value=record?.status??'active';form.append(status);
  const actions=element(doc,'div','actions'),submit=button(doc,'保存','library-save');submit.type='submit';actions.append(submit,control('返回',()=>{p.body.replaceChildren();renderLibrary(p,kind);}));
  if(record){let confirm=false;actions.append(control('删除',()=>{if(!confirm){confirm=true;tell(p,'再点一次删除。');return;}act(p,async()=>{await save('library.delete',{id:record.id});p.body.replaceChildren();renderLibrary(p,kind);});}));}
  form.append(actions);p.body.append(form);form.onsubmit=e=>{e.preventDefault();act(p,async()=>{const anchor=source??record?.source;await save('library.save',{...(record?{id:record.id}:{}),kind,title:title.value.slice(0,200),body:text.value.slice(0,60000),status:status.value,...(anchor?{source:anchor}:{}),...((details?.value??record?.details)?{details:details?.value??record?.details}:{})});p.body.replaceChildren();renderLibrary(p,kind);});};
 }
 function learningSession(p:Panel,record:ToolRecord) {
  p.refresh=undefined;p.body.replaceChildren();p.body.append(control('返回材料列表',()=>{p.body.replaceChildren();renderLibrary(p,'learning');}));
  const material=element(doc,'details'),summary=element(doc,'summary','',record.title||'学习材料');material.append(summary,element(doc,'p','source-text',record.body));p.body.append(material);if(record.source)p.body.append(sourceLink(p,record.source));
  const questions=element(doc,'div','list');p.body.append(questions);
  function draw(data:any) {questions.replaceChildren();if(!Array.isArray(data.questions)||data.questions.length>8)throw Error('练习结果格式不正确');for(const item of data.questions){if(!['question','answer','evidence'].every(k=>typeof item[k]==='string'))throw Error('练习缺少题目或依据');const card=element(doc,'article','entry');card.append(element(doc,'strong','',item.question));const answer=field(card,'先写下你的理解',item.studentAnswer??'',true),feedback=element(doc,'p','source-text',item.feedback??'');answer.oninput=()=>{item.studentAnswer=answer.value;};const show=control('作答后看参考答案',()=>{if(!answer.value.trim()){answer.focus();return;}feedback.textContent=`参考答案\n${item.answer}\n\n材料依据\n${item.evidence}`;});card.append(show,control('请 Sol 点评我的回答',()=>{if(!answer.value.trim()){answer.focus();return;}act(p,async()=>{tell(p,'Sol 正在看你的回答…');const result=await request('assist',{kind:'feedback',text:JSON.stringify({material:record.body,question:item.question,answer:answer.value})});feedback.textContent=result.text??'';item.feedback=feedback.textContent;tell(p,'');});}),feedback);questions.append(card);}questions.append(control('保存这次练习',()=>act(p,async()=>{await save('library.save',{id:record.id,kind:record.kind,title:record.title,body:record.body,status:record.status,...(record.source?{source:record.source}:{}),details:JSON.stringify(data)});record.details=JSON.stringify(data);tell(p,'回答与反馈已保存，下次可以继续。');})));}
  if(record.details)try{draw(JSON.parse(record.details));}catch{tell(p,'保存的题目无法读取，请重新生成。');}
  p.body.insertBefore(control('根据材料生成 3 道题 · Sol',()=>act(p,async()=>{tell(p,'正在根据材料出题…');const response=await request('assist',{kind:'learning',text:record.body});const raw=(response.text??'').replace(/^```(?:json)?\s*|\s*```$/g,'');const data=JSON.parse(raw);draw(data);await save('library.save',{id:record.id,kind:record.kind,title:record.title,body:record.body,status:record.status,...(record.source?{source:record.source}:{}),details:JSON.stringify(data)});tell(p,'题目已保存。先试着回答，再看反馈。');})),questions);
 }

 const bookmarkSaves=new Map<string,Promise<unknown>>();
 const bookmarkKey=(anchor:MessageAnchor,text:string)=>JSON.stringify([anchor.threadId,anchor.messageId,text.slice(0,10000)]);
 const isBookmarked=(anchor:MessageAnchor,text?:string)=>state?.bookmarks.some(b=>b.source?.threadId===anchor.threadId&&b.source.messageId===anchor.messageId&&(text===undefined||b.excerpt===text.slice(0,10000)))??false;
 async function captureBookmark(anchor:MessageAnchor,text:string) {
  if(isBookmarked(anchor,text))return;
  const key=bookmarkKey(anchor,text),existing=bookmarkSaves.get(key);if(existing)return existing;
  const operation=(async()=>{let title=text.trim().replace(/\s+/g,' ').slice(0,80);if(text.length>80){try{const result=await request('assist',{kind:'bookmark',text:text.slice(0,10000)});if(result.text?.trim())title=result.text.trim().replace(/\s+/g,' ').slice(0,60);}catch{/* Keep the source even when the summary helper is unavailable. */}}if(disposed||isBookmarked(anchor,text))return;return save('bookmark.save',{title,url:'codex://threads/'+anchor.threadId,excerpt:text.slice(0,10000),source:anchor});})();
  bookmarkSaves.set(key,operation);refreshBookmarkButtons();
  try{return await operation;}finally{bookmarkSaves.delete(key);if(!disposed)refreshBookmarkButtons();}
 }
 const toolbar=element(doc,'div','toolbar');toolbar.id='codex-sidecar-selection';toolbar.hidden=true;toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','消息工具');shadow.append(toolbar);
 let selected:ReturnType<typeof selectedSource>=null;
 const toast=element(doc,'span','toast');
 function toolbarAction(label:string,fn:()=>Promise<unknown>|void){const b=control(label,()=>{try{Promise.resolve(fn()).then(()=>{toast.textContent='已完成';},e=>{toast.textContent=e instanceof Error?e.message:String(e);});}catch(e){toast.textContent=String(e);}});b.onpointerdown=e=>e.preventDefault();toolbar.append(b);}
 toolbarAction('翻译',()=>{if(selected)openTranslation(selected.text);});toolbarAction('收藏',()=>selected?captureBookmark(selected.anchor,selected.text):undefined);
 toolbarAction('便签',()=>selected?save('note.save',{title:selected.text.slice(0,60),body:selected.text,threadUrl:'codex://threads/'+selected.anchor.threadId}):undefined);
 toolbarAction('解释',()=>{if(selected){if(!insertComposer(win,`请解释这段内容，结合原对话上下文：\n\n${selected.text}`))throw Error('当前没有可用输入框');toolbar.hidden=true;}});
 toolbarAction('学习',()=>{if(selected){open('learning');editRecord(make('learning'),'learning',undefined,selected.text,selected.anchor);toolbar.hidden=true;}});toolbar.append(toast);
 const selectionChanged=()=>{win.setTimeout(()=>{if(disposed)return;selected=selectedSource(win);if(!selected){toolbar.hidden=true;return;}const range=win.getSelection()!.getRangeAt(0);if(typeof range.getBoundingClientRect!=='function')return;const rect=range.getBoundingClientRect();toolbar.hidden=false;toolbar.style.left=Math.max(8,Math.min(rect.left,win.innerWidth-380))+'px';toolbar.style.top=Math.max(70,Math.min(rect.top-48,win.innerHeight-60))+'px';toast.textContent='';refreshBookmarkButtons();},0);};
 doc.addEventListener('mouseup',selectionChanged);doc.addEventListener('keyup',selectionChanged);
 const whole=control('收藏消息',()=>{const source=hovered;if(source)void captureBookmark(source.anchor,source.text).catch(()=>{if(hovered===source){whole.textContent='收藏失败，请重试';whole.disabled=false;}});});whole.classList.add('toolbar');whole.hidden=true;shadow.append(whole);let hovered:ReturnType<typeof sourceMessages>[number]|undefined;
 function refreshBookmarkButtons(){
  if(hovered){const saved=isBookmarked(hovered.anchor),busy=bookmarkSaves.has(bookmarkKey(hovered.anchor,hovered.text));whole.textContent=saved?'已收藏':busy?'收藏中…':'收藏消息';whole.disabled=saved||busy;whole.setAttribute('aria-pressed',String(saved));}
  const selectionButton=toolbar.querySelector<HTMLButtonElement>('[data-testid="personal-收藏"]');
  if(selectionButton){const saved=!!selected&&isBookmarked(selected.anchor,selected.text),busy=!!selected&&bookmarkSaves.has(bookmarkKey(selected.anchor,selected.text));selectionButton.textContent=saved?'已收藏':busy?'收藏中…':'收藏';selectionButton.disabled=saved||busy;selectionButton.setAttribute('aria-pressed',String(saved));}
 }
 const hover=(e:MouseEvent)=>{if(!e.target || !(e.target as Element).closest)return;const target=e.target as Element;if(target.closest('#codex-sidecar-personal-tools'))return;const node=target.closest('[data-response-annotation-target],[data-local-conversation-user-anchor]');hovered=node?sourceMessages(doc).find(r=>r.node===node):undefined;if(!hovered){whole.hidden=true;return;}const rect=hovered.node.getBoundingClientRect();whole.hidden=false;refreshBookmarkButtons();whole.style.left=Math.max(10,Math.min(rect.right-86,win.innerWidth-95))+'px';whole.style.top=Math.max(65,rect.top-28)+'px';};doc.addEventListener('mouseover',hover);
 const onScroll=()=>{toolbar.hidden=true;whole.hidden=true;};doc.addEventListener('scroll',onScroll,true);
 const reflow=()=>{for(const p of panels.values())p.layout();};win.addEventListener('resize',reflow);
 const interval=win.setInterval(()=>{const next=conversationScope(doc);if(next!==scope){remember();scope=next;appearance.setFocus(false);for(const [key,p] of panels){if(p.pin.pinned)continue;p.drawer.hidden=!(openByScope.get(scope)??[]).includes(key);p.frame.activate(scope);if(!p.drawer.hidden){activatePanel(p,scope);if(!p.body.childNodes.length)render(key,p);}}for(const key of openByScope.get(scope)??[])if(!panels.has(key)&&!readWindowPin(win,key))open(key);toolbar.hidden=whole.hidden=true;}},350);
 const restore=new Set([...openByScope.get(scope)??[],...Object.keys(titles).filter(k=>visibleTool(k as Kind)&&readWindowPin(win,k)?.open) as Kind[]]);
 for(const kind of restore){const pinned=readWindowPin(win,kind);if(!pinned||pinned.open)open(kind);}
 return {
  open,navigate:navigator.go,captureBookmark,
  receive(message:HostMessage){if(message.type==='result'){const operation=pending.get(message.id);if(operation){pending.delete(message.id);win.clearTimeout(operation.timer);if(message.ok)operation.resolve(message);else operation.reject(Error(message.error??'操作失败'));}}else{const changed=state?.revision!==message.state.revision;state=message.state;studyTimer.receive(state.timer);refreshBookmarkButtons();if(changed)appearance.apply(state.settings.appearance);if(changed)for(const p of panels.values())p.refresh?.();}},
  destroy(){if(disposed)return;disposed=true;win.removeEventListener('resize',reflow);remember();win.clearInterval(interval);for(const operation of pending.values()){win.clearTimeout(operation.timer);operation.reject(Error('Sidecar 已断开'));}pending.clear();doc.removeEventListener('mouseup',selectionChanged);doc.removeEventListener('keyup',selectionChanged);doc.removeEventListener('mouseover',hover);doc.removeEventListener('scroll',onScroll,true);for(const panel of panels.values())panel.frame.destroy();studyTimer.destroy();navigator.destroy();appearance.destroy();host.remove();},
 };
}
