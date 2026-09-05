import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireLock, requestStop } from '../src/lock.js';

async function fixture(t: test.TestContext) {
  const base = resolve('.local/tests'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'lock-'));
  t.after(async () => { assert.ok(directory.startsWith(base)); await rm(directory, { recursive: true, force: true }); });
  return directory;
}

async function exitedPid() {
  const child = spawn(process.execPath, ['-e', ''], { windowsHide: true, stdio: 'ignore' });
  const pid = child.pid;
  await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()); });
  assert.ok(pid); return pid;
}

test('concurrent stale recoverers serialize and only one owns the resulting lock', async t => {
  const directory = await fixture(t);
  const path = join(directory, 'companion.lock');
  const recovery = `${path}.recovery`;
  const stale = JSON.stringify({ pid: await exitedPid(), token: randomUUID() });
  await writeFile(path, stale);
  await writeFile(recovery, JSON.stringify({ pid: process.pid, token: randomUUID() }));
  let settled = 0;
  const attempts = [acquireLock(directory), acquireLock(directory)];
  const results = Promise.allSettled(attempts.map(attempt => attempt.finally(() => { settled++; })));
  await delay(75);
  assert.equal(settled, 0, 'both recoverers must wait for the recovery guard');
  assert.equal(await readFile(path, 'utf8'), stale);
  await unlink(recovery);
  const completed = await results;
  const successes = completed.filter(result => result.status === 'fulfilled');
  assert.equal(successes.length, 1);
  const owner = successes[0]!;
  assert.equal(JSON.parse(await readFile(path, 'utf8')).token, owner.value.token);
  await owner.value.release();
  await assert.rejects(readFile(path), { code: 'ENOENT' });
});

test('a live PID lock is preserved even if its token belongs to another owner', async t => {
  const directory = await fixture(t);
  const path = join(directory, 'companion.lock');
  const original = JSON.stringify({ pid: process.pid, token: randomUUID() });
  await writeFile(path, original);
  await assert.rejects(acquireLock(directory), /already running/i);
  assert.equal(await readFile(path, 'utf8'), original);
});

test('malformed locks are never replaced or converted into stop requests', async t => {
  const directory = await fixture(t); const path = join(directory, 'companion.lock');
  for (const raw of ['{broken', 'null', JSON.stringify({ pid: await exitedPid(), token: '' }), JSON.stringify({ pid: -1, token: randomUUID() })]) {
    await writeFile(path, raw);
    await assert.rejects(acquireLock(directory), /invalid|unreadable|preserv/i);
    assert.equal(await readFile(path, 'utf8'), raw);
    await assert.rejects(requestStop(directory), /invalid|running|unreadable/i);
    await assert.rejects(readFile(join(directory, 'stop.request')), { code: 'ENOENT' });
  }
});

test('release is idempotent and never removes a replacement owner lock', async t => {
  const directory = await fixture(t); const path = join(directory, 'companion.lock');
  const first = await acquireLock(directory);
  await requestStop(directory);
  assert.equal(await readFile(join(directory, 'stop.request'), 'utf8'), first.token);
  await first.release();
  const second = await acquireLock(directory);
  await first.release();
  assert.equal(JSON.parse(await readFile(path, 'utf8')).token, second.token);
  await second.release();
});
