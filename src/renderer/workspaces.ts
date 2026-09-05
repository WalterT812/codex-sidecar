/** Workspace views wrap native sections. Native records and new-chat actions stay authoritative. */
export function createWorkspaces(win: Window) {
  const doc=win.document; const sidebar=doc.querySelector<HTMLElement>('[data-app-shell-left-panel-appearance]');
  const scroll=sidebar?.querySelector<HTMLElement>('[data-app-action-sidebar-scroll]');
  if(!sidebar||!scroll)return null;
  const container=doc.createElement('div');container.id='codex-sidecar-workspaces';
  const label=doc.createElement('label');label.textContent='工作空间';
  const select=doc.createElement('select');select.setAttribute('aria-label','工作空间');select.dataset.testid='workspace-select';
  label.append(select);
  const hint=doc.createElement('p');hint.textContent='切换空间，回到各自的聊天';
  const newChat=doc.createElement('button');newChat.type='button';newChat.textContent='＋ 在此空间开启新聊天';newChat.dataset.testid='workspace-new-chat';
  const style=doc.createElement('style');style.textContent=`
  #codex-sidecar-workspaces{margin:9px 10px 16px;padding:12px;border:1px solid #b69b6755;border-radius:10px;background:#fffdfbbd;color:#342044;font:12px "HarmonyOS Sans SC","HarmonyOS Sans","Segoe UI","Microsoft YaHei UI",sans-serif;}
  #codex-sidecar-workspaces label{display:flex;flex-direction:column;gap:7px;font-size:10px;letter-spacing:.5px;}
  #codex-sidecar-workspaces select{width:100%;border:1px solid #c7b4a680;border-radius:7px;padding:9px;background:#fffefa;color:#342044;font:inherit;font-size:13px;}
  #codex-sidecar-workspaces p{font-size:10px;color:#756779;margin:8px 0;}
  #codex-sidecar-workspaces button{display:block;width:100%;padding:8px 5px;background:#342044;color:#fff;border-radius:7px;font:inherit;cursor:pointer;}
  #codex-sidecar-workspaces button:disabled{opacity:.45;cursor:default;}
  #codex-sidecar-workspaces :is(button,select):focus-visible{outline:2px solid #a88b53;outline-offset:2px;}
  [data-codex-sidecar-space-hidden="true"]{display:none!important;}`;
  container.append(style,label,hint,newChat);scroll.prepend(container);
  let enabled=true,selected='',disposed=false,scheduled=false;
  try{selected=win.sessionStorage.getItem('codex-sidecar.workspace')??'';}catch{}
  const tagged=new Set<HTMLElement>();
  function sections(){return Array.from(sidebar!.querySelectorAll<HTMLElement>('[data-app-action-sidebar-section]'));}
  function name(section:HTMLElement){return section.getAttribute('data-app-action-sidebar-section-heading')??'';}
  function nativeNew(section:HTMLElement){return Array.from(section.querySelectorAll<HTMLButtonElement>('button')).find(b=>/^New chat(?: in .+)?$/.test(b.getAttribute('aria-label')??''));}
  function refresh(){
    scheduled=false;if(disposed)return;
    if(!container.isConnected&&scroll!.isConnected)scroll!.prepend(container);
    const rows=sections();const names=rows.map(name).filter(Boolean);
    const distinct=[...new Set(names)];
    if(selected&&!distinct.includes(selected))selected='';
    const signature=JSON.stringify(distinct);
    if(select.dataset.options!==signature){select.replaceChildren();for(const value of ['',...distinct]){const option=doc.createElement('option');option.value=value;option.textContent=value||'全部空间';select.append(option);}select.dataset.options=signature;}
    select.value=selected;
    for(const section of rows){
      // Duplicate display names cannot safely identify a single native section.
      const hide=enabled&&!!selected&&names.filter(n=>n===selected).length===1&&name(section)!==selected;
      if(hide){section.setAttribute('data-codex-sidecar-space-hidden','true');tagged.add(section);}else if(tagged.has(section)){section.removeAttribute('data-codex-sidecar-space-hidden');tagged.delete(section);}
    }
    const active=rows.find(s=>name(s)===selected);
    newChat.disabled=!active||!nativeNew(active);
    newChat.hidden=!selected;
    const message=selected?'此处显示这个空间的记录；当前打开的聊天会保留。':'全部记录仍在原来的空间中';
    if(hint.textContent!==message)hint.textContent=message;
  }
  function start(){const section=sections().find(s=>name(s)===selected);if(section)nativeNew(section)?.click();}
  newChat.onclick=start;
  select.onchange=()=>{
    selected=select.value;try{win.sessionStorage.setItem('codex-sidecar.workspace',selected);}catch{}
    refresh();const active=sections().find(s=>name(s)===selected);
    if(active?.getAttribute('data-app-action-sidebar-section-collapsed')==='true')active.querySelector<HTMLButtonElement>('[data-app-action-sidebar-section-toggle]')?.click();
  };
  const intercept=(event:Event)=>{
    if(!enabled||!selected)return;
    const target=(event.target as Element|null)?.closest?.('button');
    if(!target||target.getAttribute('aria-label')!=='New chat')return;
    const active=sections().find(s=>name(s)===selected);const destination=active&&nativeNew(active);
    if(!destination||target===destination)return;
    event.preventDefault();event.stopImmediatePropagation();destination.click();
  };
  sidebar.addEventListener('click',intercept,true);
  const Observer=(win as unknown as {MutationObserver:typeof MutationObserver}).MutationObserver;
  const observer=new Observer(()=>{if(!scheduled){scheduled=true;win.queueMicrotask(refresh);}});
  observer.observe(scroll,{childList:true,subtree:true,attributes:true,attributeFilter:['data-app-action-sidebar-section-heading']});
  refresh();
  return{setEnabled(value:boolean){enabled=value;container.hidden=!value;refresh();},destroy(){disposed=true;observer.disconnect();sidebar.removeEventListener('click',intercept,true);for(const section of tagged)section.removeAttribute('data-codex-sidecar-space-hidden');container.remove();}};
}
