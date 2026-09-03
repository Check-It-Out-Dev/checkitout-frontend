/**
 * Stage 5b — semantic trace diff.
 *
 * Compares two `CanonicalTrace`s and produces a structured `TraceDiff`.
 * Two modes:
 *
 * - `ordered` (default): traces must match position-by-position. Reorders
 *   are reported as `reordered` entries (still passes if `reorder` is the
 *   only delta and the spec opts in via mode='set' next time).
 * - `set`: traces are compared as multisets — order doesn't matter, but
 *   counts must match.
 */

import type {
  CanonicalEntry,
  CanonicalTrace,
  DiffOptions,
  ExpectedCall,
  TraceDiff,
  TraceDiffChanged,
  TraceFieldDiff,
  TraceReorder,
} from './types';

const DEFAULT_OPTIONS: Required<DiffOptions> = {
  mode: 'ordered',
  ignorePaths: [],
  expectedRemoved: [],
  expectedAdded: [],
  expectedChanged: [],
};

export function diff(
  expected: CanonicalTrace,
  actual: CanonicalTrace,
  options: DiffOptions = {},
): TraceDiff {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ignored = new Set(opts.ignorePaths);
  const expectedFiltered = expected.filter((e) => !ignored.has(e.path));
  const actualFiltered = actual.filter((e) => !ignored.has(e.path));

  const raw =
    opts.mode === 'set'
      ? setDiff(expectedFiltered, actualFiltered)
      : orderedDiff(expectedFiltered, actualFiltered);

  return applyExpectedDrift(raw, opts.expectedRemoved, opts.expectedAdded, opts.expectedChanged);
}

/**
 * Partition `raw.added` and `raw.removed` against the spec's expected-drift
 * lists. Matched entries move to `expectedDrift{Added,Removed}` (audit trail)
 * and don't contribute to the `equivalent` verdict. Unmatched entries stay
 * in `added`/`removed` and continue to fail the spec.
 */
function applyExpectedDrift(
  raw: TraceDiff,
  expectedRemoved: readonly ExpectedCall[],
  expectedAdded: readonly ExpectedCall[],
  expectedChanged: readonly ExpectedCall[],
): TraceDiff {
  const removedConsumed = countByCall(expectedRemoved);
  const addedConsumed = countByCall(expectedAdded);
  const changedConsumed = countByCall(expectedChanged);

  const driftRemoved: CanonicalEntry[] = [];
  const remainingRemoved: CanonicalEntry[] = [];
  for (const entry of raw.removed) {
    const key = callKey(entry);
    const slots = removedConsumed.get(key) ?? 0;
    if (slots > 0) {
      removedConsumed.set(key, slots - 1);
      driftRemoved.push(entry);
    } else {
      remainingRemoved.push(entry);
    }
  }

  const driftAdded: CanonicalEntry[] = [];
  const remainingAdded: CanonicalEntry[] = [];
  for (const entry of raw.added) {
    const key = callKey(entry);
    const slots = addedConsumed.get(key) ?? 0;
    if (slots > 0) {
      addedConsumed.set(key, slots - 1);
      driftAdded.push(entry);
    } else {
      remainingAdded.push(entry);
    }
  }

  const driftChanged: TraceDiffChanged[] = [];
  const remainingChanged: TraceDiffChanged[] = [];
  for (const c of raw.changed) {
    const key = callKey(c);
    const slots = changedConsumed.get(key) ?? 0;
    if (slots > 0) {
      changedConsumed.set(key, slots - 1);
      driftChanged.push(c);
    } else {
      remainingChanged.push(c);
    }
  }

  const equivalent =
    remainingAdded.length === 0 &&
    remainingRemoved.length === 0 &&
    remainingChanged.length === 0 &&
    raw.reordered.length === 0;

  return {
    equivalent,
    added: remainingAdded,
    removed: remainingRemoved,
    changed: remainingChanged,
    reordered: raw.reordered,
    latencyDeltas: raw.latencyDeltas,
    expectedDriftRemoved: driftRemoved,
    expectedDriftAdded: driftAdded,
    expectedDriftChanged: driftChanged,
  };
}

