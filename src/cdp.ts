import { EventEmitter } from 'node:events';

export interface PageTarget { id: string; type: string; url: string; title: string; webSocketDebuggerUrl?: string }
export function isDesktopTarget(target: PageTarget): boolean {
  if (target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  try {
    const url = new URL(target.url);
    // Only the root packaged entrypoint can host the main desktop renderer.
    const route = decodeURIComponent(`${url.hostname}${url.search}${url.hash}`);
    const excluded = /(?:^|[\/#?&=._-])(?:avatar|pet|pet-overlay|notification|auth|login|signin|sign-in|preview)(?:$|[\/#?&=._-])/i;
    return url.protocol === 'app:' && !url.username && !url.password && !url.port && ['/', '/index.html'].includes(url.pathname) && !excluded.test(route);
  } catch { return false; }
}

export async function listTargets(port: number): Promise<PageTarget[]> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid debugging port.');
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(4000), redirect: 'error' });
  if (!response.ok) throw new Error('The desktop debugging endpoint is unavailable.');
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error('Unexpectedly large debugging response.');
  const targets: unknown = JSON.parse(raw);
  if (!Array.isArray(targets)) throw new Error('Invalid debugging target list.');
  return targets.filter((x): x is PageTarget => x && typeof x.id === 'string' && typeof x.url === 'string' && typeof x.type === 'string');
}

export function validateSocketUrl(value: string, port: number): string {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || Number(url.port) !== port || url.username || url.password || !url.pathname.startsWith('/devtools/page/')) {
    throw new Error('Refusing a non-local or unexpected debugging socket.');
  }
  // Keep the network destination consistent with the verified IPv4 loopback listener.
  url.hostname = '127.0.0.1';
  return url.href;
}

export class CdpConnection extends EventEmitter {
  #socket: WebSocket;
  #closing = false;
  #nextId = 1;
  #pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private constructor(socket: WebSocket) {
    super(); this.#socket = socket;
    socket.addEventListener('message', event => {
      if (this.#closing) return;
      if (typeof event.data !== 'string' || event.data.length > 4_000_000) { this.close(); return; }
      let message: any;
      try { message = JSON.parse(event.data); } catch { this.close(); return; }
      if (!isRecord(message)) { this.close(); return; }
      if (Object.hasOwn(message, 'id')) {
        if (!Number.isSafeInteger(message.id) || message.id < 1) { this.close(); return; }
        const request = this.#pending.get(message.id); if (!request) return;
        this.#pending.delete(message.id); clearTimeout(request.timer);
        if (Object.hasOwn(message, 'error')) {
          if (!isRecord(message.error) || typeof message.error.message !== 'string') {
            request.reject(new Error('Desktop returned an invalid protocol error.')); this.close(); return;
          }
          request.reject(new Error(`Desktop protocol error: ${message.error.message.slice(0, 180)}`));
        }
        else request.resolve(message.result);
      } else if (typeof message.method === 'string') {
        // CDP uses Domain.event names. Remote data must not emit EventEmitter's
        // error/newListener or our internal disconnected lifecycle event.
        if (!/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(message.method)) return;
        if (Object.hasOwn(message, 'params') && !isRecord(message.params)) { this.close(); return; }
        this.emit(message.method, message.params ?? {});
      } else this.close();
    });
    socket.addEventListener('close', () => { this.#rejectAll(); this.emit('disconnected'); });
    socket.addEventListener('error', () => { this.#rejectAll(); });
  }
  static async connect(url: string): Promise<CdpConnection> {
    const socket = new WebSocket(url);
    const connection = new CdpConnection(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Desktop connection timed out.')); }, 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Desktop connection failed.')); }, { once: true });
    });
    return connection;
  }
  get connected() { return this.#socket.readyState === WebSocket.OPEN; }
  request<T = any>(method: string, params: Record<string, unknown> = {}, timeout = 8000): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('Desktop is disconnected.'));
    if (this.#pending.size >= 64) return Promise.reject(new Error('Too many pending desktop requests.'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error(`Desktop request timed out: ${method}`)); }, timeout);
      this.#pending.set(id, { resolve, reject, timer });
      try { this.#socket.send(JSON.stringify({ id, method, params })); }
      catch { clearTimeout(timer); this.#pending.delete(id); reject(new Error('Desktop request could not be sent.')); }
    });
  }
  async evaluate<T = unknown>(expression: string, contextId?: number): Promise<T> {
    const result = await this.request('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(contextId === undefined ? {} : { contextId }) });
    if (result.exceptionDetails) throw new Error('The desktop component could not run in this view.');
    return result.result?.value as T;
  }
  #rejectAll() {
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Desktop disconnected.')); }
    this.#pending.clear();
  }
  close() { if (this.#closing) return; this.#closing = true; this.#rejectAll(); this.#socket.close(); }
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
