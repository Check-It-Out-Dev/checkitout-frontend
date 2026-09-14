import { greedyCover } from './cover.mjs';
import { newMatrix } from './load.mjs';
import { exactCover, reduce } from './solve.mjs';

/**
 * The exact cover must find what greedy cannot, must never lose a probe or a kill, and must
 * say what it is: method, status and gap. The reductions must force an essential test and
 * drop a dominated one without changing the optimum.
 */
type M = ReturnType<typeof newMatrix>;

function build(
  tests: { id: string; probes: string[]; kills?: string[]; seconds: number; flaky?: boolean }[],
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
      units: new Set(['u']),
    });
    for (const p of t.probes)
      if (!m.probes.has(`u|${p}`))
        m.probes.set(`u|${p}`, { unit: 'u', member: 'f', lines: null, branch: false });
    for (const k of t.kills ?? []) {
      if (!m.mutants.has(k))
        m.mutants.set(k, { unit: 'u', line: 1, status: 'KILLED', killers: new Set() });
      m.mutants.get(k)!.killers.add(t.id);
    }
  }
  m.scope.add('u');
  return m;
}

// greedy's trap: the big cheap-per-unit set first, then a whole set for the one element left;
// D exists so that no element has a single coverer and the reductions leave a real choice
const trap = () =>
  build([
    { id: 'A', probes: ['e1', 'e2', 'e3'], seconds: 3 },
    { id: 'B', probes: ['e4', 'e5', 'e6'], seconds: 3 },
    { id: 'C', probes: ['e1', 'e2', 'e3', 'e4', 'e5'], seconds: 4 },
    { id: 'D', probes: ['e6', 'e1'], seconds: 3.5 },
  ]);

describe('exact cover', () => {
  it('finds the minimum where greedy does not, and certifies it', async () => {
    const m = trap();
    const g = greedyCover(m);
    expect([...g.kept].sort()).toEqual(['B', 'C']); // 7 s
    const r = await exactCover(m);
    expect([...r.kept].sort()).toEqual(['A', 'B']); // 6 s
    expect(r.residual.sort()).toEqual(['C', 'D']);
    expect(r.solver).toMatchObject({
      method: 'mip',
      greedyCost: 7,
      incumbentCost: 6,
      gapPct: 0,
      forced: 0,
      dominatedDropped: 0,
    });
    expect(r.solver.status.toLowerCase()).toContain('optimal');
  });

  it('never loses a probe or a kill, and keeps every flaky test without counting it', async () => {
    const m = build([
      { id: 'a', probes: ['1', '2'], kills: ['m1'], seconds: 0.5 },
      { id: 'b', probes: ['2', '3'], kills: ['m1', 'm2'], seconds: 0.5 },
      { id: 'c', probes: ['1', '3'], kills: ['m2'], seconds: 0.5 },
      {
        id: 'f',
        probes: ['1', '2', '3', '4'],
        kills: ['m1', 'm2', 'm3'],
        seconds: 0.1,
        flaky: true,
      },
    ]);
    const r = await exactCover(m);
    expect(r.kept.has('f')).toBe(true);
    const probes = new Set<string>();
    const kills = new Set<string>();
    for (const id of r.kept) {
      const t = m.tests.get(id)!;
      if (t.flaky) continue;
      for (const p of t.probes) probes.add(p);
      for (const k of t.kills) kills.add(k);
    }
    expect([...probes].sort()).toEqual(['u|1', 'u|2', 'u|3']);
    expect([...kills].sort()).toEqual(['m1', 'm2']);
    expect(r.uncovered).toEqual(['kill:m3', 'u|4']); // only the flaky test reaches these
    expect(r.solver.flakyOnly).toBe(2);
  });

  it('reduces to a fixpoint: essential tests forced, dominated tests dropped', () => {
    const m = build([
      { id: 'only', probes: ['x', 'y'], seconds: 1 }, // the only test on x
      { id: 'big', probes: ['y', 'z', 'w'], seconds: 2 },
      { id: 'small', probes: ['z', 'w'], seconds: 3 }, // dominated by big (subset, dearer)
      { id: 'same', probes: ['z', 'w'], seconds: 2 }, // same rows as big at the same cost: big wins the tie
    ]);
    const r = reduce(m);
    expect([...r.forced].sort()).toEqual(['big', 'only']); // big becomes essential once its rivals go
    expect([...r.dropped].sort()).toEqual(['same', 'small']);
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
  });

  it('merges elements with identical coverers into one row and leaves real choices alone', () => {
    const m = build([
      { id: 'p', probes: ['x', 'y', 'z'], seconds: 2 },
      { id: 'q', probes: ['x', 'y', 'w'], seconds: 2 },
      { id: 'r', probes: ['z', 'w'], seconds: 1 },
    ]);
    const r = reduce(m);
    expect(r.forced.size).toBe(0);
    expect(r.dropped.size).toBe(0);
    expect(r.rows.map((row) => row.elements.sort().join(',')).sort()).toEqual([
      'u|w',
      'u|x,u|y',
      'u|z',
    ]);
  });

  it('is decided by the reductions alone when nothing is left to choose', async () => {
    const m = build([
      { id: 'p', probes: ['1'], seconds: 1 },
      { id: 'q', probes: ['2'], seconds: 1 },
    ]);
    const r = await exactCover(m);
    expect([...r.kept].sort()).toEqual(['p', 'q']);
    expect(r.solver.method).toBe('reduction');
    expect(r.residual).toEqual([]);
  });
});
