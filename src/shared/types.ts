import type {ShortcutTool} from './tools.js';
import type {StudyTimer} from './timer.js';
import type {MessageAnchor} from './anchors.js';
export interface Appearance {font: 'harmony'|'system'|'yahei'; size:number; lineHeight:number; opacity:number; wallpaper:number}
export interface ToolRecord {id:string;kind:'snippet'|'decision'|'resource'|'learning'|'idea';title:string;body:string;status:'active'|'superseded'|'done'|'pending';source?:MessageAnchor;details?:string;createdAt:string;updatedAt:string}
export interface Note { id: string; title: string; body: string; threadUrl?: string; createdAt: string; updatedAt: string }
export interface Bookmark { id: string; title: string; url: string; excerpt: string; source?: MessageAnchor; createdAt: string }
export interface Settings { locale: 'zh-CN' | 'en'; enabled: { quota: boolean; notes: boolean; bookmarks: boolean; artwork?: boolean; theme?: boolean; motion?: boolean; translation?: boolean; workspaces?: boolean }; panelPinned: boolean; shortcuts?:ShortcutTool[]; appearance?:Appearance }
export interface TranslationRecord { id:string; text:string; translation:string; source:string; target:string; createdAt:string; model:string }
export interface StoredState { version: 1; revision: number; settings: Settings; notes: Note[]; bookmarks: Bookmark[]; translations?:TranslationRecord[]; library?:ToolRecord[]; timer?:StudyTimer }
export interface QuotaWindow { id: string; label: string; usedPercent: number | null; remainingPercent: number | null; resetsAt: number | null; windowDurationMins: number | null }
export interface QuotaSnapshot { fetchedAt: string; windows: QuotaWindow[]; error?: string }
export type Action = 'ui.ready' | 'note.save' | 'note.delete' | 'bookmark.save' | 'bookmark.delete' | 'settings.patch' | 'quota.refresh' | 'open.link' | 'ui.detach' | 'translate' | 'translation.clear' | 'library.save' | 'library.delete' | 'assist' | 'mobile' | 'resource.reveal' | 'timer.command';
export interface BridgeRequest { id: string; action: Action; payload: Record<string, unknown> }
export type HostMessage = { type: 'snapshot'; state: StoredState; quota: QuotaSnapshot } | { type: 'result'; id: string; ok: boolean; error?: string; translation?: string; text?:string; data?:unknown };
