import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkGroup } from '../src/work-group.js';
test('stop drains an in-flight write and rejects new work before releasing ownership', async () => {
  const group = new WorkGroup(); const events: string[] = [];
  let finish!: () => void;
  const paused = new Promise<void>(resolve => { finish = resolve; });
  const write = group.run(async () => { await paused; events.push('saved'); });
  const stop = group.stop().then(() => events.push('released'));
  await assert.rejects(group.run(async () => events.push('new')), /stopping/);
  assert.deepEqual(events, []);
  finish(); await write; await stop;
  assert.deepEqual(events, ['saved', 'released']);
});
test('failed work cannot prevent shutdown or cause unhandled rejection', async () => {
  const group = new WorkGroup();
  const failed = group.run(async () => { throw new Error('write failed'); });
  await assert.rejects(failed, /failed/); await group.stop();
});
