/**
 * The numbers a reviewer and a README may quote about redundancy — per test and for the suite —
 * in the forms the literature settled on, with flaky tests removed from every union first
 * (their kills and coverage are not deterministic: Shi, Bell & Marinov, ISSTA 2019).
 *
 * Per test t, with P(t) its probes, K(t) its kills, T the reliable suite:
 *   covRed(t)  = |P(t) ∩ P(T∖t)| / |P(t)|      share of its coverage others already give
 *                                               (Koochakzadeh, Garousi & Maurer, ICST 2009)
 *   killRed(t) = |K(t) ∩ K(T∖t)| / |K(t)|      share of its kills others already make
 *   unique probes / kills                        what only it reaches (Ammann, Delamaro & Offutt,
 *                                               ICST 2014: a sole killer belongs to every minimal set)
 *   score R(t) = 0 if it is a sole killer, else 0.3·covRed + 0.7·killRed — kills weighted over
 *                probes because coverage correlates only weakly with effectiveness once size is
 *                controlled (Inozemtseva & Holmes, ICSE 2014)
 *   redundantSeconds = R(t) · seconds — the demotion priority
 * Edge cases, stated: no probes → covRed := 1 and `noProbes`; no kills → killRed := 1 and
 * `killsNothing`; flaky → not scored (null), never a coverer, always kept.
 *
 * For the suite, O the tier before and R after:
 *   sizeReduction = 1 − |R|/|O|, timeReduction = 1 − Σ_R s / Σ_O s  (Rothermel et al., 1998)
 *   probeLoss, killLoss — |P(O)∖P(R)|, |K(O)∖K(R)|: zero by invariant, measured anyway
 *                        (Shi, Gyori, Gligoric, Zaytsev & Marinov, FSE 2014)
 *   dominatorScore     — killed dominator mutants / (dominators + unkilled mutants), before and
 *                        after: a mutant dominates another when every test killing it kills the
 *                        other too, and every mutant nobody killed stands as an unkilled
 *                        dominator; the de-inflated mutation score (Ammann et al. 2014; Kurtz
 *                        et al., FSE 2016)
 *   redundancyShare    = Σ R(t)·s(t) / Σ s(t): the share of tier time that is redundant
 *   fullyRedundant     — tests with R(t) = 1
 * What none of these measure is real-world loss; Shi et al. (ISSTA 2018) found up to 52 % of
 * failed builds missed by reductions these metrics called safe. That number is the ledger's
 * failed-build proxy, tracked over rounds, not a property of one report.
 */
import { realTests } from './load.mjs';

const r4 = (x) => Math.round(x * 10000) / 10000;

/** Per-test metrics, keyed by test id. */
export function testMetrics(matrix) {
  const tests = realTests(matrix);
  const reliable = tests.filter((t) => !t.flaky);
  const probeReach = new Map();
  const killReach = new Map();
  for (const t of reliable) {
    for (const p of t.probes) probeReach.set(p, (probeReach.get(p) ?? 0) + 1);
    for (const k of t.kills) killReach.set(k, (killReach.get(k) ?? 0) + 1);
  }
  const out = new Map();
  for (const t of tests) {
    const seconds = t.seconds ?? 0;
    if (t.flaky) {
      out.set(t.id, {
        flaky: true,
        covRed: null,
        killRed: null,
        uniqueProbes: 0,
        uniqueKills: 0,
        seconds,
        killsPerSecond: null,
        noProbes: t.probes.size === 0,
        killsNothing: t.kills.size === 0,
        soleKiller: false,
        score: null,
        redundantSeconds: 0,
      });
      continue;
    }
    const uniqueProbes = [...t.probes].filter((p) => probeReach.get(p) === 1).length;
    const uniqueKills = [...t.kills].filter((k) => killReach.get(k) === 1).length;
    const covRed = t.probes.size ? 1 - uniqueProbes / t.probes.size : 1;
    const killRed = t.kills.size ? 1 - uniqueKills / t.kills.size : 1;
    const soleKiller = uniqueKills > 0;
    const score = soleKiller ? 0 : 0.3 * covRed + 0.7 * killRed;
    out.set(t.id, {
      flaky: false,
      covRed: r4(covRed),
      killRed: r4(killRed),
      uniqueProbes,
      uniqueKills,
      seconds,
      killsPerSecond: seconds > 0 ? r4(t.kills.size / seconds) : null,
      noProbes: t.probes.size === 0,
      killsNothing: t.kills.size === 0,
      soleKiller,
      score: r4(score),
      redundantSeconds: r4(score * seconds),
    });
  }
  return out;
}

