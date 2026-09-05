import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

interface LockData { pid: number; token: string }
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readLock(path: string): Promise<LockData | undefined> {
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('The companion lock is unreadable. It was preserved; check the data folder.'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('The companion lock is invalid and was preserved.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !Object.hasOwn(record, 'pid') || !Object.hasOwn(record, 'token') || !Number.isSafeInteger(record.pid) || (record.pid as number) < 1 || typeof record.token !== 'string' || !TOKEN.test(record.token)) {
    throw new Error('The companion lock is invalid and was preserved.');
  }
  return { pid: record.pid as number, token: record.token };
}

function ownerIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  // Permission failures or PID reuse never justify deleting another owner's lock.
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

async function withRecoveryGuard<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const guard = `${path}.recovery`;
  for (let attempt = 0; attempt < 80; attempt++) {
    let file;
    try { file = await open(guard, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await delay(25); continue;
    }
    try {
      await file.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() }));
      return await operation();
    } finally {
      try { await file.close(); } finally { await unlink(guard); }
    }
  }
  // Never steal a guard: reclaiming a stale guard without an OS lock recreates
  // the very compare/delete race it prevents. Interrupted guards stay inspectable.
  throw new Error('Companion lock recovery is busy or was interrupted. The recovery file was preserved; check the data folder before retrying.');
}

export async function acquireLock(directory: string) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'companion.lock');
  const token = randomUUID();
  await withRecoveryGuard(path, async () => {
    // This is the authoritative read, after every creator/recoverer has acquired
    // the same guard. No stale pre-guard observation can delete a new lock.
    const existing = await readLock(path);
    if (existing) {
      if (ownerIsAlive(existing.pid)) throw new Error('Codex Sidecar is already running. Use stop before starting another copy.');
      await unlink(path);
    }
    const file = await open(path, 'wx', 0o600);
    try {
      try { await file.writeFile(JSON.stringify({ pid: process.pid, token })); await file.sync(); }
      finally { await file.close(); }
    } catch (error) {
      // Only this writer's incomplete creation is removed, while still guarded.
      await unlink(path);
      throw error;
    }
  });
  return { token, async release() {
    await withRecoveryGuard(path, async () => {
      const data = await readLock(path);
      if (data?.token === token && data.pid === process.pid) await unlink(path);
    });
  } };
}

export async function requestStop(directory: string) {
  const lock = await readLock(join(directory, 'companion.lock'));
  if (!lock || !ownerIsAlive(lock.pid)) throw new Error('No running companion was found.');
  const file = await open(join(directory, 'stop.request'), 'w', 0o600);
  try { await file.writeFile(lock.token); } finally { await file.close(); }
}
