import {createPersonalTools} from './personal-tools.js';
import {createMobileAccess} from './mobile.js';
import type {MessageAnchor} from '../shared/anchors.js';
import type { Action, Bookmark, HostMessage, Note, QuotaSnapshot, StoredState } from '../shared/types.js';
import { button, currentThreadUrl, dateLabel, element, icon, periodLabel, validLink } from './components.js';
import { styles } from './styles.js';
import { royalStyles } from './royal-styles.js';
import { createNativeTheme } from './theme.js';
import { createTranslator } from './translator.js';
import { createWorkspaces } from './workspaces.js';
import {drawerPlacement} from './placement.js';
import {createFloatingFrame} from './floating.js';
import {createConversationLayouts,type ToolKind} from './conversation-layouts.js';

declare const __SIDECAR_ART_URL__: string;
declare const __SIDECAR_WALLPAPER_URL__: string;

export interface SidecarApi { receive(message: HostMessage): void; destroy(): void; mobile?:(action:string,value?:unknown)=>Promise<unknown> }
declare global {
  interface Window {
    __CODEX_SIDECAR__?: SidecarApi;
    __CODEX_SIDECAR_BOOT__?: { demo?: boolean; version?: string };
    __CODEX_SIDECAR_DIAGNOSTIC__?: string;
    __codexSidecarSend?: (json: string) => void;
  }
}
type View = 'notes' | 'bookmarks' | 'translation' | 'settings';
type Draft = { kind: 'note' | 'bookmark'; id?: string; title: string; body: string; url: string; revision: number; dirty: boolean; source?:MessageAnchor };
const ROOT_ID = 'codex-sidecar-root';

function nativeAnchor(win: Window): HTMLElement | null {
  if (win.__CODEX_SIDECAR_BOOT__?.demo) return win.document.getElementById('sidecar-demo-titlebar');
  // Observed in Codex 26.901.2854.0, webview/index.html and
  // app-initial-14e7352db43a.js: AppShell renders this main/header pair.
  // Header actions are optional; an otherwise valid header can have no buttons.
  const shell = win.document.getElementById('root');
  if (!shell?.querySelector('main[data-app-shell-main-surface="default"]')) return null;
  return Array.from(shell.querySelectorAll<HTMLElement>('header[data-pip-obstacle="app-shell-header"][data-app-shell-header-layout]')).find(node => {
    const rect = node.getBoundingClientRect();
    const style = win.getComputedStyle(node);
    return rect.width > 300 && rect.height >= 24 && rect.height < 140 && rect.top < 120
      && rect.bottom > 0 && rect.right > 0 && !node.closest('[hidden], [aria-hidden="true"], [inert]')
      && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }) ?? null;
}

