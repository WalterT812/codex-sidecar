export interface Note { id: string; title: string; body: string; threadUrl?: string; createdAt: string; updatedAt: string }
export interface Bookmark { id: string; title: string; url: string; excerpt: string; createdAt: string }
export interface Settings { locale: 'zh-CN' | 'en'; enabled: { quota: boolean; notes: boolean; bookmarks: boolean; artwork?: boolean }; panelPinned: boolean }
export interface StoredState { version: 1; revision: number; settings: Settings; notes: Note[]; bookmarks: Bookmark[] }
export interface QuotaWindow { id: string; label: string; usedPercent: number | null; remainingPercent: number | null; resetsAt: number | null; windowDurationMins: number | null }
export interface QuotaSnapshot { fetchedAt: string; windows: QuotaWindow[]; error?: string }
export type Action = 'ui.ready' | 'note.save' | 'note.delete' | 'bookmark.save' | 'bookmark.delete' | 'settings.patch' | 'quota.refresh' | 'open.link' | 'ui.detach';
export interface BridgeRequest { id: string; action: Action; payload: Record<string, unknown> }
export type HostMessage = { type: 'snapshot'; state: StoredState; quota: QuotaSnapshot } | { type: 'result'; id: string; ok: boolean; error?: string };
