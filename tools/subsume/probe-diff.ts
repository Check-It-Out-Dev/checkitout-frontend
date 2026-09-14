/**
 * Pure helpers for the per-test coverage probes (tools/subsume/jest-probes.ts).
 *
 * babel-plugin-istanbul keeps, per instrumented file, three cumulative counter tables:
 * `s` statements, `f` functions, `b` branches (an array per branch, one counter per path).
 * A snapshot copies them; a diff between two snapshots names every counter that INCREASED,
 * which is exactly the set of statements, functions and branch paths the test in between
 * exercised. Nothing here touches Jest, so it is unit-tested on its own.
 */
export type Counters = {
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
};
export type Snapshot = Record<string, Counters>;
/** Per file: statement ids, function ids and [branch id, path index] pairs that ran. */
export type Hits = Record<string, { s: number[]; f: number[]; b: [number, number][] }>;

export function snapshot(cov: Record<string, Partial<Counters>> | undefined): Snapshot {
  const out: Snapshot = {};
  if (!cov) return out;
  for (const [file, c] of Object.entries(cov)) {
    out[file] = {
      s: { ...(c.s ?? {}) },
      f: { ...(c.f ?? {}) },
      b: Object.fromEntries(Object.entries(c.b ?? {}).map(([id, paths]) => [id, [...paths]])),
    };
  }
  return out;
}

export function diff(prev: Snapshot, cur: Snapshot): Hits {
  const hits: Hits = {};
  for (const [file, c] of Object.entries(cur)) {
    const p = prev[file];
    const s = increased(c.s, p?.s);
    const f = increased(c.f, p?.f);
    const b: [number, number][] = [];
    for (const [id, paths] of Object.entries(c.b)) {
      const before = p?.b[id] ?? [];
      paths.forEach((n, i) => {
        if (n > (before[i] ?? 0)) b.push([Number(id), i]);
      });
    }
    if (s.length || f.length || b.length) hits[file] = { s, f, b };
  }
  return hits;
}

function increased(cur: Record<string, number>, prev?: Record<string, number>): number[] {
  return Object.entries(cur)
    .filter(([id, n]) => n > (prev?.[id] ?? 0))
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}
