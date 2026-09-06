import {button} from './components.js';

const key=(kind:string)=>'codex-sidecar.window-pin.v1.'+kind;
/** Pin visibility belongs to this desktop window, never the shared data store. */
export function readWindowPin(win:Window,kind:string):{open:boolean}|null {
 try{const value=JSON.parse(win.sessionStorage.getItem(key(kind))??'null');return value&&typeof value.open==='boolean'?{open:value.open}:null;}catch{return null;}
}
export function createWindowPin(win:Window,kind:string,onChange:(pinned:boolean)=>void){
 let saved=readWindowPin(win,kind);
 const control=button(win.document,'跨对话固定','pin-window-'+kind,'pin','icon-button window-pin');
 const persist=()=>{try{if(saved)win.sessionStorage.setItem(key(kind),JSON.stringify(saved));else win.sessionStorage.removeItem(key(kind));}catch{}};
 const update=()=>{control.setAttribute('aria-pressed',String(!!saved));control.title=control.ariaLabel=saved?'已跨对话固定 · 点击取消':'跨对话固定 · 切换对话时保留此窗口';};
 control.onclick=()=>{saved=saved?null:{open:true};persist();update();onChange(!!saved);};update();
 return{button:control,get pinned(){return !!saved;},get open(){return saved?.open===true;},setOpen(open:boolean){if(saved){saved.open=open;persist();}}};
}