interface PanelApi extends SidecarApi { show(view?:View):void;setTranslation(text:string):void;activate(scope:string,open:boolean,inherit?:boolean):void }
interface PanelOptions { tools?:()=>void; source?:(anchor:MessageAnchor)=>Promise<void>; tool?:'bookmarks'|'translation'; openTool?:(kind:'notes'|'bookmarks'|'translation')=>void; front?:()=>number;visibility?:(open:boolean)=>void }
/** One bridge receiver owns all tool windows; each window keeps its own draft. */
export function mountSidecar(win:Window):SidecarApi|null{
 win.__CODEX_SIDECAR__?.destroy();
 const panels=new Map<ToolKind,PanelApi>();let snapshot:Extract<HostMessage,{type:'snapshot'}>|undefined;let layer=2147483000;
 const front=()=>++layer;
 const ensure=(kind:'bookmarks'|'translation')=>{
  let panel=panels.get(kind);
  if(!panel){panel=mountPanel(win,{tool:kind,front,source:anchor=>personal.navigate(anchor),visibility:value=>layouts.setOpen(kind,value)})??undefined;if(!panel)return;panels.set(kind,panel);if(snapshot)panel.receive(snapshot);panel.activate(layouts.scope,layouts.isOpen(kind),layouts.scope===initialScope);}
  return panel;
 };
 const openTool=(kind:ToolKind)=>{layouts.check();if(kind==='notes')primary?.show('notes');else ensure(kind)?.show();};
 const primary=mountPanel(win,{openTool,front,tools:()=>personal.open(),source:anchor=>personal.navigate(anchor),visibility:value=>layouts.setOpen('notes',value)});if(!primary)return null;
 const layouts=createConversationLayouts(win,scope=>{
  primary.activate(scope,layouts.isOpen('notes'));
  for(const kind of ['bookmarks','translation'] as const){const panel=panels.get(kind);if(panel)panel.activate(scope,layouts.isOpen(kind));else if(layouts.isOpen(kind))ensure(kind);}
 });
 const initialScope=layouts.scope;primary.activate(initialScope,layouts.isOpen('notes'),true);
 for(const kind of ['bookmarks','translation'] as const)if(layouts.isOpen(kind))ensure(kind);
 const personal=createPersonalTools(win,text=>{const panel=ensure('translation');panel?.setTranslation(text);panel?.show();});
 const api:SidecarApi={receive(message){if(message.type==='snapshot')snapshot=message;personal.receive(message);primary.receive(message);for(const panel of panels.values())panel.receive(message);},destroy(){personal.destroy();layouts.destroy();primary.destroy();for(const panel of panels.values())panel.destroy();panels.clear();if(win.__CODEX_SIDECAR__===api)delete win.__CODEX_SIDECAR__;}};
 api.mobile=createMobileAccess(win);
 win.__CODEX_SIDECAR__=api;return api;
}
function mountPanel(win:Window,options:PanelOptions):PanelApi|null {
  const rootId=options.tool?ROOT_ID+'-'+options.tool:ROOT_ID;
  const document = win.document;
  const initialAnchor = nativeAnchor(win);
  if (!initialAnchor || !document.body) {
    win.__CODEX_SIDECAR_DIAGNOSTIC__ = 'Sidecar did not mount: a supported app shell and visible native header were not found.';
    return null;
  }
  let anchor: HTMLElement = initialAnchor;
  const leftover = document.getElementById(rootId);
  if (leftover) {
    win.__CODEX_SIDECAR_DIAGNOSTIC__ = 'Sidecar did not mount: its root ID is occupied by an unknown element.';
    return null;
  }
  delete win.__CODEX_SIDECAR_DIAGNOSTIC__;
  let state: StoredState | null = null;
  let quota: QuotaSnapshot | null = null;
  let view: View = 'notes';
  let draft: Draft | null = null;
  let opened = false;
  let destroyed = false;
  let firstSnapshot = true;
  let sequence = 0;
  let refreshUntil = 0;
  let syncMessage = '';
  let hoverTimer: number | undefined;
  const timers = new Set<number>();
  const pending = new Map<string, { action: Action; timeout: number; done?: (message:Extract<HostMessage,{type:'result'}>) => void; fail?: (error:Error)=>void }>();
  const demo = win.__CODEX_SIDECAR_BOOT__?.demo === true;
  const version = win.__CODEX_SIDECAR_BOOT__?.version ?? '0.1';
  const artworkUrl = typeof __SIDECAR_ART_URL__ === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(__SIDECAR_ART_URL__) ? __SIDECAR_ART_URL__ : '';
  const nativeTheme = demo || options.tool ? null : createNativeTheme(document, typeof __SIDECAR_WALLPAPER_URL__ === 'string' ? __SIDECAR_WALLPAPER_URL__ : '');
  const workspaces = demo || options.tool ? null : createWorkspaces(win);
  const translator = createTranslator(win, (text,source,target)=>new Promise((resolve,reject)=>send('translate',{text,source,target},message=>{if(message.error)setError(message.error);if(typeof message.translation==='string')resolve(message.translation);else reject(Error('Translation response missing.'));},reject)),()=>{if(state)send('translation.clear',{revision:state.revision});});
  const zh = () => state?.settings.locale !== 'en';
  const t = (cn: string, en: string) => zh() ? cn : en;
  const later = (fn: () => void, ms: number) => {
    const id = win.setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
    timers.add(id);
    return id;
  };
  const cancel = (id: number | undefined) => { if (id !== undefined) { win.clearTimeout(id); timers.delete(id); } };

  const host = element(document, 'div');
  host.id = rootId;
  host.dataset.testid = 'sidecar-root';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;isolation:isolate;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = element(document, 'style');
  style.textContent = styles + royalStyles;
  const root = element(document, 'div', 'root');
  const chip = button(document, 'Sidecar', 'quota-chip', 'spark', 'quota-chip');
  // Native AppShell headers are draggable Electron regions. This widget must
  // explicitly opt out so clicking it does not drag the application window.
  chip.style.setProperty('-webkit-app-region', 'no-drag');
  const trigger = button(document, 'Open Sidecar', 'drawer-trigger', 'spark', 'edge-trigger icon-button');
  trigger.className = 'edge-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'sidecar-drawer');
  const drawer = element(document, 'section', 'drawer');
  drawer.id = 'sidecar-drawer';
  drawer.dataset.testid = 'drawer';
  drawer.setAttribute('role', 'complementary');
  drawer.setAttribute('aria-label', 'Sidecar');
  drawer.tabIndex = -1;
  drawer.hidden = true;
  const header = element(document, 'div', 'drawer-header');
  const brandMark = element(document, 'div', 'brand-mark');
  brandMark.append(icon(document, 'spark'));
  const brand = element(document, 'div', 'brand');
  const tagline = element(document, 'p');
  brand.append(element(document, 'h1', '', 'Sidecar'), tagline);
  const actions = element(document, 'div', 'header-actions');
  const settingsButton = button(document, 'Settings', 'settings-open', 'settings', 'icon-button');
  const closeButton = button(document, 'Close', 'drawer-close', 'close', 'icon-button');
  actions.append(settingsButton, closeButton);
  header.append(brandMark, brand, actions);
  const quotaSection = element(document, 'section', 'quota-section');
  quotaSection.dataset.testid = 'quota-summary';
  const status = element(document, 'div', 'status');
  status.dataset.testid = 'operation-status';
  status.setAttribute('role', 'alert');
  status.hidden = true;
  const tabs = element(document, 'div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Sidecar tools');
  const content = element(document, 'div', 'content');
  content.id = 'sidecar-content';
  content.dataset.testid = 'content';
  const footer = element(document, 'div', 'footer');
  drawer.append(header, quotaSection, status, tabs, content, footer);
  const rail=element(document,'nav','tool-rail');rail.setAttribute('aria-label','Sidecar tools');rail.append(trigger);
  for(const kind of ['notes','bookmarks','translation'] as const){
    const tool=button(document,kind==='notes'?'便签':kind==='bookmarks'?'收藏':'翻译',`rail-${kind}`,kind==='notes'?'note':kind==='bookmarks'?'bookmark':'translate','icon-button');
    tool.onclick=()=>options.openTool?.(kind);rail.append(tool);
  }
  if(!options.tool){const more=button(document,'工具箱','rail-tools','plus','icon-button');more.onclick=()=>options.tools?.();rail.append(more);}
  if(options.tool){rail.hidden=true;quotaSection.hidden=true;}
  root.append(chip, rail, drawer);
  shadow.append(style, root);
  document.body.append(host);
  const floating=createFloatingFrame(win,drawer,header,()=>({width:win.innerWidth,height:win.innerHeight,top:anchor.getBoundingClientRect().bottom+12}),positionDrawer,'codex-sidecar.frame.v1'+(options.tool?'.'+options.tool:''));
  host.addEventListener('pointerdown',()=>{host.style.zIndex=String(options.front?.()??2147483000);},true);

  function send(action: Action, payload: Record<string, unknown> = {}, done?: (message:Extract<HostMessage,{type:'result'}>) => void, fail?: (error:Error)=>void): void {
    if (destroyed) return;
    if (!win.__codexSidecarSend) { const error=Error(t('连接尚未就绪，请重新连接 Sidecar。', 'Sidecar is not connected. Please reconnect it.'));setError(error.message);fail?.(error);return; }
    const id = `sidecar-${options.tool??'main'}-${Date.now().toString(36)}-${++sequence}`;
    const timeout = later(() => {
      pending.delete(id);
      fail?.(Error('Translation request timed out.'));
      setError(t('操作超时。草稿仍保留，请检查连接后重试。', 'The operation timed out. Your draft is kept; check the connection and retry.'));
      renderBusy();
    }, action==='translate'?100_000:15_000);
    pending.set(id, { action, timeout, done, fail });
    try { win.__codexSidecarSend(JSON.stringify({ id, action, payload })); }
    catch { cancel(timeout); pending.delete(id); const error=Error(t('无法连接本地 Sidecar。', 'Could not reach the local Sidecar.'));setError(error.message);fail?.(error); }
    renderBusy();
  }
  function setError(message: string): void {
    status.replaceChildren();
    status.hidden = !message;
    if (message) {
      const dismiss = button(document, t('关闭提示', 'Dismiss'), 'status-dismiss', 'close', 'icon-button');
      dismiss.onclick = () => setError('');
      status.append(dismiss, document.createTextNode(message));
    }
  }
  function renderBusy(): void {
    const saving = [...pending.values()].some(item => item.action === 'note.save' || item.action === 'bookmark.save' || item.action === 'note.delete' || item.action === 'bookmark.delete');
    content.querySelectorAll<HTMLButtonElement>('[data-testid="editor-save"], [data-testid="editor-delete"]').forEach(node => { node.disabled = saving || !state; });
    content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.form input, .form textarea').forEach(node => { node.disabled = saving; });
  }
  function setOpen(value: boolean, focus = false, remember = true): void {
    cancel(hoverTimer);
    opened = value;
    if(remember)options.visibility?.(value);
    if(value)host.style.zIndex=String(options.front?.()??2147483000);
    positionDrawer();
    drawer.hidden = !value;
    trigger.setAttribute('aria-expanded', String(value));
    if (value && focus) drawer.focus();
  }
  trigger.onpointerenter = () => { cancel(hoverTimer); hoverTimer = later(() => setOpen(true), 150); };
  trigger.onpointerleave = () => cancel(hoverTimer);
  trigger.onclick = () => { setOpen(!opened, !opened); };
  closeButton.onclick = () => { setOpen(false); trigger.focus(); };
  chip.onclick = () => setOpen(true, true);
  settingsButton.onclick = () => { if(options.tool){floating.reset();return;}view = view === 'settings' ? firstView() : 'settings'; renderNavigation(); renderContent(); };
  shadow.addEventListener('keydown', onKeydown);
  function onKeydown(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.key === 'Escape' && opened) { key.preventDefault(); key.stopPropagation(); setOpen(false); trigger.focus(); }
    const target = key.target as HTMLElement | null;
    if (target?.getAttribute?.('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key.key)) {
      const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const current = buttons.indexOf(target as HTMLButtonElement);
      const next = key.key === 'Home' ? 0 : key.key === 'End' ? buttons.length - 1 : (current + (key.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
      key.preventDefault(); buttons[next]?.click(); tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }
  }
  function firstView(): View { if(options.tool)return options.tool;return state?.settings.enabled.notes ? 'notes' : state?.settings.enabled.bookmarks ? 'bookmarks' : state?.settings.enabled.translation !== false ? 'translation' : 'settings'; }

  function positionChip(): void {
    if (destroyed || !anchor) return;
    if (!anchor.isConnected) {
      const replacement = nativeAnchor(win);
      // React may replace the header during navigation. Keep the tool windows
      // and their unsaved drafts alive while waiting for a supported header.
      if (!replacement) { chip.style.visibility = 'hidden'; return; }
      observer?.unobserve(anchor);
      anchor = replacement;
      observer?.observe(anchor);
    }
    const rect = anchor.getBoundingClientRect();
    if (demo) { chip.style.top = '12px'; chip.style.right = '164px'; chip.style.visibility = win.innerWidth < 650 ? 'hidden' : 'visible'; return; }
    // Only use a measurable free gap in the native header; never move native controls.
    const occupied = Array.from(anchor.querySelectorAll<HTMLElement>('button, [role="button"], a, input, h1, h2, [data-testid*="title"], [data-app-shell-header-obstacle]'))
      .map(node => node.getBoundingClientRect());
    // The native page-header container stretches across free space. Measure
    // only its rendered text, without reading, copying, or changing that text.
    for (const pageHeader of anchor.querySelectorAll<HTMLElement>('[data-app-shell-page-header]')) {
      const walker = document.createTreeWalker(pageHeader, 4 /* SHOW_TEXT */);
      let textNode: Node | null;
      let measured = false;
      let count = 0;
      for (; count < 100 && (textNode = walker.nextNode()); count++) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        if (typeof range.getClientRects !== 'function') break;
        occupied.push(...Array.from(range.getClientRects()));
        measured = true;
      }
      if (!measured || (count === 100 && walker.nextNode())) occupied.push(pageHeader.getBoundingClientRect());
    }
    const obstacles = occupied.filter(item => item.width > 0 && item.height > 0 && item.top < rect.bottom && item.bottom > rect.top).sort((a, b) => a.left - b.left);
    const gaps: { start: number; end: number }[] = [];
    let left = Math.max(rect.left + 190, 16);
    for (const item of obstacles) {
      if (item.left - left >= 220) gaps.push({ start: left, end: item.left - 10 });
      left = Math.max(left, item.right + 10);
    }
    if (rect.right - left >= 230) gaps.push({ start: left, end: rect.right - 10 });
    const gap = gaps.at(-1);
    chip.style.visibility = gap ? 'visible' : 'hidden';
    if (gap) { chip.style.right = `${Math.max(10, win.innerWidth - gap.end)}px`; chip.style.top = `${Math.max(5, rect.top + (rect.height - 29) / 2)}px`; }
  }
  function positionDrawer():void{
    if(destroyed)return;
    const obstacles=Array.from(document.querySelectorAll<HTMLElement>('[data-pip-obstacle="thread-summary-panel"]')).filter(node=>win.getComputedStyle(node).display!=='none').map(node=>node.getBoundingClientRect());
    const placement=drawerPlacement(win.innerWidth,win.innerHeight,obstacles,anchor!.getBoundingClientRect().bottom);
    const custom=floating.current();
    if(custom){
      drawer.style.left=custom.x+'px';drawer.style.top=custom.y+'px';drawer.style.right=drawer.style.bottom='auto';
      drawer.style.width=custom.width+'px';drawer.style.height=drawer.style.maxHeight=custom.height+'px';
      drawer.dataset.space=custom.height<440?'compact':'normal';rail.title='';return;
    }
    if(options.tool){const offset=options.tool==='bookmarks'?414:828;placement.right=Math.min(placement.right+offset,Math.max(16,win.innerWidth-placement.width-16));}
    drawer.style.left='auto';
    drawer.style.right=placement.right+'px';drawer.style.top='auto';drawer.style.bottom=placement.bottom+'px';drawer.style.width=placement.width+'px';
    drawer.style.height=drawer.style.maxHeight=placement.height+'px';
    drawer.dataset.space=placement.height<180?'blocked':placement.height<440?'compact':'normal';
    rail.title=placement.height<180?t('请先收起上方摘要，为工具窗留出空间。','Collapse the summary above to make room for Sidecar.'):'';
  }
  function renderQuota(): void {
    const enabled = state?.settings.enabled.quota !== false;
    chip.hidden = quotaSection.hidden = !enabled || !!options.tool;
    const age = quota ? Date.now() - new Date(quota.fetchedAt).getTime() : Infinity;
    const stale = !!quota && (!Number.isFinite(age) || age > 120_000 || !!quota.error);
    // The shared account pool is authoritative for general Codex usage. Model
    // pools such as Spark must not masquerade as Astra/Sol remaining quota.
    const windows = (quota?.windows ?? []).filter(item => /^codex:(primary|secondary)$/.test(item.id))
      .sort((a, b) => Number(b.windowDurationMins === 10080) - Number(a.windowDurationMins === 10080));
    chip.classList.toggle('stale', stale);
    const periods = windows.slice(0, 2).map(item => `${periodLabel(item.windowDurationMins, item.label, false)} ${item.remainingPercent === null ? '—' : `${Math.round(item.remainingPercent)}%`}`).join(' · ');
    const summary = periods ? `Codex · ${periods}` : '';
    chip.replaceChildren(icon(document, 'spark'), element(document, 'span', '', `${demo ? 'DEMO · ' : ''}${stale ? t('已过期 · ', 'Stale · ') : ''}${summary || t('额度未知', 'Quota unknown')}`));
    chip.setAttribute('aria-label', `${t('打开 Sidecar，剩余额度：', 'Open Sidecar, quota remaining: ')}${summary || t('未知', 'unknown')}`);
    quotaSection.replaceChildren();
    const heading = element(document, 'div', 'section-heading');
    heading.append(element(document, 'span', 'grow', t('剩余额度', 'QUOTA REMAINING')));
    if (demo) heading.append(element(document, 'span', 'demo-tag', 'DEMO'));
    const refresh = button(document, t('刷新额度', 'Refresh quota'), 'quota-refresh', 'refresh', 'icon-button');
    refresh.disabled = Date.now() < refreshUntil || [...pending.values()].some(item => item.action === 'quota.refresh');
    refresh.onclick = () => { refreshUntil = Date.now() + 1000; send('quota.refresh'); renderQuota(); later(renderQuota, 1050); };
    heading.append(refresh); quotaSection.append(heading);
    if (windows.length) {
      const grid = element(document, 'div', 'quota-grid');
      for (const item of windows) {
        const stat = element(document, 'div', 'quota-stat');
        const statHead = element(document, 'div', 'quota-stat-head');
        const remaining = item.remainingPercent === null ? null : Math.max(0, Math.min(100, item.remainingPercent));
        const number = element(document, 'span', 'quota-value', remaining === null ? '—' : String(Math.round(remaining)));
        if (remaining !== null) number.append(element(document, 'span', 'quota-unit', '%'));
        const period = periodLabel(item.windowDurationMins, '', false);
        const label = period && !item.label.endsWith(period) ? `${item.label} · ${period}` : item.label;
        statHead.append(element(document, 'span', 'quota-label', label || t('未知周期', 'Unknown period')), number);
        const meter = element(document, 'div', 'meter');
        const fill = element(document, 'div', 'meter-fill');
        fill.style.width = `${remaining ?? 0}%`; meter.append(fill);
        stat.append(statHead, meter, element(document, 'p', 'reset-time', `${t('重置 ', 'Resets ')}${dateLabel(item.resetsAt, zh() ? 'zh-CN' : 'en')}`));
        stat.title = item.label;
        grid.append(stat);
      }
      quotaSection.append(grid);
    } else quotaSection.append(element(document, 'p', 'quota-unavailable', t('额度暂时未知', 'Quota is currently unavailable')));
    const caption = quota?.error ? `${t('刷新失败：', 'Refresh failed: ')}${quota.error}` : stale ? t('数据已过期，请刷新后查看。', 'This data is stale. Refresh to update.') : quota?.fetchedAt ? `${t('更新于 ', 'Updated ')}${dateLabel(quota.fetchedAt, zh() ? 'zh-CN' : 'en')}` : t('连接后读取真实账户额度', 'Account quota will appear once connected');
    quotaSection.append(element(document, 'p', 'quota-foot', caption));
    positionChip();
  }

  function renderNavigation(): void {
    tagline.textContent = t('留一点空间，给你的思路', 'A little space for your thinking');
    trigger.title = trigger.ariaLabel = t('打开 Sidecar', 'Open Sidecar');
    settingsButton.title = settingsButton.ariaLabel = options.tool?t('恢复默认位置与大小','Reset position and size'):t('组件设置', 'Component settings');
    settingsButton.setAttribute('aria-pressed', String(view === 'settings'));
    closeButton.title = closeButton.ariaLabel = t('收起', 'Close');
    tabs.replaceChildren();
    tabs.hidden = true;
    brand.querySelector('h1')!.textContent=options.tool==='translation'?t('翻译','Translate'):options.tool==='bookmarks'?t('收藏','Bookmarks'):view==='settings'?'Sidecar':t('便签','Notes');
    for (const kind of ['notes', 'bookmarks', 'translation'] as const) {
      if (!state || state.settings.enabled[kind] === false) continue;
      const tab = button(document, kind === 'notes' ? t('便签', 'Notes') : kind === 'translation' ? t('翻译', 'Translate') : t('收藏', 'Bookmarks'), `tab-${kind}`, kind === 'notes' ? 'note' : kind === 'translation' ? 'translate' : 'bookmark', 'tab');
      tab.id = `sidecar-tab-${kind}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(view === kind));
      tab.setAttribute('aria-controls', content.id);
      tab.tabIndex = view === kind ? 0 : -1;
      if(kind !== 'translation')tab.append(element(document, 'span', 'count', String(state[kind].length)));
      tab.onclick = () => { view = kind; renderNavigation(); renderContent(); };
      tabs.append(tab);
    }
    content.setAttribute('role', 'region');
    if (view === 'settings') { content.removeAttribute('aria-labelledby'); content.setAttribute('aria-label', t('组件设置', 'Component settings')); }
    else { content.removeAttribute('aria-labelledby'); content.setAttribute('aria-label',brand.querySelector('h1')!.textContent!); }
    footer.replaceChildren(element(document, 'span', 'footer-dot'), element(document, 'span', 'grow', demo ? t('演示数据 · 独立本地保存', 'Demo data · stored separately') : t('保存在本机 · 跨窗口同步', 'Saved locally · synced across windows')), element(document, 'span', '', `v${version}`));
  }

  function startDraft(kind: Draft['kind'], item?: Note | Bookmark): void {
    if (!state) return;
    draft = { kind, id: item?.id, title: item?.title ?? '', body: item ? ('body' in item ? item.body : item.excerpt) : '', url: item ? ('url' in item ? item.url : item.threadUrl ?? '') : kind === 'bookmark' ? currentThreadUrl(win.location) ?? '' : '', revision: state.revision, dirty: false, ...(item && 'source' in item && item.source?{source:item.source}:{}) };
    setError(''); renderContent();
    content.querySelector<HTMLInputElement>('[data-testid="editor-title"]')?.focus();
  }
  function renderArtwork(): void {
    if (!artworkUrl || state?.settings.enabled.artwork === false) return;
    const cover = element(document, 'figure', 'artwork-cover');
    cover.dataset.testid = 'artwork-cover';
    const picture = element(document, 'img', 'artwork-image');
    picture.src = artworkUrl;
    picture.alt = '';
    picture.draggable = false;
    picture.decoding = 'async';
    picture.onerror = () => { cover.hidden = true; };
    const copy = element(document, 'figcaption', 'artwork-copy');
    copy.append(element(document, 'span', 'artwork-eyebrow', t('灵感角落', 'A QUIET MOMENT')),
      element(document, 'p', 'artwork-title', t('把灵感\n留在身边。', 'A little space\nfor inspiration.')),
      element(document, 'span', 'artwork-caption', t('想法，随手珍藏', 'Thoughts worth keeping')));
    cover.append(picture, copy);
    content.append(cover);
  }
  function renderContent(): void {
    content.replaceChildren();
    if (!state) { content.append(element(document, 'p', 'no-components', t('正在连接本地 Sidecar…', 'Connecting to the local Sidecar…'))); return; }
    if (view === 'settings') { renderSettings(); return; }
    if (view === 'translation') { translator.language(zh()); content.append(translator.element); return; }
    if (draft && ((view === 'notes' && draft.kind === 'note') || (view === 'bookmarks' && draft.kind === 'bookmark'))) { renderEditor(draft); return; }
    renderArtwork();
    const kind = view === 'notes' ? 'note' : 'bookmark';
    const top = element(document, 'div', 'content-top');
    top.append(element(document, 'p', 'eyebrow', view === 'notes' ? t('捕捉一闪而过的想法', 'THOUGHTS TO COME BACK TO') : t('把值得回看的对话留在这里', 'CONVERSATIONS WORTH KEEPING')));
    const add = button(document, view === 'notes' ? t('新便签', 'New note') : t('新书签', 'New bookmark'), `new-${kind}`, 'plus');
    add.onclick = () => startDraft(kind); top.append(add); content.append(top);
    const items: (Note | Bookmark)[] = [...state[view]];
    if (!items.length) {
      const empty = element(document, 'div', 'empty');
      const symbol = element(document, 'div', 'empty-symbol'); symbol.append(icon(document, kind));
      empty.append(symbol, element(document, 'h2', '', view === 'notes' ? t('从一个小想法开始', 'Start with a small thought') : t('给好思路留一个入口', 'Keep a way back to good ideas')),
        element(document, 'p', '', view === 'notes' ? t('随手记下提示词、待办或灵感。\n不需要打开任何项目。', 'Save a prompt, a to-do, or a thought.\nNo project needed.') : t('选中聊天里的文字，点击收藏；\n也可以把鼠标移到消息上收藏整条。', 'Select text in a message and bookmark it, or hover to save the whole message.')));
      content.append(empty); return;
    }
    const list = element(document, 'div', 'items');
    for (const item of items.sort((a, b) => ('updatedAt' in b ? b.updatedAt : b.createdAt).localeCompare('updatedAt' in a ? a.updatedAt : a.createdAt))) {
      const card = element(document, 'article', 'card'); card.dataset.testid = `${kind}-card`; card.dataset.id = item.id;
      const open = button(document, item.title || t('未命名', 'Untitled'), `${kind}-edit`, undefined, 'card-open');
      open.replaceChildren(element(document, 'h3', 'card-title', item.title || t('未命名', 'Untitled')), element(document, 'p', 'card-body', 'body' in item ? item.body : item.excerpt));
      open.onclick = () => startDraft(kind, item);
      const meta = element(document, 'div', 'card-meta');
      meta.append(element(document, 'span', 'grow', dateLabel('updatedAt' in item ? item.updatedAt : item.createdAt, zh() ? 'zh-CN' : 'en')));
      const url = 'url' in item ? item.url : item.threadUrl;
      if (url && validLink(url)) {
        const visit = button(document, t('source' in item && item.source?'回到原消息':'打开原链接', 'Open original'), `${kind}-open`, 'arrow');
        visit.onclick = () => {if('source' in item&&item.source&&options.source)void options.source(item.source).catch(error=>setError(error.message));else send('open.link', { url });}; meta.append(visit);
      }
      card.append(open, meta); list.append(card);
    }
    content.append(list);
  }

  function renderEditor(editing: Draft): void {
    const form = element(document, 'form', 'form'); form.dataset.testid = 'editor';
    const formHeader = element(document, 'div', 'form-header');
    const back = button(document, t('返回列表', 'Back to list'), 'editor-back', 'back', 'icon-button');
    back.onclick = () => { draft = null; renderContent(); };
    formHeader.append(back, element(document, 'h2', '', editing.kind === 'note' ? t('编辑便签', 'Your note') : t('编辑书签', 'Your bookmark')));
    const draftState = element(document, 'span', 'draft-state', t('未保存草稿', 'Unsaved draft'));
    formHeader.append(draftState); form.append(formHeader);
    const conflict = element(document, 'div', 'conflict'); conflict.dataset.testid = 'revision-conflict';
    const updateConflict = () => {
      conflict.hidden = state?.revision === editing.revision;
      conflict.replaceChildren(element(document, 'p', '', t('数据已在其他操作中更新。草稿已保留；请核对后采用最新修订再保存。', 'Data changed since you opened this draft. Your text is kept. Review it, then use the latest revision to save.')));
      const adopt = button(document, t('采用最新修订', 'Use latest revision'), 'revision-adopt');
      adopt.onclick = () => { if (state) editing.revision = state.revision; updateConflict(); };
      conflict.append(adopt);
    };
    updateConflict(); form.append(conflict);
    function field(label: string, key: 'title' | 'body' | 'url', multiline: boolean, placeholder: string, max: number): void {
      const wrapper = element(document, 'label', 'field'); wrapper.append(element(document, 'span', '', label));
      const input = multiline ? element(document, 'textarea', editing.kind === 'bookmark' ? 'excerpt' : '') : element(document, 'input');
      input.dataset.testid = `editor-${key}`; input.value = editing[key]; input.placeholder = placeholder; input.maxLength = max;
      input.autocomplete = 'off'; input.spellcheck = key !== 'url';
      input.oninput = () => { editing[key] = input.value; editing.dirty = true; };
      wrapper.append(input); form.append(wrapper);
    }
    field(t('标题', 'Title'), 'title', false, t('给这个想法起个名字', 'Give this thought a name'), 200);
    if (editing.kind === 'note') field(t('内容', 'Note'), 'body', true, t('想法、提示词、下一步…', 'Ideas, prompts, next steps…'), 100_000);
    field(editing.kind === 'note' ? t('关联链接（可选）', 'Related link (optional)') : t('对话或网页链接', 'Conversation or web link'), 'url', false, 'codex://threads/…  ·  https://…', 4096);
    if (editing.kind === 'bookmark') {
      form.append(element(document, 'p', 'field-help', t('粘贴原对话分享链接或 HTTPS 链接。摘录由你填写，不会自动读取对话。', 'Paste an original conversation link or an HTTPS URL. Add your own excerpt below.')));
      field(t('摘录（可选）', 'Excerpt (optional)'), 'body', true, t('为什么想再回来看它？', 'What would you like to come back to?'), 10_000);
    }
    const formActions = element(document, 'div', 'form-actions');
    if (editing.id) {
      const remove = button(document, t('删除', 'Delete'), 'editor-delete', 'trash', 'button danger');
      let confirming = false;
      remove.onclick = () => {
        if (!confirming) { confirming = true; remove.querySelector('span')!.textContent = t('确认删除', 'Confirm delete'); return; }
        send(editing.kind === 'note' ? 'note.delete' : 'bookmark.delete', { id: editing.id, revision: editing.revision }, () => { if (draft === editing) { draft = null; renderContent(); } });
      };
      formActions.append(remove);
    }
    const save = button(document, t('保存', 'Save'), 'editor-save', undefined, 'button primary'); save.type = 'submit';
    formActions.append(element(document, 'span', 'grow'), save); form.append(formActions);
    form.onsubmit = event => {
      event.preventDefault();
      if (!state || save.disabled) return;
      const url = editing.url.trim();
      if ((editing.kind === 'bookmark' || url) && !validLink(url)) { setError(t('请填写有效的 HTTPS 链接或 codex://threads/ 对话链接。', 'Enter a valid HTTPS URL or codex://threads/ conversation link.')); return; }
      if (editing.revision !== state.revision) { updateConflict(); conflict.scrollIntoView?.({ block: 'nearest' }); return; }
      setError('');
      const payload: Record<string, unknown> = { title: editing.title, revision: editing.revision };
      if (editing.id) payload.id = editing.id;
      if (editing.kind === 'note') { payload.body = editing.body; if (url) payload.threadUrl = url; }
      else { payload.url = url; payload.excerpt = editing.body;if(editing.source&&url===`codex://threads/${editing.source.threadId}`)payload.source=editing.source; }
      const savedText = JSON.stringify([editing.title, editing.body, editing.url]);
      send(editing.kind === 'note' ? 'note.save' : 'bookmark.save', payload, () => {
        if (draft === editing && JSON.stringify([editing.title, editing.body, editing.url]) === savedText) { draft = null; renderContent(); }
      });
    };
    content.append(form); renderBusy();
  }

  function renderSettings(): void {
    if (!state) return;
    content.append(element(document, 'h2', 'settings-heading', t('让 Sidecar 刚刚好', 'Make Sidecar your own')), element(document, 'p', 'settings-intro', t('只留下你需要的小组件。每一项都可以独立关闭。', 'Keep the small tools you need. Each component works independently.')));
    const labels = { quota: [t('额度指示器', 'Quota indicator'), t('在标题栏查看真实剩余额度', 'See real remaining quota in the title bar')], notes: [t('便签', 'Notes'), t('随手记录，保存在本机', 'Capture thoughts and save them locally')], bookmarks: [t('书签', 'Bookmarks'), t('收藏链接，回到原对话', 'Keep links to original conversations')], artwork: [t('背景卡片', 'Artwork card'), t('一点温柔的色彩，编辑时自动收起', 'A touch of color, tucked away while you write')] };
    const themeLabels = { ...labels, theme: [t('皇家紫金 · 明亮版', 'Royal Pearl · bright'), t('整窗紫金主题与专属背景；关闭即可恢复', 'Whole-window royal theme and wallpaper; turn off to restore')], motion:[t('流动渐变','Flowing gradients'),t('关闭即保持静态；只影响 Sidecar','Turn off for static gradients; affects only Sidecar')], translation:[t('翻译','Translate'),t('Sol · medium，带本机历史记录','Sol · medium with local history')], workspaces:[t('工作空间切换','Workspace switcher'),t('按原生分区查看记录，在空间中开启新聊天','View native sections and start chats in each space')] };
    for (const key of ['theme', 'motion', 'workspaces', 'translation', 'quota', 'notes', 'bookmarks', 'artwork'] as const) {
      const row = element(document, 'label', 'setting-row');
      const copy = element(document, 'span', 'setting-copy'); copy.append(element(document, 'span', 'setting-title', themeLabels[key][0]), element(document, 'p', 'setting-description', themeLabels[key][1]));
      const toggle = element(document, 'input', 'switch'); toggle.type = 'checkbox'; toggle.checked = state.settings.enabled[key] !== false;
      toggle.dataset.testid = `setting-${key}`; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', themeLabels[key][0] ?? key);
      if (key === 'theme' && !nativeTheme) { toggle.disabled = true; copy.querySelector('p')!.textContent = t('需在受支持的 Codex 原生窗口中使用', 'Requires a supported native Codex window'); }
      toggle.onchange = () => { if (state) { toggle.disabled = true; send('settings.patch', { enabled: { [key]: toggle.checked }, revision: state.revision }, renderContent); } };
      row.append(copy, toggle); content.append(row);
    }
    const bottom = element(document, 'div', 'settings-bottom');
    const resetFrame=button(document,t('恢复工具窗位置与大小','Reset panel position and size'),'frame-reset',undefined,'button');
    resetFrame.onclick=()=>floating.reset();bottom.append(resetFrame);
    const language = element(document, 'label', 'field'); language.append(element(document, 'span', '', t('界面语言', 'Language')));
    const select = element(document, 'select'); select.dataset.testid = 'setting-locale';
    for (const [value, label] of [['zh-CN', '简体中文'], ['en', 'English']]) { const option = element(document, 'option', '', label); option.value = value ?? ''; select.append(option); }
    select.value = state.settings.locale;
    select.onchange = () => { if (state) send('settings.patch', { locale: select.value, revision: state.revision }); };
    language.append(select); bottom.append(language, element(document, 'p', 'about', t('独立开发的本地小组件。笔记与书签由 Sidecar 保存；官方 Codex 负责你的对话。', 'An independent local companion. Sidecar stores notes and bookmarks; the official Codex app handles your conversations.')));
    const detach = button(document, t('从所有窗口移除 Sidecar', 'Remove Sidecar from all windows'), 'sidecar-detach', undefined, 'button text-button');
    detach.onclick = () => send('ui.detach'); bottom.append(detach); content.append(bottom);
  }

  const onResize = () => {positionChip();positionDrawer();};
  win.addEventListener('resize', onResize);
  const ResizeObserverClass = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  const observer = ResizeObserverClass ? new ResizeObserverClass(positionChip) : null;
  observer?.observe(anchor);
  const MutationObserverClass=(win as unknown as {MutationObserver?:typeof MutationObserver}).MutationObserver;
  let placementTimer:number|undefined;
  const placementObserver=MutationObserverClass?new MutationObserverClass(()=>{if(placementTimer===undefined)placementTimer=later(()=>{placementTimer=undefined;positionChip();positionDrawer();},80);}):null;
  const nativeRoot=document.getElementById('root');if(nativeRoot)placementObserver?.observe(nativeRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['style','data-pip-obstacle']});
  positionDrawer();
  const clock = win.setInterval(renderQuota, 30_000);
  const api: PanelApi = {
    setTranslation(text){translator.setText(text);},
    activate(scope,open,inherit){floating.activate(scope,inherit);setOpen(open,false,false);},
    show(next){if(next)view=next;renderNavigation();renderContent();setOpen(true,true);},
    receive(message): void {
      if (destroyed) return;
      if (message.type === 'result') {
        const operation = pending.get(message.id);
        if (!operation) return;
        pending.delete(message.id); cancel(operation.timeout);
        if (!message.ok) { setError(message.error || t('操作失败，请重试。', 'The operation failed. Please retry.'));operation.fail?.(Error(message.error)); if (operation.action === 'settings.patch') renderContent(); }
        else operation.done?.(message);
        renderBusy(); renderQuota();
        return;
      }
      if (message.type !== 'snapshot') return;
      const previousRevision = state?.revision;
      const previousLocale = state?.settings.locale;
      const stateChanged = !state || state.revision !== message.state.revision || state.settings.locale !== message.state.settings.locale;
      state = message.state; quota = message.quota;
      translator.language(zh());translator.setHistory(state.translations??[]);
      nativeTheme?.setEnabled(state.settings.enabled.theme !== false, state.settings.enabled.motion !== false, state.settings.enabled.motion === true);
      workspaces?.setEnabled(state.settings.enabled.workspaces !== false);
      root.classList.toggle('motion',state.settings.enabled.motion !== false);
      root.classList.toggle('force-motion',state.settings.enabled.motion === true);

      if (firstSnapshot) { firstSnapshot = false; view = firstView(); }
      if (view !== 'settings' && state.settings.enabled[view] === false) view = firstView();
      if(options.tool&&state.settings.enabled[options.tool]===false)setOpen(false);
      for(const kind of ['notes','bookmarks','translation'] as const)rail.querySelector<HTMLElement>(`[data-testid="rail-${kind}"]`)!.hidden=state.settings.enabled[kind]===false;
      renderQuota();
      if (!stateChanged) return;
      if (draft && previousRevision !== undefined && previousRevision !== state.revision) syncMessage = t('草稿已保留', 'Draft kept');
      renderNavigation();
      // Frequent quota snapshots must preserve the actual input nodes, selection, and draft text.
      const editingVisible = !!draft && content.querySelector('[data-testid="editor"]') !== null && ((view === 'notes' && draft.kind === 'note') || (view === 'bookmarks' && draft.kind === 'bookmark'));
      if (!editingVisible || previousLocale !== state.settings.locale) renderContent();
      else {
        const conflict = content.querySelector<HTMLElement>('[data-testid="revision-conflict"]');
        if (conflict) conflict.hidden = draft!.revision === state.revision;
        if (syncMessage) content.querySelector<HTMLElement>('.draft-state')!.textContent = syncMessage;
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for(const operation of pending.values())operation.fail?.(Error('Sidecar detached.'));
      for (const id of timers) win.clearTimeout(id);
      timers.clear(); pending.clear(); win.clearInterval(clock);
      observer?.disconnect(); win.removeEventListener('resize', onResize); shadow.removeEventListener('keydown', onKeydown);
      placementObserver?.disconnect();floating.destroy();
      host.remove();
      nativeTheme?.destroy();
      workspaces?.destroy(); translator.destroy();
      if (win.__CODEX_SIDECAR__ === api) delete win.__CODEX_SIDECAR__;
      state = null; quota = null; draft = null;
    },
  };
  renderNavigation(); renderQuota(); renderContent();
  send('ui.ready');
  return api;
}

if (typeof window !== 'undefined') mountSidecar(window);
