import { newMatrix } from './load.mjs';
import { dominators, suiteMetrics, testMetrics } from './metrics.mjs';
import { judge } from './subsume.mjs';

/**
 * The formulas, pinned on a hand-sized suite: covRed and killRed as shares of what others also
 * reach, a sole killer scored 0, a test that kills nothing scored on coverage alone and flagged,
 * a flaky test unscored; dominators as the minimal mutant set; the suite numbers before/after.
 */
type M = ReturnType<typeof newMatrix>;

function build(
  tests: {
    id: string;
    probes: string[];
    kills?: string[];
    covers?: string[];
    seconds: number;
    flaky?: boolean;
  }[],
): M {
  const m = newMatrix('test');
  for (const t of tests) {
    m.tests.set(t.id, {
      id: t.id,
      spec: 'S',
      seconds: t.seconds,
      flaky: !!t.flaky,
      probes: new Set(t.probes.map((p) => `u|${p}`)),
      kills: new Set(t.kills ?? []),
      covers: new Set([...(t.covers ?? []), ...(t.kills ?? [])]),
      units: new Set(['u']),
    });
    for (const p of t.probes)
      if (!m.probes.has(`u|${p}`))
        m.probes.set(`u|${p}`, { unit: 'u', member: 'f', lines: null, branch: false });
    for (const k of [...(t.kills ?? []), ...(t.covers ?? [])]) {
      if (!m.mutants.has(k))
        m.mutants.set(k, {
          unit: 'u',
          line: 1,
          status: 'KILLED',
          killers: new Set(),
          coverers: new Set(),
        });
      m.mutants.get(k)!.coverers.add(t.id);
      if ((t.kills ?? []).includes(k)) m.mutants.get(k)!.killers.add(t.id);
    }
  }
  m.scope.add('u');
  // one mutant nobody kills: it counts as an unkilled dominator in the score
  m.mutants.set('m5', {
    unit: 'u',
    line: 5,
    status: 'SURVIVED',
    killers: new Set(),
    coverers: new Set(),
  });
  return m;
}

const suite = () =>
  build([
    { id: 'full', probes: ['1', '2', '3', '4'], kills: ['m1', 'm2', 'm3'], seconds: 2 },
    { id: 'half', probes: ['1', '2'], kills: ['m1'], seconds: 1 }, // fully redundant
    { id: 'edge', probes: ['4', '5'], kills: ['m3', 'm4'], seconds: 1 }, // sole killer of m4, owns 5
    { id: 'quiet', probes: ['1'], covers: ['m1'], seconds: 0.5 }, // ran against m1, killed nothing
    { id: 'blind', probes: ['2'], seconds: 0.5 }, // never ran against a mutant
    { id: 'shaky', probes: ['1', '9'], kills: ['m9'], seconds: 3, flaky: true },
  ]);

describe('redundancy metrics', () => {
  const m = suite();
  const tm = testMetrics(m);

  it('scores a fully carried test 1, a sole killer 0, and states the weights', () => {
    expect(tm.get('half')).toMatchObject({ covRed: 1, killRed: 1, score: 1, redundantSeconds: 1 });
    expect(tm.get('edge')).toMatchObject({
      uniqueProbes: 1,
      uniqueKills: 1,
      soleKiller: true,
      score: 0,
    });
    // full: probes 1..4 all reached by others? 3 is only full's → covRed 0.75; kills m1,m2,m3: m2 unique → killRed 2/3
    expect(tm.get('full')).toMatchObject({
      covRed: 0.75,
      killRed: 0.6667,
      soleKiller: true,
      score: 0,
    });
  });

  it('flags a test that kills nothing and one the matrix never ran, and leaves a flaky test unscored', () => {
    expect(tm.get('quiet')).toMatchObject({ killsNothing: true, killRed: 1, covRed: 1, score: 1 });
    expect(tm.get('blind')).toMatchObject({ killsNothing: true, score: 1 });
    expect(tm.get('shaky')).toMatchObject({ flaky: true, score: null, redundantSeconds: 0 });
    // the judge, not the score, decides: quiet was exercised by the matrix, blind was not
    const kept = new Set(['full', 'edge', 'shaky']);
    expect(judge(m, 'quiet', kept)).toMatchObject({ tier: 'CONFIRMED', reason: 'kills-nothing' });
    expect(judge(m, 'blind', kept)).toMatchObject({
      tier: 'SUSPECTED',
      reason: 'not-mutation-observed',
    });
    expect(judge(m, 'half', kept)).toMatchObject({ tier: 'CONFIRMED', reason: null });
  });

  it('finds the dominator mutants: those no other killed mutant subsumes', () => {
    // killers: m1 {full, half}, m2 {full}, m3 {full, edge}, m4 {edge}, m9 {shaky: flaky → no reliable killer}
    // m2 ⊂ m1 and m2 ⊂ m3 (every test killing m2 kills them) → m1, m3 dominated; m4 stands
    expect([...dominators(m)].sort()).toEqual(['m2', 'm4']);
  });

  it('measures the suite before and after a reduction, with zero loss by construction', () => {
    const kept = new Set(['full', 'edge', 'quiet', 'blind', 'shaky']); // half leaves
    const s = suiteMetrics(m, kept, tm);
    expect(s).toMatchObject({
      tests: { before: 6, after: 5 },
      seconds: { before: 8, after: 7 },
      sizeReduction: 0.1667,
      timeReduction: 0.125,
      probeLoss: 0,
      killLoss: 0,
      dominators: 2,
      unkilledMutants: 1,
      dominatorScore: { before: 0.6667, after: 0.6667 }, // 2 killed dominators of 2 + 1 survivor
      fullyRedundant: 3,
      soleKillers: 2,
      flaky: 1,
    });
    // redundant seconds: half 1 + quiet 0.5 + blind 0.5 = 2 of 5 reliable seconds
    expect(s.redundancyShare).toBe(0.4);
  });
});
