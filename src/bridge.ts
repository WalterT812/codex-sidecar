import type { Action, HostMessage } from './shared/types.js';
import { StateStore, validateLink } from './store.js';

export interface BridgeContext {
  store: StateStore;
  refreshQuota: () => Promise<void>;
  openLink: (url: string) => Promise<void>;
  detach: () => Promise<void>;
}

const ACTIONS: readonly Action[] = ['ui.ready', 'note.save', 'note.delete', 'bookmark.save', 'bookmark.delete', 'settings.patch', 'quota.refresh', 'open.link', 'ui.detach'];
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
// A 100,000-character note may expand to six JSON characters per source character.
const MAX_REQUEST_LENGTH = 700000;

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} has an invalid prototype`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error(`${label} contains an invalid field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(`${label} must contain plain data fields`);
  }
  return value as Record<string, unknown>;
}

function exactFields(record: Record<string, unknown>, allowed: readonly string[]): void {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length || keys.some(key => !allowed.includes(key))) throw new Error('Request contains missing or unknown fields');
}

/** The bridge exposes a small action vocabulary, never arbitrary host execution. */
export async function handleRequest(input: string | unknown, context: BridgeContext): Promise<HostMessage> {
  let id = 'invalid-request';
  try {
    if (typeof input === 'string') {
      if (input.length > MAX_REQUEST_LENGTH) throw new Error('Request exceeds the size limit');
      try { input = JSON.parse(input); } catch { throw new Error('Request is not valid JSON'); }
    }
    const request = plainRecord(input, 'Request');
    if (Object.hasOwn(request, 'id') && typeof request.id === 'string' && ID.test(request.id)) id = request.id;
    else throw new Error('Request id must contain 1 to 128 safe characters');
    exactFields(request, ['id', 'action', 'payload']);
    if (typeof request.action !== 'string' || !ACTIONS.includes(request.action as Action)) throw new Error('Unknown bridge action');
    const payload = plainRecord(request.payload, 'Payload');
    switch (request.action as Action) {
      case 'ui.ready': exactFields(payload, []); break;
      case 'quota.refresh': exactFields(payload, []); await context.refreshQuota(); break;
      case 'ui.detach': exactFields(payload, []); await context.detach(); break;
      case 'open.link': exactFields(payload, ['url']); await context.openLink(validateLink(payload.url)); break;
      default: await context.store.mutate(request.action, payload); break;
    }
    return { type: 'result', id, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return { type: 'result', id, ok: false, error: message.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').slice(0, 500) || 'Request failed' };
  }
}
