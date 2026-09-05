import childProcess, { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute, win32 } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { normalizeQuota } from './quota.js';
import type { QuotaSnapshot } from '../shared/types.js';

interface ClientOptions { requestTimeoutMs?: number; shutdownTimeoutMs?: number }
interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
type RpcId = string | number;
const MAX_FRAME_BYTES = 1024 * 1024;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function isId(value: unknown): value is RpcId {
  return (typeof value === 'number' && Number.isSafeInteger(value)) || (typeof value === 'string' && value.length <= 128);
}

/** A read-only client. It never exposes generic RPC, login, turn, or command APIs. */
export class AccountClient {
  private readonly cliPath: string;
  private readonly requestTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private inFlight?: Promise<QuotaSnapshot>;
  private closing?: Promise<void>;
  private closed = false;
  private failure?: Error;
  private nextId = 1;
  private pending = new Map<RpcId, Pending>();
  private decoder = new StringDecoder('utf8');
  private buffer = '';
  private exited = false;
  private exitPromise?: Promise<void>;

  constructor(cliPath: string, options: ClientOptions = {}) {
    if (!isAbsolute(cliPath) && !win32.isAbsolute(cliPath)) throw new Error('An absolute Codex CLI path is required.');
    this.cliPath = cliPath;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 1_000;
    for (const timeout of [this.requestTimeoutMs, this.shutdownTimeoutMs]) {
      if (!Number.isFinite(timeout) || timeout < 1 || timeout > 120_000) throw new Error('Account client timeout must be between 1 and 120000 milliseconds.');
    }
  }

  getQuota(): Promise<QuotaSnapshot> {
    if (this.closed) return Promise.reject(this.failure ?? new Error('Account client is closed.'));
    if (this.inFlight) return this.inFlight;
    const request = this.readQuota();
    this.inFlight = request;
    void request.then(() => { if (this.inFlight === request) this.inFlight = undefined; },
      () => { if (this.inFlight === request) this.inFlight = undefined; });
    return request;
  }

  private async readQuota(): Promise<QuotaSnapshot> {
    this.ready ??= this.initialize();
    await this.ready;
    return normalizeQuota(await this.request('account/rateLimits/read', {}));
  }

  private async initialize(): Promise<void> {
    try {
      this.child = childProcess.spawn(this.cliPath, ['app-server'], { stdio: 'pipe', windowsHide: true, shell: false });
    } catch { throw new Error('Could not start the Codex account helper.'); }
    const child = this.child;
    this.exitPromise = new Promise((resolve) => {
      child.once('close', () => {
        this.exited = true;
        this.fail(new Error('Codex account helper exited before the connection was closed.'));
        resolve();
      });
    });
    child.on('error', () => this.fail(new Error('Could not start or communicate with the Codex account helper.')));
    child.stdin.on('error', () => this.fail(new Error('Codex account helper input closed.')));
    child.stdout.on('error', () => this.fail(new Error('Codex account helper output closed.')));
    child.stdout.on('data', (chunk: Buffer | string) => this.readChunk(chunk));
    // Drain diagnostic output without retaining or forwarding potentially private details.
    child.stderr.on('data', () => {});
    child.stderr.on('error', () => {});
    await this.request('initialize', { clientInfo: { name: 'codex_sidecar', title: 'Codex Sidecar', version: '0.1.0' },
      capabilities: { experimentalApi: false } });
    this.send({ method: 'initialized' });
  }

  private request(method: 'initialize' | 'account/rateLimits/read', params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(this.failure ?? new Error('Account client is closed.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Codex ${method} request timed out.`)), this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) { this.fail(error instanceof Error ? error : new Error('Account request failed.')); }
    });
  }

  private send(message: Record<string, unknown>): void {
    if (this.closed || !this.child || this.child.stdin.destroyed) throw new Error('Account client is closed.');
    if (this.child.stdin.writableLength > 64 * 1024) throw new Error('Account RPC input exceeded its buffer limit.');
    // The only messages emitted are two allowlisted requests, initialization, and request rejections.
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  }

  private readChunk(chunk: Buffer | string): void {
    if (this.closed) return;
    if (Buffer.byteLength(chunk) > MAX_FRAME_BYTES) { this.fail(new Error('Account RPC output exceeded its buffer limit.')); return; }
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_FRAME_BYTES) { this.fail(new Error('Account RPC frame exceeded its buffer limit.')); return; }
      if (!line.trim()) continue;
      try {
        const message = object(JSON.parse(line));
        if (!message || (message.jsonrpc !== undefined && message.jsonrpc !== '2.0')) throw new Error('Invalid RPC object.');
        this.receive(message);
      } catch { this.fail(new Error('Account helper returned invalid RPC data.')); return; }
      if (this.closed) return;
    }
    if (Buffer.byteLength(this.buffer) > MAX_FRAME_BYTES) this.fail(new Error('Account RPC output exceeded its buffer limit.'));
  }

  private receive(message: Record<string, unknown>): void {
    if (typeof message.method === 'string') {
      if (isId(message.id)) this.send({ id: message.id, error: { code: -32601, message: 'Method not supported by Codex Sidecar.' } });
      return;
    }
    if (!isId(message.id)) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id); clearTimeout(pending.timer);
    if (message.error !== undefined) {
      const code = object(message.error)?.code;
      pending.reject(new Error(`Codex account RPC failed${typeof code === 'number' ? ` (code ${code})` : ''}.`));
    } else if (Object.hasOwn(message, 'result')) pending.resolve(message.result);
    else pending.reject(new Error('Account helper returned an invalid RPC response.'));
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.failure = error;
    void this.close();
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer); request.reject(this.failure ?? new Error('Account client is closed.'));
    }
    this.pending.clear(); this.buffer = '';
    this.closing = this.shutdown();
    return this.closing;
  }

  private async waitForExit(): Promise<void> {
    if (this.exited || !this.exitPromise) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.exitPromise, new Promise<void>((resolve) => { timeout = setTimeout(resolve, this.shutdownTimeoutMs); })]);
    clearTimeout(timeout);
  }

  private async shutdown(): Promise<void> {
    const child = this.child;
    if (!child) return;
    child.stdin.end();
    await this.waitForExit();
    if (!this.exited) {
      // Only this owned stdio helper is terminated; desktop processes are never touched.
      try { child.kill(); } catch { /* It may have exited between the check and the signal. */ }
      await this.waitForExit();
    }
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
  }
}