function countByCall(calls: readonly ExpectedCall[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of calls) {
    const k = `${c.method} ${c.path}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function callKey(entry: { method: string; path: string }): string {
  return `${entry.method} ${entry.path}`;
}

function orderedDiff(expected: CanonicalTrace, actual: CanonicalTrace): TraceDiff {
  const changed: TraceDiffChanged[] = [];
  const reordered: TraceReorder[] = [];
  const added: CanonicalEntry[] = [];
  const removed: CanonicalEntry[] = [];

  const minLen = Math.min(expected.length, actual.length);
  for (let i = 0; i < minLen; i++) {
    const e = expected[i];
    const a = actual[i];
    if (sameMethodAndPath(e, a)) {
      const fieldDiffs = compareEntryFields(e, a);
      if (fieldDiffs.length > 0) {
        changed.push({ index: i, path: e.path, method: e.method, differences: fieldDiffs });
      }
      continue;
    }
    // Different at this position — try to find a matching call further down
    // in the actual trace. If found, that's a reorder. Otherwise, expected
    // entry is missing and actual is extra.
    const j = findMatch(actual, i, e);
    if (j >= 0) {
      reordered.push({ expectedIndex: i, actualIndex: j, path: e.path, method: e.method });
    } else {
      removed.push(e);
      added.push(a);
    }
  }
  if (expected.length > actual.length) {
    removed.push(...expected.slice(actual.length));
  } else if (actual.length > expected.length) {
    added.push(...actual.slice(expected.length));
  }

  const equivalent =
    added.length === 0 && removed.length === 0 && changed.length === 0 && reordered.length === 0;
  return {
    equivalent,
    added,
    removed,
    changed,
    reordered,
    latencyDeltas: [],
    expectedDriftRemoved: [],
    expectedDriftAdded: [],
    expectedDriftChanged: [],
  };
}

function setDiff(expected: CanonicalTrace, actual: CanonicalTrace): TraceDiff {
  // Bucket each side by canonical-key (method + path). Then within each
  // bucket compare counts and shapes.
  const expectedBuckets = bucketByKey(expected);
  const actualBuckets = bucketByKey(actual);

  const allKeys = new Set([...expectedBuckets.keys(), ...actualBuckets.keys()]);
  const added: CanonicalEntry[] = [];
  const removed: CanonicalEntry[] = [];
  const changed: TraceDiffChanged[] = [];

  for (const key of allKeys) {
    const e = expectedBuckets.get(key) ?? [];
    const a = actualBuckets.get(key) ?? [];
    if (e.length === 0) {
      added.push(...a);
      continue;
    }
    if (a.length === 0) {
      removed.push(...e);
      continue;
    }
    // Pair up greedily; report changed for diffs, added/removed for surplus.
    const pairCount = Math.min(e.length, a.length);
    for (let i = 0; i < pairCount; i++) {
      const fieldDiffs = compareEntryFields(e[i], a[i]);
      if (fieldDiffs.length > 0) {
        changed.push({ index: -1, path: e[i].path, method: e[i].method, differences: fieldDiffs });
      }
    }
    if (e.length > a.length) removed.push(...e.slice(pairCount));
    else if (a.length > e.length) added.push(...a.slice(pairCount));
  }

  const equivalent = added.length === 0 && removed.length === 0 && changed.length === 0;
  return {
    equivalent,
    added,
    removed,
    changed,
    reordered: [],
    latencyDeltas: [],
    expectedDriftRemoved: [],
    expectedDriftAdded: [],
    expectedDriftChanged: [],
  };
}

function bucketByKey(trace: CanonicalTrace): Map<string, CanonicalEntry[]> {
  const buckets = new Map<string, CanonicalEntry[]>();
  for (const e of trace) {
    const key = `${e.method} ${e.path}`;
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }
  return buckets;
}

function sameMethodAndPath(a: CanonicalEntry, b: CanonicalEntry): boolean {
  return a.method === b.method && a.path === b.path;
}

function compareEntryFields(
  expected: CanonicalEntry,
  actual: CanonicalEntry,
): readonly TraceFieldDiff[] {
  const diffs: TraceFieldDiff[] = [];
  if (!deepEqual(expected.query, actual.query)) {
    diffs.push({ field: 'query', expected: expected.query, actual: actual.query });
  }
  if (!deepEqual(expected.requestHeaders, actual.requestHeaders)) {
    diffs.push({
      field: 'requestHeaders',
      expected: expected.requestHeaders,
      actual: actual.requestHeaders,
    });
  }
  if (!deepEqual(expected.requestBody, actual.requestBody)) {
    diffs.push({
      field: 'requestBody',
      expected: expected.requestBody,
      actual: actual.requestBody,
    });
  }
  if (expected.responseStatus !== actual.responseStatus) {
    diffs.push({
      field: 'responseStatus',
      expected: expected.responseStatus,
      actual: actual.responseStatus,
    });
  }
  if (!deepEqual(expected.responseHeaders, actual.responseHeaders)) {
    diffs.push({
      field: 'responseHeaders',
      expected: expected.responseHeaders,
      actual: actual.responseHeaders,
    });
  }
  if (!deepEqual(expected.responseBody, actual.responseBody)) {
    diffs.push({
      field: 'responseBody',
      expected: expected.responseBody,
      actual: actual.responseBody,
    });
  }
  return diffs;
}

function findMatch(trace: CanonicalTrace, fromIndex: number, target: CanonicalEntry): number {
  for (let i = fromIndex + 1; i < trace.length; i++) {
    if (sameMethodAndPath(trace[i], target)) return i;
  }
  return -1;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as readonly unknown[]).length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], (b as readonly unknown[])[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in bo)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Render a `TraceDiff` as a human-readable markdown report. Used when an
 * integration spec fails — written to `test-results/integration/<flow>-diff.md`.
 *
 * Always includes the `expectedDrift` audit-trail sections, even on 🟢
 * equivalent runs — they capture documented intentional drift.
 */
export function renderDiffMarkdown(d: TraceDiff): string {
  const out: string[] = ['# Trace diff', ''];
  if (d.equivalent) {
    out.push('🟢 **Equivalent.** No unaccounted drift.', '');
  } else {
    out.push('🔴 **Drift detected.**', '');
    out.push(`- Added (greenfield only): **${d.added.length}**`);
    out.push(`- Removed (legacy only):   **${d.removed.length}**`);
    out.push(`- Changed (same call, different shape): **${d.changed.length}**`);
    out.push(`- Reordered: **${d.reordered.length}**`);
    out.push('');
  }
  if (d.added.length) {
    out.push('## Added (greenfield made calls legacy did not)', '');
    for (const e of d.added) out.push(`- \`${e.method} ${e.path}\` → ${e.responseStatus}`);
    out.push('');
  }
  if (d.removed.length) {
    out.push('## Removed (legacy made calls greenfield does not)', '');
    for (const e of d.removed) out.push(`- \`${e.method} ${e.path}\` → ${e.responseStatus}`);
    out.push('');
  }
  if (d.changed.length) {
    out.push('## Changed (same path/method, shape differs)', '');
    for (const c of d.changed) {
      out.push(`### \`${c.method} ${c.path}\` (index ${c.index})`);
      for (const fd of c.differences) {
        out.push(
          `- **${fd.field}**: \`${JSON.stringify(fd.expected)}\` → \`${JSON.stringify(fd.actual)}\``,
        );
      }
      out.push('');
    }
  }
  if (d.reordered.length) {
    out.push('## Reordered (multiset matches; order differs)', '');
    for (const r of d.reordered) {
      out.push(
        `- \`${r.method} ${r.path}\`: expected at #${r.expectedIndex}, observed at #${r.actualIndex}`,
      );
    }
    out.push('');
  }
  if (d.expectedDriftRemoved.length) {
    out.push('## ✅ Expected drift — legacy-only (documented in spec)', '');
    for (const e of d.expectedDriftRemoved) {
      out.push(`- \`${e.method} ${e.path}\` → ${e.responseStatus}`);
    }
    out.push('');
  }
  if (d.expectedDriftAdded.length) {
    out.push('## ✅ Expected drift — greenfield-only (documented in spec)', '');
    for (const e of d.expectedDriftAdded) {
      out.push(`- \`${e.method} ${e.path}\` → ${e.responseStatus}`);
    }
    out.push('');
  }
  if (d.expectedDriftChanged.length) {
    out.push('## ✅ Expected drift — same path, intentional shape difference', '');
    for (const c of d.expectedDriftChanged) {
      out.push(
        `- \`${c.method} ${c.path}\` (${c.differences.length} field diffs — see triage doc)`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}
