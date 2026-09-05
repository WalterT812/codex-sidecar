import type { QuotaSnapshot, QuotaWindow } from '../shared/types.js';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonemptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function periodLabel(minutes: number | null, slot: 'primary' | 'secondary'): string {
  if (minutes === null) return slot === 'primary' ? 'Primary' : 'Secondary';
  if (minutes > 0 && minutes % 1_440 === 0) return `${minutes / 1_440}d`;
  if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function addBucket(windows: QuotaWindow[], id: string, value: unknown): void {
  const bucket = asObject(value);
  if (!bucket) return;
  const name = nonemptyText(bucket.limitName) ?? (id === 'codex' ? 'Codex' : id);
  for (const slot of ['primary', 'secondary'] as const) {
    const raw = asObject(bucket[slot]);
    if (!raw) continue;
    const usedPercent = finiteNumber(raw.usedPercent);
    const duration = finiteNumber(raw.windowDurationMins);
    const windowDurationMins = duration !== null && duration >= 0 ? duration : null;
    const reset = finiteNumber(raw.resetsAt);
    // The API reports seconds. Keep that unit in the shared snapshot; only use
    // milliseconds to validate the JavaScript Date range.
    const resetsAt = reset !== null && Number.isFinite(new Date(reset * 1_000).getTime())
      ? reset : null;
    windows.push({
      id: `${id}:${slot}`,
      label: `${name} · ${periodLabel(windowDurationMins, slot)}`,
      usedPercent,
      remainingPercent: usedPercent === null ? null : Math.min(100, Math.max(0, 100 - usedPercent)),
      resetsAt,
      windowDurationMins,
    });
  }
}

export function normalizeQuota(raw: unknown, now = new Date()): QuotaSnapshot {
  const snapshot: QuotaSnapshot = { fetchedAt: now.toISOString(), windows: [] };
  const response = asObject(raw);
  if (!response) return snapshot;

  if (response.rateLimitsByLimitId !== undefined && response.rateLimitsByLimitId !== null) {
    // An empty modern mapping is authoritative. Do not resurrect legacy data.
    for (const [id, bucket] of Object.entries(asObject(response.rateLimitsByLimitId) ?? {})) {
      addBucket(snapshot.windows, id, bucket);
    }
  } else {
    const bucket = asObject(response.rateLimits);
    addBucket(snapshot.windows, nonemptyText(bucket?.limitId) ?? 'codex', bucket);
  }
  return snapshot;
}
