/** Original Pearl Atelier skin. Selectors were verified against the live native
 * Windows renderer; all DOM owned by React is retained, including input nodes. */
const ATTRIBUTE = 'data-codex-sidecar-theme';
const STYLE_ID = 'codex-sidecar-native-theme';
const S = ':root[data-codex-sidecar-theme="pearl"]';

function svgUrl(body: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}")`;
}
// Small vector companions to the generated icon study: crisp at native UI sizes.
const pearl = svgUrl('<defs><linearGradient id="p" x2="1" y2="1"><stop stop-color="#d8e8fc"/><stop offset=".55" stop-color="#c2b0ed"/><stop offset="1" stop-color="#e9cdda"/></linearGradient></defs><rect x="2" y="2" width="28" height="28" rx="10" fill="#f4f0fb"/><path d="M16 4C19 11 21 13 28 16C21 19 19 21 16 28C13 21 11 19 4 16C11 13 13 11 16 4Z" fill="url(#p)" stroke="#9b88c4" stroke-width="1"/><circle cx="16" cy="16" r="3" fill="#fffaf5"/>');
const conversation = svgUrl('<rect x="3" y="4" width="26" height="24" rx="9" fill="#eee9f9"/><path d="M10 21l-3 4v-9a8 8 0 1 1 5 7" fill="#faf8ff" stroke="#9580ba" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 13h8M12 17h5" stroke="#9580ba" stroke-width="1.5" stroke-linecap="round"/>');

