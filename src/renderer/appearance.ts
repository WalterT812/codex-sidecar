import type {Appearance} from '../shared/types.js';
export const defaultAppearance:Appearance={font:'harmony',size:16,lineHeight:1.8,opacity:97,wallpaper:65};
const fonts={harmony:'"HarmonyOS Sans SC", "HarmonyOS Sans", "Segoe UI", "Microsoft YaHei UI", sans-serif',system:'"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif',yahei:'"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif'};
export function createAppearance(win:Window) {
 const doc=win.document,style=doc.createElement('style');style.id='codex-sidecar-personal-appearance';doc.head.append(style);
 let focus=false;
 function apply(value?:Appearance) {
  const a={...defaultAppearance,...value},font=fonts[a.font]??fonts.harmony;
  const root='html:root[data-codex-sidecar-theme="pearl"]';
  style.textContent=`${root}{--font-sans:${font}!important;--font-content:${font}!important;--font-sans-default:${font}!important;--sidecar-font:${font};--sidecar-code-size:${Math.max(15,a.size)}px;--sidecar-panel-opacity:${a.opacity/100};--sidecar-wallpaper-cover:${1-a.wallpaper/100};}
${root} [data-markdown-text-tone="user-message"],${root} [data-markdown-text-style="assistant-message"],${root} [data-codex-composer="true"]{font-family:${font}!important;font-size:${a.size}px!important;line-height:${a.lineHeight}!important;}
${root} :is([data-markdown-text-tone="user-message"],[data-markdown-text-style="assistant-message"],[data-codex-composer="true"]) :is(p,li){font-size:inherit!important;line-height:inherit!important;}
[data-sidecar-source-highlight="true"]{outline:2px solid #b69b67!important;outline-offset:6px!important;border-radius:14px!important;}
:root[data-sidecar-focus="true"] [data-app-shell-left-panel-appearance],:root[data-sidecar-focus="true"] [data-pip-obstacle="thread-summary-panel"],:root[data-sidecar-focus="true"] [id^="codex-sidecar-root"],:root[data-sidecar-focus="true"] #codex-sidecar-personal-tools{display:none!important;}
:root[data-sidecar-focus="true"] [data-app-shell-main-surface="default"]{background-image:none!important;}
`;
 }
 const exit=doc.createElement('button');exit.type='button';exit.id='codex-sidecar-exit-focus';exit.textContent='退出专注';exit.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483600;border:1px solid #cdbed3;border-radius:16px;background:#fffdf9;color:#493057;padding:10px 15px;font:13px "HarmonyOS Sans SC",sans-serif;';exit.hidden=true;doc.body.append(exit);
 const setFocus=(enabled:boolean)=>{focus=enabled;doc.documentElement.toggleAttribute('data-sidecar-focus',enabled);if(enabled)doc.documentElement.setAttribute('data-sidecar-focus','true');exit.hidden=!enabled;const event=doc.createEvent('Event');event.initEvent('resize',false,false);win.dispatchEvent(event);};
 exit.onclick=()=>setFocus(false);
 // Escape belongs to the native app's stop-generation command. A separate
 // button avoids binding two unrelated actions to the same key.
 apply();return {apply,setFocus,get focused(){return focus;},destroy(){setFocus(false);style.remove();exit.remove();}};
}
