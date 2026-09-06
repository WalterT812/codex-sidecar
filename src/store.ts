import {validateTimer,timerCommand,changeTimer,type TimerCommand} from './shared/timer.js';
import {validateAnchor,type MessageAnchor} from './shared/anchors.js';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Bookmark, Note, Settings, StoredState, TranslationRecord, ToolRecord, Appearance } from './shared/types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STORE_BYTES = 2000000;
const COMPONENTS = ['quota', 'notes', 'bookmarks', 'artwork', 'theme', 'motion', 'translation', 'workspaces'] as const;
const MUTATIONS = ['note.save', 'note.delete', 'bookmark.save', 'bookmark.delete', 'settings.patch', 'translation.clear', 'library.save', 'library.delete', 'timer.command'] as const;
type MutationAction = typeof MUTATIONS[number];
type PreparedMutation = { action: MutationAction; revision: number; id?: string; title?: string; body?: string; threadUrl?: string; url?: string; excerpt?: string; source?:MessageAnchor; timerCommand?:TimerCommand; library?: Omit<ToolRecord,'id'|'createdAt'|'updatedAt'>; settings?: Partial<Omit<Settings, 'enabled'>> & { enabled?: Partial<Settings['enabled']> } };

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

function appearance(value:unknown):Appearance {
  const row=record(value,'appearance',['font','size','lineHeight','opacity','wallpaper'],['font','size','lineHeight','opacity','wallpaper']);
  if(!['harmony','system','yahei'].includes(String(row.font)))throw Error('Invalid font');
  const number=(key:string,min:number,max:number)=>{const n=row[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('Invalid appearance '+key);return n;};
  return {font:row.font as Appearance['font'],size:number('size',13,22),lineHeight:number('lineHeight',1.4,2.2),opacity:number('opacity',70,100),wallpaper:number('wallpaper',0,100)};
}
function libraryRecord(row:Record<string,unknown>):Omit<ToolRecord,'id'|'createdAt'|'updatedAt'> {
  if(!['snippet','decision','resource','learning','idea'].includes(String(row.kind))||!['active','superseded','done','pending'].includes(String(row.status)))throw Error('Invalid library record');
  return {kind:row.kind as ToolRecord['kind'],status:row.status as ToolRecord['status'],title:string(row.title,'title',200),body:string(row.body,'body',60000),...(row.source!==undefined?{source:validateAnchor(row.source)}:{}),...(row.details!==undefined?{details:string(row.details,'details',60000)}:{})};
}
function validateLibrary(value:unknown,savedId:(value:unknown)=>string):ToolRecord[] {
  if(!Array.isArray(value)||value.length>500)throw Error('Invalid library');
  return value.map(v=>{const row=record(v,'library record',['id','kind','status','title','body','source','details','createdAt','updatedAt'],['id','kind','status','title','body','createdAt','updatedAt']);return {...libraryRecord(row),id:savedId(row.id),createdAt:date(row.createdAt,'createdAt'),updatedAt:date(row.updatedAt,'updatedAt')};});
}

function validateState(value: unknown): StoredState {
  const state = record(value, 'state', ['version', 'revision', 'settings', 'notes', 'bookmarks', 'translations', 'library', 'timer'], ['version', 'revision', 'settings', 'notes', 'bookmarks']);
  if (state.version !== 1) throw new Error('Unsupported state version');
  const settings = record(state.settings, 'settings', ['locale', 'enabled', 'panelPinned', 'appearance'], ['locale', 'enabled', 'panelPinned']);
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
    const bookmark = record(value, 'bookmark', ['id', 'title', 'url', 'excerpt', 'source', 'createdAt'], ['id', 'title', 'url', 'excerpt', 'createdAt']);
    return { id: savedId(bookmark.id), title: string(bookmark.title, 'title', 200), url: validateLink(bookmark.url), excerpt: string(bookmark.excerpt, 'excerpt', 10000), ...(bookmark.source!==undefined?{source:validateAnchor(bookmark.source)}:{}), createdAt: date(bookmark.createdAt, 'createdAt') };
  });
  const optional: Partial<Settings['enabled']> = {};
  let translations:TranslationRecord[]|undefined;
  if(Object.hasOwn(state,'translations')){
    if(!Array.isArray(state.translations)||state.translations.length>50)throw Error('Invalid translation history');
    translations=state.translations.map(value=>{
      const row=record(value,'translation',['id','text','translation','source','target','createdAt','model'],['id','text','translation','source','target','createdAt','model']);
      return{id:savedId(row.id),text:string(row.text,'source text',12000),translation:string(row.translation,'translation',60000),source:string(row.source,'source',16),target:string(row.target,'target',16),createdAt:date(row.createdAt,'createdAt'),model:string(row.model,'model',100)};
    });
  }
  for(const key of ['artwork','theme','motion','translation','workspaces'] as const) if(Object.hasOwn(enabled,key))optional[key]=boolean(enabled[key],`enabled.${key}`);
  return { version: 1, revision: revision(state.revision), settings: { locale: locale(settings.locale), panelPinned: boolean(settings.panelPinned, 'panelPinned'), ...(settings.appearance!==undefined?{appearance:appearance(settings.appearance)}:{}), enabled: { quota: boolean(enabled.quota, 'enabled.quota'), notes: boolean(enabled.notes, 'enabled.notes'), bookmarks: boolean(enabled.bookmarks, 'enabled.bookmarks'), ...optional } }, notes, bookmarks, ...(translations?{translations}:{}), ...(state.timer!==undefined?{timer:validateTimer(state.timer)}:{}), ...(state.library!==undefined?{library:validateLibrary(state.library,savedId)}:{}) };
}