/**
 * Dominator mutants: those no other killed mutant subsumes. m_x subsumes m_y when m_x is killed
 * and every reliable test killing m_x kills m_y; among mutants with identical killers one stands
 * for all. Returns the set of dominator ids.
 */
export function dominators(matrix) {
  const reliableKillers = (mu) =>
    [...mu.killers].filter((id) => {
      const t = matrix.tests.get(id);
      return t && !t.flaky;
    });
  const groups = new Map(); // killer-set key -> { killers: string[], ids: string[] }
  for (const [id, mu] of matrix.mutants) {
    if (mu.status !== 'KILLED' && mu.status !== 'Killed') continue;
    const killers = reliableKillers(mu).sort();
    if (killers.length === 0) continue;
    const key = killers.join(String.fromCharCode(31));
    if (!groups.has(key)) groups.set(key, { killers, ids: [] });
    groups.get(key).ids.push(id);
  }
  const byKiller = new Map(); // testId -> group keys it kills
  for (const [key, g] of groups)
    for (const k of g.killers) {
      if (!byKiller.has(k)) byKiller.set(k, new Set());
      byKiller.get(k).add(key);
    }
  const out = new Set();
  for (const [key, g] of groups) {
    const mine = new Set(g.killers);
    // a group with a strict subset of my killers subsumes me; every such group shares at least
    // one killer with me, so the candidates are the groups of each of my killers
    let dominated = false;
    const seen = new Set([key]);
    outer: for (const k of g.killers)
      for (const other of byKiller.get(k)) {
        if (seen.has(other)) continue;
        seen.add(other);
        const o = groups.get(other);
        if (o.killers.length < mine.size && o.killers.every((x) => mine.has(x))) {
          dominated = true;
          break outer;
        }
      }
    if (!dominated) out.add(g.ids.sort()[0]);
  }
  return out;
}

/** Suite-level metrics for the tier before (all real tests) and after (`kept`). */
export function suiteMetrics(matrix, kept, perTest = testMetrics(matrix)) {
  const before = realTests(matrix);
  const after = before.filter((t) => kept.has(t.id));
  const union = (ts) => {
    const probes = new Set();
    const kills = new Set();
    for (const t of ts) {
      if (t.flaky) continue;
      for (const p of t.probes) probes.add(p);
      for (const k of t.kills) kills.add(k);
    }
    return { probes, kills };
  };
  const b = union(before);
  const a = union(after);
  const secs = (ts) => ts.reduce((s, t) => s + (t.seconds ?? 0), 0);
  const dom = dominators(matrix);
  const domKilledBy = (ts) => {
    const kills = union(ts).kills;
    return [...dom].filter((id) => kills.has(id)).length;
  };
  // every mutant nobody killed (survived, timed out, uncovered) stands as an unkilled dominator:
  // the score is killed dominators over all dominators, the way Kurtz et al. (FSE 2016) count it
  const unkilled = [...matrix.mutants.values()].filter(
    (mu) => mu.status !== 'KILLED' && mu.status !== 'Killed',
  ).length;
  const domScore = (ts) =>
    dom.size + unkilled ? r4(domKilledBy(ts) / (dom.size + unkilled)) : null;
  const scored = before.filter((t) => !t.flaky);
  const redundantSeconds = scored.reduce((s, t) => s + perTest.get(t.id).redundantSeconds, 0);
  return {
    tests: { before: before.length, after: after.length },
    seconds: { before: r4(secs(before)), after: r4(secs(after)) },
    sizeReduction: before.length ? r4(1 - after.length / before.length) : 0,
    timeReduction: secs(before) ? r4(1 - secs(after) / secs(before)) : 0,
    probeLoss: [...b.probes].filter((p) => !a.probes.has(p)).length,
    killLoss: [...b.kills].filter((k) => !a.kills.has(k)).length,
    dominators: dom.size,
    unkilledMutants: unkilled,
    dominatorScore: { before: domScore(before), after: domScore(after) },
    redundancyShare: secs(scored) ? r4(redundantSeconds / secs(scored)) : 0,
    fullyRedundant: scored.filter((t) => perTest.get(t.id).score === 1).length,
    soleKillers: scored.filter((t) => perTest.get(t.id).soleKiller).length,
    flaky: before.length - scored.length,
  };
}
