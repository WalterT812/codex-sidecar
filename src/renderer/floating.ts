export interface Frame { x:number; y:number; width:number; height:number }
export interface Bounds { width:number; height:number; top:number }
const KEY='codex-sidecar.frame.v1';
export function readFrame(raw:string|null):Frame|null {
 try{const f=JSON.parse(raw??'null');return f&&['x','y','width','height'].every(k=>typeof f[k]==='number'&&Number.isFinite(f[k])&&Math.abs(f[k])<100000)&&f.width>=1&&f.height>=1?{x:f.x,y:f.y,width:f.width,height:f.height}:null;}catch{return null;}
}
export function clampFrame(f:Frame,b:Bounds):Frame {
 const roomW=Math.max(1,b.width-32),roomH=Math.max(1,b.height-b.top-16);
 const width=Math.min(roomW,Math.max(320,f.width)),height=Math.min(roomH,Math.max(300,f.height));
 return{x:Math.max(16,Math.min(b.width-16-width,f.x)),y:Math.max(b.top,Math.min(b.height-16-height,f.y)),width,height};
}
export function changeFrame(start:Frame,kind:string,dx:number,dy:number,b:Bounds):Frame {
 if(kind==='move')return clampFrame({...start,x:start.x+dx,y:start.y+dy},b);
 let left=start.x,top=start.y,right=left+start.width,bottom=top+start.height;
 const minW=Math.min(320,b.width-32),minH=Math.min(300,b.height-b.top-16);
 if(kind.includes('w'))left=Math.max(16,Math.min(right-minW,left+dx));
 if(kind.includes('e'))right=Math.min(b.width-16,Math.max(left+minW,right+dx));
 if(kind.includes('n'))top=Math.max(b.top,Math.min(bottom-minH,top+dy));
 if(kind.includes('s'))bottom=Math.min(b.height-16,Math.max(top+minH,bottom+dy));
 return clampFrame({x:left,y:top,width:right-left,height:bottom-top},b);
}
/** Geometry is local UI state. Each open window has its own session copy;
 * the last saved frame is only a default for newly opened windows. */
export function createFloatingFrame(win:Window,drawer:HTMLElement,header:HTMLElement,bounds:()=>Bounds,layout:()=>void,key=KEY){
 const baseKey=key;
 let preferred:Frame|null=null,sessionOnly=false;
 try{const own=win.sessionStorage.getItem(key);preferred=readFrame(own===null?win.localStorage.getItem(key):own);win.sessionStorage.setItem(key,JSON.stringify(preferred));}catch{}
 let drag:{id:number;kind:string;x:number;y:number;start:Frame;before:Frame|null;capture:HTMLElement}|null=null;
 const handles:HTMLElement[]=[];
 const measured=():Frame=>{const r=drawer.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
 function save(){try{win.sessionStorage.setItem(key,JSON.stringify(preferred));}catch{}if(sessionOnly)return;try{if(preferred)win.localStorage.setItem(key,JSON.stringify(preferred));else win.localStorage.removeItem(key);}catch{}}
 function reset(){preferred=null;save();layout();}
 function finish(cancel=false){if(!drag)return;const previous=drag;drag=null;if(cancel)preferred=previous.before;else save();try{previous.capture.releasePointerCapture?.(previous.id);}catch{}drawer.classList.remove('manipulating');layout();}
 function down(event:PointerEvent,kind:string){
  if(event.button!==0||drag)return;
  if(kind==='move'&&(event.target as Element).closest('button,a,input,select,textarea'))return;
  event.preventDefault();event.stopPropagation();
  const capture=event.currentTarget as HTMLElement;
  drag={id:event.pointerId,kind,x:event.clientX,y:event.clientY,start:measured(),before:preferred,capture};
  try{capture.setPointerCapture?.(event.pointerId);}catch{}
  drawer.classList.add('manipulating');
 }
 const move=(event:PointerEvent)=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();preferred=changeFrame(drag.start,drag.kind,event.clientX-drag.x,event.clientY-drag.y,bounds());layout();};
 const up=(event:PointerEvent)=>{if(event.pointerId===drag?.id)finish();};
 const cancel=(event:PointerEvent)=>{if(event.pointerId===drag?.id)finish(true);};
 const blur=()=>finish(true);
 const startMove=(event:PointerEvent)=>down(event,'move');
 const doubleClick=(event:MouseEvent)=>{if(!(event.target as Element).closest('button'))reset();};
 const keys=(event:KeyboardEvent)=>{
  if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(true);return;}
  const target=event.target as HTMLElement,kind=target===header?'move':target.dataset.resize;
  if(!kind||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const step=event.shiftKey?24:8;
  preferred=changeFrame(measured(),kind,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0,bounds());save();layout();
 };
 header.tabIndex=0;header.title='拖动标题栏移动 · 双击恢复默认 / Drag to move · Double-click to reset';
 header.addEventListener('pointerdown',startMove);header.addEventListener('dblclick',doubleClick);drawer.addEventListener('keydown',keys);
 for(const kind of ['n','e','s','w','ne','nw','se','sw']){
  const handle=win.document.createElement('div');handle.className='resize-handle resize-'+kind;handle.dataset.resize=kind;
  handle.title='拖动调整大小 / Drag to resize';
  if(kind==='se'){handle.tabIndex=0;handle.setAttribute('role','button');handle.setAttribute('aria-label','调整宽高：拖动或使用方向键 / Resize with drag or arrow keys');}
  handle.addEventListener('pointerdown',event=>down(event,kind));drawer.append(handle);handles.push(handle);
 }
 win.addEventListener('pointermove',move,true);win.addEventListener('pointerup',up,true);win.addEventListener('pointercancel',cancel,true);win.addEventListener('blur',blur);
 return{
  get interacting(){return !!drag;},
  current():Frame|null{return preferred?clampFrame(preferred,bounds()):null;},
  activate(scope:string,inherit=false,windowOnly=false){
   finish(true);sessionOnly=windowOnly;const prior=preferred;key=baseKey+'.conversation.'+scope;preferred=null;
   try{const own=win.sessionStorage.getItem(key),raw=own===null&&!sessionOnly?win.localStorage.getItem(key):own;preferred=raw===null&&inherit?prior:readFrame(raw);win.sessionStorage.setItem(key,JSON.stringify(preferred));}catch{if(inherit)preferred=prior;}
   layout();
  },
  carry(scope:string,windowOnly=false){finish();preferred=preferred??measured();key=baseKey+'.conversation.'+scope;sessionOnly=windowOnly;save();layout();},
  reset,
  destroy(){finish(true);header.removeEventListener('pointerdown',startMove);header.removeEventListener('dblclick',doubleClick);drawer.removeEventListener('keydown',keys);win.removeEventListener('pointermove',move,true);win.removeEventListener('pointerup',up,true);win.removeEventListener('pointercancel',cancel,true);win.removeEventListener('blur',blur);handles.forEach(h=>h.remove());},
 };
}
