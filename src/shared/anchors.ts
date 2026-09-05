export interface MessageAnchor {
  threadId: string;
  messageId: string;
  turnId?: string;
  quote: string;
}
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateAnchor(value: unknown): MessageAnchor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid message source');
  const a = value as Record<string, unknown>;
  if (Object.keys(a).some(k => !['threadId','messageId','turnId','quote'].includes(k)) || typeof a.threadId !== 'string' || !UUID.test(a.threadId)
    || typeof a.messageId !== 'string' || !/^[a-zA-Z0-9_:-]{1,200}$/.test(a.messageId)
    || (a.turnId !== undefined && (typeof a.turnId !== 'string' || !UUID.test(a.turnId)))
    || typeof a.quote !== 'string' || a.quote.length > 10000) throw Error('Invalid message source');
  return {threadId:a.threadId, messageId:a.messageId, quote:a.quote, ...(a.turnId ? {turnId:a.turnId as string}: {})};
}