function prepareMutation(action: string, input: unknown): PreparedMutation {
  if (!MUTATIONS.includes(action as MutationAction)) throw new Error('Unknown storage action');
  const keys: Record<MutationAction, readonly string[]> = {
    'note.save': ['revision', 'id', 'title', 'body', 'threadUrl'], 'note.delete': ['revision', 'id'],
    'bookmark.save': ['revision', 'id', 'title', 'url', 'excerpt', 'source'], 'bookmark.delete': ['revision', 'id'],
    'settings.patch': ['revision', 'enabled', 'locale', 'panelPinned', 'appearance'],
    'translation.clear':['revision'], 'timer.command':['revision','command'],
    'library.save':['revision','id','kind','title','body','status','source','details'], 'library.delete':['revision','id'],
  };
  const typedAction = action as MutationAction;
  const payload = record(input, 'payload', keys[typedAction], ['revision']);
  const prepared: PreparedMutation = { action: typedAction, revision: revision(payload.revision) };
  if (Object.hasOwn(payload, 'id')) prepared.id = identifier(payload.id);
  if (action.endsWith('.delete') && !prepared.id) throw new Error('id is required');
  if (action === 'timer.command') { prepared.timerCommand=timerCommand(payload.command); } else if (action === 'note.save') {
    prepared.title = string(payload.title, 'title', 200); prepared.body = string(payload.body, 'body', 100000);
    if (Object.hasOwn(payload, 'threadUrl')) prepared.threadUrl = validateLink(payload.threadUrl);
  } else if (action === 'library.save') {
    prepared.library=libraryRecord(payload);
  } else if (action === 'bookmark.save') {
    prepared.title = string(payload.title, 'title', 200); prepared.url = validateLink(payload.url); prepared.excerpt = string(payload.excerpt, 'excerpt', 10000);if(payload.source!==undefined)prepared.source=validateAnchor(payload.source);
  } else if (action === 'settings.patch') {
    prepared.settings = {};
    if(payload.appearance!==undefined)prepared.settings.appearance=appearance(payload.appearance);
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
  if(change.action==='timer.command'){state.timer=changeTimer(state.timer,change.timerCommand!,Date.now(),randomUUID());return;}
  if(change.action==='translation.clear'){state.translations=[];return;}
  const now = new Date().toISOString();
  if(change.action.startsWith('library.')) {
    const rows=state.library??=[], index=change.id?rows.findIndex(r=>r.id===change.id):-1;
    if(change.id&&index<0)throw Error('Record not found');
    if(change.action==='library.delete')rows.splice(index,1);else {if(index<0&&rows.length>=500)throw Error('Library limit reached');const item:ToolRecord={...change.library!,id:change.id??randomUUID(),createdAt:rows[index]?.createdAt??now,updatedAt:now};if(index<0)rows.push(item);else rows[index]=item;}state.library=rows;return;
  }
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
    const bookmark: Bookmark = { id, title: change.title!, url: change.url!, excerpt: change.excerpt!, ...(change.source?{source:change.source}:{}), createdAt };
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

  /** Trusted relay import uses its durable message UUID; ordinary UI saves cannot upsert unknown IDs. */
  async importIdea(id:string,input:{title:string;body:string;details:string}):Promise<void> {
    const saved=libraryRecord({kind:'idea',title:input.title,body:input.body,details:input.details,status:'pending'});
    const safeId=identifier(id);
    const operation=this.pending.then(async()=>{
      if(this.state.library?.some(r=>r.id===safeId))return;
      const next=structuredClone(this.state),now=new Date().toISOString();
      next.library=[...next.library??[],{...saved,id:safeId,createdAt:now,updatedAt:now}];next.revision++;
      const checked=validateState(next);await this.write(checked);this.state=checked;
    });
    this.pending=operation.then(()=>undefined,()=>undefined);return operation;
  }

  async appendTranslation(input:Omit<TranslationRecord,'id'|'createdAt'>):Promise<void>{
    const saved:TranslationRecord={id:randomUUID(),createdAt:new Date().toISOString(),text:string(input.text,'text',12000),translation:string(input.translation,'translation',60000),source:string(input.source,'source',16),target:string(input.target,'target',16),model:string(input.model,'model',100)};
    const operation=this.pending.then(async()=>{
      if(this.state.revision===Number.MAX_SAFE_INTEGER)throw Error('State revision limit reached');
      const next=structuredClone(this.state);next.translations=[...(next.translations??[]),saved].slice(-50);next.revision++;
      while(next.translations.length>1&&Buffer.byteLength(JSON.stringify(next,null,2)+'\n','utf8')>MAX_STORE_BYTES)next.translations.shift();
      await this.write(next);this.state=next;
    });
    this.pending=operation.then(()=>undefined,()=>undefined);return operation;
  }

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
