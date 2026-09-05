import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeQuota } from '../src/account/quota.js';

const now = new Date('2026-09-05T06:00:00.000Z');

test('normalizes legacy windows and preserves reset timestamps as Unix seconds', () => {
  const snapshot = normalizeQuota({ rateLimits: {
    limitId: 'codex', limitName: 'Codex',
    primary: { usedPercent: 31.5, windowDurationMins: 300, resetsAt: 1_789_200_000 },
    secondary: { usedPercent: 85, windowDurationMins: 10_080, resetsAt: 1_789_800_000 },
  } }, now);
  assert.deepEqual(snapshot, { fetchedAt: now.toISOString(), windows: [
    { id: 'codex:primary', label: 'Codex · 5h', usedPercent: 31.5, remainingPercent: 68.5,
      windowDurationMins: 300, resetsAt: 1_789_200_000 },
    { id: 'codex:secondary', label: 'Codex · 7d', usedPercent: 85, remainingPercent: 15,
      windowDurationMins: 10_080, resetsAt: 1_789_800_000 },
  ] });
});

test('prefers every named bucket in the new mapping over legacy data', () => {
  const snapshot = normalizeQuota({
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: {
      codex: { limitName: 'Codex', primary: { usedPercent: 10, windowDurationMins: 300 },
        secondary: { usedPercent: 20, windowDurationMins: 10_080 } },
      review: { primary: { usedPercent: 60, windowDurationMins: 30 } },
    },
  }, now);
  assert.deepEqual(snapshot.windows.map(({ id, label, remainingPercent }) => ({ id, label, remainingPercent })), [
    { id: 'codex:primary', label: 'Codex · 5h', remainingPercent: 90 },
    { id: 'codex:secondary', label: 'Codex · 7d', remainingPercent: 80 },
    { id: 'review:primary', label: 'review · 30m', remainingPercent: 40 },
  ]);
});

test('an explicitly empty or malformed new mapping never revives stale legacy data', () => {
  for (const rateLimitsByLimitId of [{}, [], 'invalid', 2]) {
    assert.deepEqual(normalizeQuota({ rateLimitsByLimitId,
      rateLimits: { primary: { usedPercent: 20 } },
    }, now).windows, []);
  }
});

test('null or absent new mapping allows the legacy response', () => {
  for (const rateLimitsByLimitId of [null, undefined]) {
    const snapshot = normalizeQuota({ rateLimitsByLimitId,
      rateLimits: { primary: { usedPercent: 20 } },
    }, now);
    assert.equal(snapshot.windows[0]?.remainingPercent, 80);
  }
});

test('missing or malformed response buckets and window objects produce no fictional quota', () => {
  for (const raw of [null, undefined, [], 3, 'invalid', {}, { rateLimits: null },
    { rateLimits: { primary: null, secondary: 23 } },
    { rateLimitsByLimitId: { codex: null, review: 'invalid', other: [] } }]) {
    assert.deepEqual(normalizeQuota(raw, now), { fetchedAt: now.toISOString(), windows: [] });
  }
});

test('malformed numeric fields remain unavailable without coercion', () => {
  for (const value of [undefined, null, '', '20', true, NaN, Infinity, -Infinity, {}]) {
    const snapshot = normalizeQuota({ rateLimits: { primary: {
      usedPercent: value, windowDurationMins: value, resetsAt: value,
    } } }, now);
    assert.deepEqual(snapshot.windows[0], {
      id: 'codex:primary', label: 'Codex · Primary', usedPercent: null, remainingPercent: null,
      windowDurationMins: null, resetsAt: null,
    });
  }
});

test('remaining quota is clamped while reported finite usage is preserved', () => {
  for (const [usedPercent, remainingPercent] of [[-12, 100], [0, 100], [100, 0], [170, 0]]) {
    const window = normalizeQuota({ rateLimits: { primary: { usedPercent } } }, now).windows[0];
    assert.equal(window?.usedPercent, usedPercent);
    assert.equal(window?.remainingPercent, remainingPercent);
  }
});

test('rejects negative duration and reset timestamps outside JavaScript date range', () => {
  const window = normalizeQuota({ rateLimits: { primary: {
    usedPercent: 40, windowDurationMins: -1, resetsAt: 9e12,
  } } }, now).windows[0];
  assert.equal(window?.windowDurationMins, null);
  assert.equal(window?.resetsAt, null);
  assert.equal(window?.remainingPercent, 60);
});

test('preserves zero metadata and labels unusual durations without guessing the period', () => {
  const windows = normalizeQuota({ rateLimitsByLimitId: {
    zero: { primary: { windowDurationMins: 0, resetsAt: 0 } },
    odd: { limitName: ' ', secondary: { windowDurationMins: 90 } },
  } }, now).windows;
  assert.equal(windows[0]?.windowDurationMins, 0);
  assert.equal(windows[0]?.resetsAt, 0);
  assert.equal(windows[0]?.label, 'zero · 0m');
  assert.equal(windows[1]?.label, 'odd · 90m');
});
