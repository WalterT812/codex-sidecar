/** Original Royal Pearl skin. Selectors were verified against the live native
 * Windows renderer; all DOM owned by React is retained, including input nodes. */
const ATTRIBUTE = 'data-codex-sidecar-theme';
const STYLE_ID = 'codex-sidecar-native-theme';
const S = ':root[data-codex-sidecar-theme="pearl"]';

function svgUrl(body: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}")`;
}
// Small vector companions to the generated icon study: crisp at native UI sizes.
const pearl = svgUrl('<path d="M16 3 28 10v13L16 30 4 23V10Z" fill="none" stroke="#493057" stroke-width="2"/><path d="m16 7 9 5v9l-9 5-9-5v-9Z" fill="none" stroke="#b69b67" stroke-width="1.5"/>');
const conversation = svgUrl('<path d="M7 6h18v15H13l-6 5Z" fill="none" stroke="#735484" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 11h10M11 16h7" stroke="#735484" stroke-width="1.8" stroke-linecap="round"/>');
const selectedConversation = svgUrl('<path d="M7 6h18v15H13l-6 5Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 11h10M11 16h7" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>');

export function nativeThemeCss(wallpaper: string): string {
  if (wallpaper && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(wallpaper)) throw new Error('Theme images must be bundled PNG data.');
  const tokens: Record<string, string> = {
    '--codex-base-accent': '#342044', '--codex-base-ink': '#28252d', '--codex-base-surface': '#f7f6f3',
    '--font-sans': '"HarmonyOS Sans SC", "HarmonyOS Sans", "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif',
    '--font-content': '"HarmonyOS Sans SC", "HarmonyOS Sans", "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei", sans-serif',
    '--font-sans-default': '"HarmonyOS Sans SC", "HarmonyOS Sans", "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif',
    '--font-mono': '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
    '--text-base': '14px', '--text-sm': '13px',
    '--color-text': '#28252d', '--color-text-primary': '#28252d', '--color-text-secondary': '#625c68',
    '--color-text-tertiary': '#77717b', '--color-text-foreground': '#28252d',
    '--color-icon-primary': '#493953', '--color-icon-secondary': '#6e6575', '--color-icon-tertiary': '#77717b',
    '--color-token-text-primary': '#28252d', '--color-token-text-secondary': '#625c68', '--color-token-text-tertiary': '#77717b',
    '--color-token-foreground': '#28252d', '--color-token-description-foreground': '#6e6575',
    '--color-text-accent': '#4c2d63', '--color-icon-accent': '#4c2d63', '--color-text-info': '#4c2d63',
    '--color-token-primary': '#4c2d63', '--color-token-text-link-foreground': '#4c2d63',
    '--color-surface': '#f7f6f3', '--color-surface-secondary': '#eeece9', '--color-surface-tertiary': '#f4f2ee',
    '--color-background-surface': '#f7f6f3', '--color-background-surface-under': '#eeece9',
    '--color-background-panel': '#fffefd', '--color-background-application-menu': '#efedeb',
    '--color-codex-application-menu': '#efedeb', '--color-token-main-surface-primary': '#f7f6f3',
    '--color-token-side-bar-background': '#eeece9', '--color-token-bg-primary': '#f5f3ef',
    '--color-background-elevated-primary': '#fffefd', '--color-background-elevated-secondary': '#fffefd',
    '--color-background-elevated-primary-opaque': '#fffefd', '--color-background-elevated-secondary-opaque': '#fffefd',
    '--color-surface-elevated': '#fffefd', '--color-surface-elevated-secondary': '#fffefd',
    '--color-token-dropdown-background': '#fffefd', '--color-token-dropdown-foreground': '#28252d',
    '--color-background-control': '#ffffff', '--color-background-control-opaque': '#ffffff',
    '--color-background-primary-soft': '#f4f2ee', '--color-background-secondary-soft': '#eeebe6',
    '--color-background-accent': '#ece6ef', '--color-background-accent-hover': '#e3dbe8', '--color-background-accent-active': '#d8ccdf',
    '--color-background-user-message': '#eeece9', '--color-text-user-message': '#342044',
    '--color-background-primary-ghost-hover': '#eae4f580', '--color-background-button-secondary': '#ece8ed',
    '--color-background-button-secondary-hover': '#e4dce8', '--color-background-button-secondary-active': '#d7cbdc',
    '--color-background-button-primary': '#342044', '--color-background-button-primary-hover': '#493057',
    '--color-background-button-primary-active': '#23152e', '--color-text-button-primary': '#ffffff',
    '--color-background-composer-primary': '#342044', '--color-background-composer-action-bar': '#f4f2ef',
    '--color-background-text-selection': '#bda4cd70', '--color-border-focus': '#8a7351', '--color-token-focus-border': '#8a7351',
    '--color-border': '#8477872b', '--color-border-default': '#8477872b', '--color-border-subtle': '#8477871c',
    '--color-border-strong': '#84778752', '--color-token-border-default': '#8477872b', '--color-token-border': '#8477872b',
    '--color-token-input-border': '#b5a78280', '--color-token-list-hover-background': '#eae4f580',
  };
  return `
${S}{color-scheme:light!important;${Object.entries(tokens).map(([key,value]) => `${key}:${value}!important;`).join('\n')}}
${S} body{background:#efedeb!important;color:#28252d;font-family:var(--font-sans)!important;}
${S} :where(button,input,textarea,select){font-family:var(--font-sans);}
${S} :where(button,a,[role="button"],input,textarea,select):focus-visible{outline-color:#735188!important;}
${S} :where(button,[role="button"]){transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease;}
${S} :where(button,[role="button"]):disabled{cursor:default;}
${S} :where([role="menu"],[role="dialog"],[data-slot="popover-content"],[data-radix-popper-content-wrapper]>div){background:#fffefd!important;color:#28252d;border-color:#ded8ce!important;box-shadow:0 16px 54px #5848751c,0 1px 4px #5848750c!important;border-radius:16px;}
${S} [role="dialog"]{font-family:var(--font-sans)!important;}
${S} :where([role="menuitem"],[role="option"])[data-highlighted]{background:#eae4ee!important;color:#342044!important;}
${S} [data-app-shell-left-panel-appearance]{background:linear-gradient(155deg,#f5f2fc 0%,#edf3fc 65%,#f9f0f6 100%)!important;border-right:1px solid #d5cbe54d;}
${S} [data-app-shell-left-panel-appearance] .sidebar-item{border-radius:10px!important;}
${S} [data-app-action-sidebar-thread-row]{position:relative;min-height:36px;padding-inline-start:38px;border:1px solid transparent;border-radius:11px!important;margin-block:3px;background:#ffffff65;box-shadow:0 1px 2px #79648d05;}
${S} [data-app-action-sidebar-thread-row]:hover{background:#fffdfede!important;border-color:#c9bbdf8c;box-shadow:0 3px 12px #8b729c10;}
${S} [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]{background:linear-gradient(110deg,#e5daf5,#eef1fc)!important;border-color:#b9a6d57a;box-shadow:inset 3px 0 #a085c5,0 3px 12px #8b729c10;}
${S} [data-app-action-sidebar-thread-title]{font-weight:500;letter-spacing:.08px;}
${S} [data-app-action-sidebar-thread-row]::before{content:"";position:absolute;inset-inline-start:7px;top:50%;transform:translateY(-50%);width:23px;height:23px;background-image:${conversation};background-size:contain;pointer-events:none;}
${S} [data-app-action-sidebar-section-heading]{color:#675571;font-size:12px;font-weight:600;letter-spacing:.35px;}
${S} [data-app-shell-left-panel-appearance] button[aria-label^="Switch mode"]{gap:8px!important;border-radius:12px!important;min-height:37px;color:#342044!important;}
${S} [data-app-shell-left-panel-appearance] button[aria-label^="Switch mode"]::before{content:"";display:block;flex:none;width:29px;height:29px;background-image:${pearl};background-size:contain;pointer-events:none;}
${S} [data-app-shell-left-panel-appearance] :where(button,a).sidebar-item>svg{color:#6b5376;filter:drop-shadow(0 1px 0 #fff);}
${S} [data-app-shell-left-panel-appearance] button[aria-label="Open profile menu"]{background:#ffffffa8!important;box-shadow:0 2px 8px #8067920d;border:1px solid #d8cce84d;border-radius:12px!important;padding-inline:10px!important;}
${S} [data-app-shell-left-panel-appearance] :where(button[aria-label="Start new voice chat"],button[aria-label="Open help menu"]){background:#ffffff7a;border-radius:10px;}
${S} [data-app-shell-main-surface="default"]{background-color:#f7f6f3!important;background-image:linear-gradient(90deg,#f7f6f326 0%,#f7f6f338 60%,#f7f6f308 100%)${wallpaper ? `,url(${JSON.stringify(wallpaper)})` : ''}!important;background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important;}
${S} :where([data-app-shell-main-content-layout],[data-app-action-timeline-scroll]){background-color:transparent!important;}
${S} [data-app-shell-application-menu-bar]{background:#efedeb!important;}
${S} [data-pip-obstacle="app-shell-header"]{background:#f7f6f3da!important;border-bottom:1px solid #ddd5e866;backdrop-filter:blur(14px);}
${S} [data-local-conversation-final-assistant]{background:#fffffff2;border:1px solid #e8e0f288;border-radius:18px;padding:18px 22px;box-shadow:0 4px 24px #77668b05;}
/* Native wide tables use negative margins to escape the text column. Keep
   their scroll surface inside our reply card without truncating table cells. */
${S} [data-markdown-table][data-wide-block]{width:100%!important;max-width:100%!important;min-width:0!important;margin-inline:0!important;}
${S} [data-markdown-table]>div{width:100%!important;max-width:100%!important;overflow-x:auto!important;}
${S} [data-user-message-bubble]{background:linear-gradient(115deg,#ede3f8f5,#e8edf9f5)!important;color:#4b4160!important;border:1px solid #cdbde17a;border-radius:19px 19px 6px 19px!important;box-shadow:0 4px 18px #8b729c0a;}
${S} :where([data-markdown-text-tone],[data-codex-composer="true"]){font-family:var(--font-content)!important;font-size:15px;line-height:1.8;}
${S} :where(pre,code,.monaco-editor,.xterm){font-family:var(--font-mono)!important;}
${S} [data-composer-surface-variant]{background:#fffdfefa!important;border:1px solid #c8b9dc99!important;border-radius:20px!important;box-shadow:0 10px 36px #7e688d15,inset 0 1px #fff!important;}
${S} [data-composer-surface-variant]:focus-within{border-color:#a88ac9!important;box-shadow:0 0 0 3px #c9b4e325,0 10px 36px #7e688d15!important;}
${S} [data-composer-surface-variant] :where(button){border-radius:9px;}
${S} [data-composer-dropdown-foreground]{color:#695681;}
${S} [data-app-shell-main-content-top-fade]{opacity:.35;}
${S} ::selection{background:#bda4cd70;}
${S} *{scrollbar-color:#b6a8bc transparent;}

/* Royal Pearl: quiet reading surfaces, animated satin only on the edges. */
${S} #root :where(div,span,p,li,a,label,button,input,textarea,select,option,h1,h2,h3,h4,summary,td,th):not(.katex *,.monaco-editor *,.xterm *,pre *,code *){font-family:var(--font-sans)!important;}
/* Assistant replies use text-style; user messages use text-tone. The native
   composer also sets its size inline. Cover all three reading surfaces. */
${S} :is([data-markdown-text-tone="user-message"],[data-markdown-text-style="assistant-message"],[data-codex-composer="true"]){font-family:"HarmonyOS Sans SC","HarmonyOS Sans","Segoe UI","Microsoft YaHei UI",sans-serif!important;font-size:16px!important;line-height:1.8!important;font-weight:400;}
${S} :is([data-markdown-text-tone="user-message"],[data-markdown-text-style="assistant-message"],[data-codex-composer="true"]) :where(p,li){font-size:inherit!important;line-height:1.8!important;}
${S} :where(pre,code,.monaco-editor,.xterm){font-family:var(--font-mono)!important;}
${S} [data-app-shell-left-panel-appearance]{background:linear-gradient(140deg,#f4f1ed 0%,#e8e0e9 28%,#f9f7f2 48%,#e5dfed 72%,#ede6d8 100%)!important;background-size:260% 260%!important;border-right:1px solid #c6b58b55;}
${S}[data-codex-sidecar-motion="on"] [data-app-shell-left-panel-appearance]{animation:sidecar-satin-flow 24s ease-in-out infinite alternate;}
${S} [data-app-action-sidebar-thread-row]{border-radius:8px!important;background:#ffffff50;box-shadow:none;}
${S} [data-app-action-sidebar-thread-row]:hover{background:#ffffffc9!important;border-color:#b69b6755;}
${S} [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]{background:linear-gradient(110deg,#342044,#23172f)!important;color:#fff!important;border-color:#b69b6744;box-shadow:inset 3px 0 #b69b67;}
${S} [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"] *{color:#fff!important;--color-text-primary:#fff!important;--color-icon-primary:#fff!important;--color-token-text-primary:#fff!important;}
${S} [data-app-action-sidebar-thread-selected="true"]::before{background-image:${selectedConversation};filter:none;}
${S} [data-app-shell-main-surface="default"]{background-image:linear-gradient(#f7f6f344,#f7f6f344)${wallpaper ? ',url('+JSON.stringify(wallpaper)+')' : ''}!important;}
${S} [data-local-conversation-final-assistant]{background:#fffefdf5;border-color:#e4ded499;border-radius:10px;box-shadow:0 3px 15px #34204405;}
${S} [data-user-message-bubble]{background:#f0eeebf5!important;color:#28252d!important;border-color:#d8d2c7aa;border-radius:11px 11px 4px 11px!important;}
${S} [data-composer-surface-variant]{background:#fffefdfa!important;border-color:#b5a78288!important;border-radius:12px!important;box-shadow:0 7px 26px #34204416,inset 0 1px #fff!important;}
${S} [data-composer-surface-variant]:focus-within{border-color:#9b7eac!important;box-shadow:0 0 0 2px #34204414,0 7px 26px #34204416!important;}
${S} [data-composer-dropdown-foreground]{color:#493653;}
${S} :where([role="menu"],[role="dialog"],[data-slot="popover-content"]){border-radius:11px;}
@keyframes sidecar-satin-flow{0%{background-position:0% 20%}50%{background-position:80% 65%}100%{background-position:15% 100%}}
@media(prefers-reduced-motion:reduce){${S}:not([data-codex-sidecar-force-motion="true"]) [data-app-shell-left-panel-appearance]{animation:none!important;}}

@media(max-width:1000px){${S} [data-app-shell-main-surface="default"]{background-image:linear-gradient(#f7f6f3dc,#f7f6f3dc)${wallpaper ? `,url(${JSON.stringify(wallpaper)})` : ''}!important;} ${S} [data-local-conversation-final-assistant]{padding:13px 15px;}}
@media(prefers-reduced-motion:reduce){${S} :where(button,[role="button"]){transition:none!important;}}
@media(forced-colors:active){${S} :where([data-app-shell-main-surface],[data-app-shell-left-panel-appearance],[data-user-message-bubble],[data-composer-surface-variant]){background-image:none!important;background-color:Canvas!important;color:CanvasText!important;}}
`;
}

export function createNativeTheme(document: Document, wallpaper: string): { setEnabled(enabled: boolean, motion?: boolean, forceMotion?: boolean): void; destroy(): void } | null {
  if (!document.querySelector('#root main[data-app-shell-main-surface="default"]') || document.getElementById(STYLE_ID) || document.documentElement.hasAttribute(ATTRIBUTE)) return null;
  const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = nativeThemeCss(wallpaper);
  let disposed = false;
  function remove() { style.remove(); document.documentElement.removeAttribute('data-codex-sidecar-motion');document.documentElement.removeAttribute('data-codex-sidecar-force-motion'); if (document.documentElement.getAttribute(ATTRIBUTE) === 'pearl') document.documentElement.removeAttribute(ATTRIBUTE); }
  return {
    setEnabled(enabled, motion = true, forceMotion = false) {
      if (disposed) return;
      if (!enabled) { remove(); return; }
      if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      document.documentElement.setAttribute(ATTRIBUTE, 'pearl');
      document.documentElement.setAttribute('data-codex-sidecar-motion', motion ? 'on' : 'off');
      document.documentElement.setAttribute('data-codex-sidecar-force-motion',String(forceMotion));
    },
    destroy() { if (disposed) return; disposed = true; remove(); },
  };
}
