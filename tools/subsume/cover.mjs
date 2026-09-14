/**
 * Greedy weighted set cover over probes ∪ killed mutants (Harrold, Gupta & Soffa 1993, with
 * seconds as the weight): pick, again and again, the test that adds the most units still
 * uncovered per second it costs, until nothing is left to add. What was picked is the core the
 * suite cannot do without; what was never picked is the candidate list — each candidate is then
 * judged on its own by subsume.mjs, because greedy cover is a heuristic and the invariants are not.
 *
 * Greedy picks a cheap partial test before the superset that arrives later, and never looks back;
 * a second pass walks the picked set slowest-first and drops every test whose units the rest of
 * the set still carries, so the core is minimal in the sense the invariants use (no kept test is
 * subsumed by the other kept tests) and the residual is as large as the evidence allows.
 *
 * Flaky tests are always kept and never counted: a unit only a flaky test reaches is reported as
 * uncovered rather than credited to it.
 */
import { realTests } from './load.mjs';

export function greedyCover(matrix, { minSeconds = 0.001 } = {}) {
  const tests = realTests(matrix).filter((t) => !t.flaky);
  const universe = new Map(); // unit -> Set<testId>
  const unitsOf = new Map(); // testId -> string[]
  for (const t of tests) {
    const units = [...t.probes, ...[...t.kills].map((k) => `kill:${k}`)];
    unitsOf.set(t.id, units);
    for (const u of units) {
      if (!universe.has(u)) universe.set(u, new Set());
      universe.get(u).add(t.id);
    }
  }
  const remaining = new Map(tests.map((t) => [t.id, unitsOf.get(t.id).length]));
  const covered = new Set();
  const kept = [];
  while (true) {
    let best = null;
    let bestScore = 0;
    for (const t of tests) {
      const gain = remaining.get(t.id);
      if (gain <= 0) continue;
      const score = gain / Math.max(t.seconds ?? minSeconds, minSeconds);
      if (score > bestScore || (score === bestScore && best && t.id < best.id)) {
        best = t;
        bestScore = score;
      }
    }
    if (!best) break;
    kept.push(best.id);
    for (const u of unitsOf.get(best.id)) {
      if (covered.has(u)) continue;
      covered.add(u);
      for (const other of universe.get(u)) remaining.set(other, remaining.get(other) - 1);
    }
  }
  const keptSet = new Set(kept);
  // second pass: a kept test every unit of which two or more kept tests reach may go
  const carriersOf = new Map(); // unit -> number of kept tests reaching it
  for (const id of kept)
    for (const u of unitsOf.get(id)) carriersOf.set(u, (carriersOf.get(u) ?? 0) + 1);
  const byId = new Map(tests.map((t) => [t.id, t]));
  const slowestFirst = [...kept].sort(
    (a, b) => (byId.get(b).seconds ?? 0) - (byId.get(a).seconds ?? 0) || (a < b ? -1 : 1),
  );
  for (const id of slowestFirst) {
    const units = unitsOf.get(id);
    if (units.length === 0 || units.some((u) => carriersOf.get(u) < 2)) continue;
    keptSet.delete(id);
    for (const u of units) carriersOf.set(u, carriersOf.get(u) - 1);
  }
  for (const t of realTests(matrix)) if (t.flaky) keptSet.add(t.id);
  const residual = tests.filter((t) => !keptSet.has(t.id)).map((t) => t.id);
  const uncovered = [...universe.keys()].filter((u) => !covered.has(u));
  return { kept: keptSet, order: kept.filter((id) => keptSet.has(id)), residual, uncovered };
}
