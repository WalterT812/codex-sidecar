import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Bookmark, Note, Settings, StoredState } from './shared/types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STORE_BYTES = 2000000;
const COMPONENTS = ['quota', 'notes', 'bookmarks', 'artwork', 'theme'] as const;
const MUTATIONS = ['note.save', 'note.delete', 'bookmark.save', 'bookmark.delete', 'settings.patch'] as const;
type MutationAction = typeof MUTATIONS[number];
type PreparedMutation = { action: MutationAction; revision: number; id?: string; title?: string; body?: string; threadUrl?: string; url?: string; excerpt?: string; settings?: Partial<Omit<Settings, 'enabled'>> & { enabled?: Partial<Settings['enabled']> } };

function record(value: unknown, label: string, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} has an invalid prototype`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw new Error(`${label} contains an unknown field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(`${label} must contain plain data fields`);
  }
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  if (value.length > max) throw new Error(`${label} must contain at most ${max} characters`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('revision must be a nonnegative safe integer');
  return value;
}

function identifier(value: unknown): string {
  const id = string(value, 'id', 128);
  if (!id || /[\u0000-\u001f\u007f-\u009f]/u.test(id)) throw new Error('id is invalid');
  return id;
}

/** Only external HTTPS pages and existing Codex conversation links can be opened. */
export function validateLink(value: unknown): string {
  const link = string(value, 'URL', 4096);
  if (!link || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(link) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(link)) throw new Error('URL contains invalid whitespace or control characters');
  if (/^codex:\/\/threads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link)) return link;
  const authority = /^https:\/\/([^/?#]+)/i.exec(link)?.[1];
  if (!authority || authority.includes('@')) throw new Error('URL must be HTTPS without credentials or a Codex conversation link');
  let parsed: URL;
  try { parsed = new URL(link); } catch { throw new Error('URL is invalid'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error('URL must be HTTPS without credentials');
  return link;
}

function locale(value: unknown): Settings['locale'] {
  if (value !== 'zh-CN' && value !== 'en') throw new Error('locale must be zh-CN or en');
  return value;
}

function date(value: unknown, label: string): string {
  const input = string(value, label, 32);
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) throw new Error(`${label} must be an ISO timestamp`);
  return input;
}

function validateState(value: unknown): StoredState {
  const state = record(value, 'state', ['version', 'revision', 'settings', 'notes', 'bookmarks'], ['version', 'revision', 'settings', 'notes', 'bookmarks']);
  if (state.version !== 1) throw new Error('Unsupported state version');
  const settings = record(state.settings, 'settings', ['locale', 'enabled', 'panelPinned'], ['locale', 'enabled', 'panelPinned']);
  const enabled = record(settings.enabled, 'enabled', COMPONENTS, ['quota', 'notes', 'bookmarks']);
  const ids = new Set<string>();
  function savedId(value: unknown): string {
    const id = identifier(value);
    if (!UUID.test(id)) throw new Error('Stored id must be a UUID');
    const canonical = id.toLowerCase();
    if (ids.has(canonical)) throw new Error('Duplicate stored id');
    ids.add(canonical); return id;
  }
  if (!Array.isArray(state.notes) || state.notes.length > 500) throw new Error('notes must be an array of at most 500 records');
  if (!Array.isArray(state.bookmarks) || state.bookmarks.length > 500) throw new Error('bookmarks must be an array of at most 500 records');
  const notes: Note[] = state.notes.map(value => {
    const note = record(value, 'note', ['id', 'title', 'body', 'threadUrl', 'createdAt', 'updatedAt'], ['id', 'title', 'body', 'createdAt', 'updatedAt']);
    return {
      id: savedId(note.id), title: string(note.title, 'title', 200), body: string(note.body, 'body', 100000),
      ...(Object.hasOwn(note, 'threadUrl') ? { threadUrl: validateLink(note.threadUrl) } : {}),
      createdAt: date(note.createdAt, 'createdAt'), updatedAt: date(note.updatedAt, 'updatedAt'),
    };
  });
  const bookmarks: Bookmark[] = state.bookmarks.map(value => {
    const bookmark = record(value, 'bookmark', ['id', 'title', 'url', 'excerpt', 'createdAt'], ['id', 'title', 'url', 'excerpt', 'createdAt']);
    return { id: savedId(bookmark.id), title: string(bookmark.title, 'title', 200), url: validateLink(bookmark.url), excerpt: string(bookmark.excerpt, 'excerpt', 10000), createdAt: date(bookmark.createdAt, 'createdAt') };
  });
  return { version: 1, revision: revision(state.revision), settings: { locale: locale(settings.locale), panelPinned: boolean(settings.panelPinned, 'panelPinned'), enabled: { quota: boolean(enabled.quota, 'enabled.quota'), notes: boolean(enabled.notes, 'enabled.notes'), bookmarks: boolean(enabled.bookmarks, 'enabled.bookmarks'), ...(Object.hasOwn(enabled, 'artwork') ? { artwork: boolean(enabled.artwork, 'enabled.artwork') } : {}), ...(Object.hasOwn(enabled, 'theme') ? { theme: boolean(enabled.theme, 'enabled.theme') } : {}) } }, notes, bookmarks };
}

function prepareMutation(action: string, input: unknown): PreparedMutation {
  if (!MUTATIONS.includes(action as MutationAction)) throw new Error('Unknown storage action');
  const keys: Record<MutationAction, readonly string[]> = {
    'note.save': ['revision', 'id', 'title', 'body', 'threadUrl'], 'note.delete': ['revision', 'id'],
    'bookmark.save': ['revision', 'id', 'title', 'url', 'excerpt'], 'bookmark.delete': ['revision', 'id'],
    'settings.patch': ['revision', 'enabled', 'locale', 'panelPinned'],
  };
  const typedAction = action as MutationAction;
  const payload = record(input, 'payload', keys[typedAction], ['revision']);
  const prepared: PreparedMutation = { action: typedAction, revision: revision(payload.revision) };
  if (Object.hasOwn(payload, 'id')) prepared.id = identifier(payload.id);
  if (action.endsWith('.delete') && !prepared.id) throw new Error('id is required');
  if (action === 'note.save') {
    prepared.title = string(payload.title, 'title', 200); prepared.body = string(payload.body, 'body', 100000);
    if (Object.hasOwn(payload, 'threadUrl')) prepared.threadUrl = validateLink(payload.threadUrl);
  } else if (action === 'bookmark.save') {
    prepared.title = string(payload.title, 'title', 200); prepared.url = validateLink(payload.url); prepared.excerpt = string(payload.excerpt, 'excerpt', 10000);
  } else if (action === 'settings.patch') {
    prepared.settings = {};
    if (Object.hasOwn(payload, 'locale')) prepared.settings.locale = locale(payload.locale);
    if (Object.hasOwn(payload, 'panelPinned')) prepared.settings.panelPinned = boolean(payload.panelPinned, 'panelPinned');
    if (Object.hasOwn(payload, 'enabled')) {
      const enabled = record(payload.enabled, 'enabled', COMPONENTS); prepared.settings.enabled = {};
      for (const name of COMPONENTS) if (Object.hasOwn(enabled, name)) prepared.settings.enabled[name] = boolean(enabled[name], `enabled.${name}`);
    }
  }
  return prepared;
}

function applyMutation(state: StoredState, change: PreparedMutation): void {
  const now = new Date().toISOString();
  if (change.action === 'settings.patch') {
    const patch = change.settings!;
    state.settings = { ...state.settings, ...patch, enabled: { ...state.settings.enabled, ...patch.enabled } };
    return;
  }
  const collection = change.action.startsWith('note.') ? state.notes : state.bookmarks;
  const index = change.id ? collection.findIndex(item => item.id === change.id) : -1;
  if (change.id && index < 0) throw new Error('Record not found');
  if (change.action.endsWith('.delete')) { collection.splice(index, 1); return; }
  if (index < 0 && collection.length >= 500) throw new Error('Collection may contain at most 500 records');
  const id = change.id ?? randomUUID();
  const createdAt = collection[index]?.createdAt ?? now;
  if (change.action === 'note.save') {
    const note: Note = { id, title: change.title!, body: change.body!, createdAt, updatedAt: now, ...(change.threadUrl !== undefined ? { threadUrl: change.threadUrl } : {}) };
    if (index < 0) state.notes.push(note); else state.notes[index] = note;
  } else {
    const bookmark: Bookmark = { id, title: change.title!, url: change.url!, excerpt: change.excerpt!, createdAt };
    if (index < 0) state.bookmarks.push(bookmark); else state.bookmarks[index] = bookmark;
  }
}

/** One coordinator owns the store; its windows share this serial mutation queue. */
export class StateStore {
  private pending: Promise<void> = Promise.resolve();
  private constructor(private readonly path: string, private state: StoredState) {}

  static async open(path: string): Promise<StateStore> {
    let raw: string;
    try { raw = await readFile(path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new StateStore(resolve(path), { version: 1, revision: 0, settings: { locale: 'zh-CN', enabled: { quota: true, notes: true, bookmarks: true }, panelPinned: false }, notes: [], bookmarks: [] });
      throw new Error('Cannot read the state store; existing data was preserved', { cause: error });
    }
    try {
      if (Buffer.byteLength(raw, 'utf8') > MAX_STORE_BYTES) throw new Error('State store exceeds the 2,000,000-byte size limit');
      return new StateStore(resolve(path), validateState(JSON.parse(raw)));
    }
    catch (error) { throw new Error(`Invalid or unsupported state store; existing data was preserved. ${error instanceof Error ? error.message : 'Validation failed'}`, { cause: error }); }
  }

  get snapshot(): StoredState { return structuredClone(this.state); }

  async mutate(action: string, payload: Record<string, unknown>): Promise<StoredState> {
    // Copy validated values before queuing so callers cannot alter a pending write.
    const change = prepareMutation(action, payload);
    const operation = this.pending.then(async () => {
      if (change.revision !== this.state.revision) throw new Error('State changed in another window; refresh and try again');
      if (this.state.revision === Number.MAX_SAFE_INTEGER) throw new Error('State revision limit reached');
      const next = structuredClone(this.state);
      applyMutation(next, change); next.revision += 1;
      await this.write(next);
      this.state = next;
      return this.snapshot;
    });
    this.pending = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async write(state: StoredState): Promise<void> {
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STORE_BYTES) throw new Error('State store exceeds the 2,000,000-byte size limit; shorten or remove saved content');
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    let created = false;
    try {
      const file = await open(temporary, 'wx', 0o600); created = true;
      try { await file.writeFile(serialized, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, this.path);
    } finally {
      if (created) await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