export function nativeThemeCss(wallpaper: string): string {
  if (wallpaper && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(wallpaper)) throw new Error('Theme images must be bundled PNG data.');
  const tokens: Record<string, string> = {
    '--codex-base-accent': '#7d67af', '--codex-base-ink': '#34384c', '--codex-base-surface': '#fbfaff',
    '--font-sans': '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif',
    '--font-content': '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei", sans-serif',
    '--font-sans-default': '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif',
    '--font-mono': '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
    '--text-base': '14px', '--text-sm': '13px',
    '--color-text': '#34384c', '--color-text-primary': '#34384c', '--color-text-secondary': '#666a7e',
    '--color-text-tertiary': '#76798c', '--color-text-foreground': '#34384c',
    '--color-icon-primary': '#595d77', '--color-icon-secondary': '#73778b', '--color-icon-tertiary': '#76798c',
    '--color-token-text-primary': '#34384c', '--color-token-text-secondary': '#666a7e', '--color-token-text-tertiary': '#76798c',
    '--color-token-foreground': '#34384c', '--color-token-description-foreground': '#73778b',
    '--color-text-accent': '#71569e', '--color-icon-accent': '#71569e', '--color-text-info': '#71569e',
    '--color-token-primary': '#71569e', '--color-token-text-link-foreground': '#71569e',
    '--color-surface': '#fbfaff', '--color-surface-secondary': '#f1eff8', '--color-surface-tertiary': '#f7f5fc',
    '--color-background-surface': '#fbfaff', '--color-background-surface-under': '#f1eff8',
    '--color-background-panel': '#fcfbff', '--color-background-application-menu': '#f4f2fa',
    '--color-codex-application-menu': '#f4f2fa', '--color-token-main-surface-primary': '#fbfaff',
    '--color-token-side-bar-background': '#f2effa', '--color-token-bg-primary': '#f6f3fc',
    '--color-background-elevated-primary': '#fdfcff', '--color-background-elevated-secondary': '#fdfcff',
    '--color-background-elevated-primary-opaque': '#fdfcff', '--color-background-elevated-secondary-opaque': '#fdfcff',
    '--color-surface-elevated': '#fdfcff', '--color-surface-elevated-secondary': '#fdfcff',
    '--color-token-dropdown-background': '#fdfcff', '--color-token-dropdown-foreground': '#34384c',
    '--color-background-control': '#ffffff', '--color-background-control-opaque': '#ffffff',
    '--color-background-primary-soft': '#f7f5fc', '--color-background-secondary-soft': '#efecf7',
    '--color-background-accent': '#ece4f8', '--color-background-accent-hover': '#e6dcf5', '--color-background-accent-active': '#dfd2f0',
    '--color-background-user-message': '#eee6f7', '--color-text-user-message': '#4d4167',
    '--color-background-primary-ghost-hover': '#eae4f580', '--color-background-button-secondary': '#f0ecf8',
    '--color-background-button-secondary-hover': '#e8e0f3', '--color-background-button-secondary-active': '#ddd1ed',
    '--color-background-button-primary': '#78609e', '--color-background-button-primary-hover': '#685188',
    '--color-background-button-primary-active': '#594279', '--color-text-button-primary': '#ffffff',
    '--color-background-composer-primary': '#78609e', '--color-background-composer-action-bar': '#f6f3fb',
    '--color-background-text-selection': '#cbb7ed70', '--color-border-focus': '#9580b8', '--color-token-focus-border': '#9580b8',
    '--color-border': '#8f80a62b', '--color-border-default': '#8f80a62b', '--color-border-subtle': '#8f80a61c',
    '--color-border-strong': '#8f80a652', '--color-token-border-default': '#8f80a62b', '--color-token-border': '#8f80a62b',
    '--color-token-input-border': '#b4a4cf80', '--color-token-list-hover-background': '#eae4f580',
  };
  return `
${S}{color-scheme:light!important;${Object.entries(tokens).map(([key,value]) => `${key}:${value}!important;`).join('\n')}}
${S} body{background:#f3f1f9!important;color:#34384c;font-family:var(--font-sans)!important;}
${S} :where(button,input,textarea,select){font-family:var(--font-sans);}
${S} :where(button,a,[role="button"],input,textarea,select):focus-visible{outline-color:#8b70b5!important;}
${S} :where(button,[role="button"]){transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease;}
${S} :where(button,[role="button"]):disabled{cursor:default;}
${S} :where([role="menu"],[role="dialog"],[data-slot="popover-content"],[data-radix-popper-content-wrapper]>div){background:#fdfcff!important;color:#34384c;border-color:#dcd4e9!important;box-shadow:0 16px 54px #5848751c,0 1px 4px #5848750c!important;border-radius:16px;}
${S} [role="dialog"]{font-family:var(--font-sans)!important;}
${S} :where([role="menuitem"],[role="option"])[data-highlighted]{background:#ede6f7!important;color:#54406f!important;}
${S} [data-app-shell-left-panel-appearance]{background:linear-gradient(155deg,#f5f2fc 0%,#edf3fc 65%,#f9f0f6 100%)!important;border-right:1px solid #d5cbe54d;}
${S} [data-app-shell-left-panel-appearance] .sidebar-item{border-radius:10px!important;}
${S} [data-app-action-sidebar-thread-row]{position:relative;min-height:36px;padding-inline-start:38px;border:1px solid transparent;border-radius:11px!important;margin-block:3px;background:#ffffff65;box-shadow:0 1px 2px #79648d05;}
${S} [data-app-action-sidebar-thread-row]:hover{background:#fffdfede!important;border-color:#c9bbdf8c;box-shadow:0 3px 12px #8b729c10;}
${S} [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]{background:linear-gradient(110deg,#e5daf5,#eef1fc)!important;border-color:#b9a6d57a;box-shadow:inset 3px 0 #a085c5,0 3px 12px #8b729c10;}
${S} [data-app-action-sidebar-thread-title]{font-weight:500;letter-spacing:.08px;}
${S} [data-app-action-sidebar-thread-row]::before{content:"";position:absolute;inset-inline-start:7px;top:50%;transform:translateY(-50%);width:23px;height:23px;background-image:${conversation};background-size:contain;pointer-events:none;}
${S} [data-app-action-sidebar-section-heading]{color:#75668d;font-size:12px;font-weight:600;letter-spacing:.35px;}
${S} [data-app-shell-left-panel-appearance] button[aria-label^="Switch mode"]{gap:8px!important;border-radius:12px!important;min-height:37px;color:#5d477e!important;}
${S} [data-app-shell-left-panel-appearance] button[aria-label^="Switch mode"]::before{content:"";display:block;flex:none;width:29px;height:29px;background-image:${pearl};background-size:contain;pointer-events:none;}
${S} [data-app-shell-left-panel-appearance] :where(button,a).sidebar-item>svg{color:#8c79aa;filter:drop-shadow(0 1px 0 #fff);}
${S} [data-app-shell-left-panel-appearance] button[aria-label="Open profile menu"]{background:#ffffffa8!important;box-shadow:0 2px 8px #8067920d;border:1px solid #d8cce84d;border-radius:12px!important;padding-inline:10px!important;}
${S} [data-app-shell-left-panel-appearance] :where(button[aria-label="Start new voice chat"],button[aria-label="Open help menu"]){background:#ffffff7a;border-radius:10px;}
${S} [data-app-shell-main-surface="default"]{background-color:#fbfaff!important;background-image:linear-gradient(90deg,#fbfaff26 0%,#fbfaff38 60%,#fbfaff08 100%)${wallpaper ? `,url(${JSON.stringify(wallpaper)})` : ''}!important;background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important;}
${S} :where([data-app-shell-main-content-layout],[data-app-action-timeline-scroll]){background-color:transparent!important;}
${S} [data-app-shell-application-menu-bar]{background:#f4f2fa!important;}
${S} [data-pip-obstacle="app-shell-header"]{background:#fbfaffda!important;border-bottom:1px solid #ddd5e866;backdrop-filter:blur(14px);}
${S} [data-local-conversation-final-assistant]{background:#fffffff2;border:1px solid #e8e0f288;border-radius:18px;padding:18px 22px;box-shadow:0 4px 24px #77668b05;}
${S} [data-user-message-bubble]{background:linear-gradient(115deg,#ede3f8f5,#e8edf9f5)!important;color:#4b4160!important;border:1px solid #cdbde17a;border-radius:19px 19px 6px 19px!important;box-shadow:0 4px 18px #8b729c0a;}
${S} :where([data-markdown-text-tone],[data-codex-composer="true"]){font-family:var(--font-content)!important;font-size:15px;line-height:1.8;}
${S} :where(pre,code,.monaco-editor,.xterm){font-family:var(--font-mono)!important;}
${S} [data-composer-surface-variant]{background:#fffdfefa!important;border:1px solid #c8b9dc99!important;border-radius:20px!important;box-shadow:0 10px 36px #7e688d15,inset 0 1px #fff!important;}
${S} [data-composer-surface-variant]:focus-within{border-color:#a88ac9!important;box-shadow:0 0 0 3px #c9b4e325,0 10px 36px #7e688d15!important;}
${S} [data-composer-surface-variant] :where(button){border-radius:9px;}
${S} [data-composer-dropdown-foreground]{color:#695681;}
${S} [data-app-shell-main-content-top-fade]{opacity:.35;}
${S} ::selection{background:#cbb7ed70;}
${S} *{scrollbar-color:#c3b5d7 transparent;}
@media(max-width:1000px){${S} [data-app-shell-main-surface="default"]{background-image:linear-gradient(#fbfaffdc,#fbfaffdc)${wallpaper ? `,url(${JSON.stringify(wallpaper)})` : ''}!important;} ${S} [data-local-conversation-final-assistant]{padding:13px 15px;}}
@media(prefers-reduced-motion:reduce){${S} :where(button,[role="button"]){transition:none!important;}}
@media(forced-colors:active){${S} :where([data-app-shell-main-surface],[data-app-shell-left-panel-appearance],[data-user-message-bubble],[data-composer-surface-variant]){background-image:none!important;background-color:Canvas!important;color:CanvasText!important;}}
`;
}

export function createNativeTheme(document: Document, wallpaper: string): { setEnabled(enabled: boolean): void; destroy(): void } | null {
  if (!document.querySelector('#root main[data-app-shell-main-surface="default"]') || document.getElementById(STYLE_ID) || document.documentElement.hasAttribute(ATTRIBUTE)) return null;
  const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = nativeThemeCss(wallpaper);
  let disposed = false;
  function remove() { style.remove(); if (document.documentElement.getAttribute(ATTRIBUTE) === 'pearl') document.documentElement.removeAttribute(ATTRIBUTE); }
  return {
    setEnabled(enabled) {
      if (disposed) return;
      if (!enabled) { remove(); return; }
      if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      document.documentElement.setAttribute(ATTRIBUTE, 'pearl');
    },
    destroy() { if (disposed) return; disposed = true; remove(); },
  };
}
