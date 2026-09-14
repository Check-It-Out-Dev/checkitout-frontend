/**
 * The decision, per test: is it carried by the tests that stay?
 *
 *   probesOk  every probe it covers is covered by a kept, non-flaky test
 *   killsOk   every mutant it kills is killed by a kept, non-flaky test
 *   inScope   every unit it touches is a unit the kill matrix says something about — otherwise
 *             kill-subsumption is vacuous, and the test is at most a suspect
 *
 * CONFIRMED = probesOk ∧ killsOk ∧ inScope. SUSPECTED = probesOk ∧ ¬(killsOk ∧ inScope). Anything
 * else is KEEP. Flaky tests are KEEP on their own record: a test whose result is unreliable is
 * not evidence for anything, including its own redundancy.
 */
import { realTests } from './load.mjs';

/** Union of probes and kills over a set of test ids, non-flaky only. */
export function carriedUnion(matrix, keep) {
  const probes = new Set();
  const kills = new Set();
  for (const id of keep) {
    const t = matrix.tests.get(id);
    if (!t || t.flaky) continue;
    for (const p of t.probes) probes.add(p);
    for (const k of t.kills) kills.add(k);
  }
  return { probes, kills };
}

export function inMutationScope(matrix, testId) {
  const t = matrix.tests.get(testId);
  if (!t) return false;
  for (const u of t.units) if (!matrix.scope.has(u)) return false;
  return true;
}

export function judge(
  matrix,
  testId,
  keep,
  union = carriedUnion(
    matrix,
    [...keep].filter((k) => k !== testId),
  ),
) {
  const t = matrix.tests.get(testId);
  if (!t) throw new Error(`unknown test ${testId}`);
  const missingProbes = [...t.probes].filter((p) => !union.probes.has(p));
  const missingKills = [...t.kills].filter((k) => !union.kills.has(k));
  const inScope = inMutationScope(matrix, testId);
  const probesOk = missingProbes.length === 0;
  const killsOk = missingKills.length === 0;
  // A test the instrument cannot see — no probe at all, because it loads nothing instrumented —
  // would satisfy "every probe is carried" vacuously. It is unobserved, not redundant.
  const unobserved = t.probes.size === 0;
  let tier = 'KEEP';
  let reason = null;
  if (t.flaky) reason = 'flaky';
  else if (unobserved) reason = 'unobserved';
  else if (probesOk && killsOk && inScope) tier = 'CONFIRMED';
  else if (probesOk) {
    tier = 'SUSPECTED';
    reason = inScope ? 'sole-killer' : 'out-of-scope';
  } else reason = 'unique-probes';
  const outOfScope = [...t.units].filter((u) => !matrix.scope.has(u));
  return {
    test: testId,
    tier,
    reason,
    probesOk,
    killsOk,
    inScope,
    unobserved,
    flaky: t.flaky,
    missingProbes,
    missingKills,
    outOfScope,
    own: { probes: t.probes.size, kills: t.kills.size },
  };
}

/** A small set of kept tests that together carry everything `testId` covers and kills — greedy. */
export function carriers(matrix, testId, keep) {
  const t = matrix.tests.get(testId);
  let need = new Set([...t.probes, ...[...t.kills].map((k) => `kill:${k}`)]);
  const pool = [...keep]
    .filter((id) => id !== testId)
    .map((id) => matrix.tests.get(id))
    .filter((x) => x && !x.flaky);
  const out = [];
  while (need.size > 0) {
    let best = null;
    let bestGain = 0;
    for (const c of pool) {
      let gain = 0;
      for (const p of c.probes) if (need.has(p)) gain++;
      for (const k of c.kills) if (need.has(`kill:${k}`)) gain++;
      if (gain > bestGain || (gain === bestGain && best && c.id < best.id)) {
        best = c;
        bestGain = gain;
      }
    }
    if (!best || bestGain === 0) break;
    out.push(best.id);
    for (const p of best.probes) need.delete(p);
    for (const k of best.kills) need.delete(`kill:${k}`);
  }
  return { carriers: out, uncarried: [...need] };
}

/** Judge every real test against the kept set; the kept set itself is judged too (a kept test
 *  that another kept test carries is reported, so the caller can see the cover's slack). */
export function judgeAll(matrix, keep) {
  return realTests(matrix).map((t) => judge(matrix, t.id, keep));
}
