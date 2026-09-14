import fc from 'fast-check';

import { clusters } from './cluster.mjs';
import { greedyCover } from './cover.mjs';
import { lostKills, soleKillers } from './kills.mjs';
import { newMatrix } from './load.mjs';
import { project, regressions } from './project.mjs';
import { carriedUnion, carriers, judge } from './subsume.mjs';

/**
 * The properties the analysis must never lose, checked on generated matrices rather than on
 * hand-picked ones: nothing the suite covered or killed is lost when the residual is demoted,
 * the answer does not depend on the order tests were read in, running it twice changes nothing,
 * a test that owns a unique probe is never a candidate, and a flaky test carries nothing.
 */
type M = ReturnType<typeof newMatrix>;

function build(spec: {
  tests: { id: string; probes: number[]; kills: number[]; seconds: number; flaky?: boolean }[];
  scopeAll?: boolean;
}): M {
  const m = newMatrix('test');
  for (const t of spec.tests) {
    m.tests.set(t.id, {
      id: t.id,
      spec: 'S',
      seconds: t.seconds,
      flaky: !!t.flaky,
      probes: new Set(t.probes.map((p) => `u${p % 3}|${p}`)),
      kills: new Set(t.kills.map((k) => `m${k}`)),
      units: new Set(t.probes.map((p) => `u${p % 3}`)),
    });
    for (const p of t.probes) {
      if (!m.probes.has(`u${p % 3}|${p}`))
        m.probes.set(`u${p % 3}|${p}`, {
          unit: `u${p % 3}`,
          member: `f${p % 2}`,
          lines: [p],
          branch: p % 5 === 0,
        });
    }
    for (const k of t.kills) {
      if (!m.mutants.has(`m${k}`))
        m.mutants.set(`m${k}`, {
          unit: `u${k % 3}`,
          line: k,
          status: 'KILLED',
          killers: new Set(),
        });
      m.mutants.get(`m${k}`)!.killers.add(t.id);
    }
  }
  if (spec.scopeAll !== false) for (const u of ['u0', 'u1', 'u2']) m.scope.add(u);
  return m;
}

const arbTests = fc
  .array(
    fc.record({
      probes: fc.uniqueArray(fc.integer({ min: 0, max: 24 }), { minLength: 1, maxLength: 8 }),
      kills: fc.uniqueArray(fc.integer({ min: 0, max: 12 }), { maxLength: 4 }),
      seconds: fc.double({ min: 0.001, max: 2, noNaN: true }),
      flaky: fc.boolean(),
    }),
    { minLength: 1, maxLength: 14 },
  )
  .map((ts) => ts.map((t, i) => ({ ...t, id: `t${i}`, flaky: t.flaky && i % 4 === 0 })));

function union(m: M, ids: Iterable<string>) {
  return carriedUnion(m, [...ids]);
}

describe('subsume core', () => {
  it('demoting the residual loses no probe and no kill the non-flaky suite had', () => {
    fc.assert(
      fc.property(arbTests, (ts) => {
        const m = build({ tests: ts });
        const all = union(
          m,
          ts.map((t) => t.id),
        );
        const cover = greedyCover(m);
        const kept = union(m, cover.kept);
        for (const p of all.probes) expect(kept.probes.has(p)).toBe(true);
        for (const k of all.kills) expect(kept.kills.has(k)).toBe(true);
      }),
    );
  });

  it('every residual test is carried by the kept set (probes and kills)', () => {
    fc.assert(
      fc.property(arbTests, (ts) => {
        const m = build({ tests: ts });
        const cover = greedyCover(m);
        for (const id of cover.residual) {
          const j = judge(m, id, cover.kept);
          expect(j.probesOk && j.killsOk).toBe(true);
          expect(j.tier).toBe('CONFIRMED');
          const c = carriers(m, id, cover.kept);
          expect(c.uncarried).toEqual([]);
        }
      }),
    );
  });

  it('is invariant under the order tests are read in', () => {
    fc.assert(
      fc.property(arbTests, fc.nat(), (ts, seed) => {
        const a = build({ tests: ts });
        const shuffled = [...ts].sort(
          (x, y) =>
            (x.id + seed).length * 31 +
            x.id.charCodeAt(1) -
            ((y.id + seed).length * 31 + y.id.charCodeAt(1)),
        );
        const b = build({ tests: shuffled.reverse() });
        const ra = greedyCover(a);
        const rb = greedyCover(b);
        expect([...ra.kept].sort()).toEqual([...rb.kept].sort());
      }),
    );
  });

  it('is idempotent: covering the kept set again keeps all of it', () => {
    fc.assert(
      fc.property(arbTests, (ts) => {
        const m = build({ tests: ts });
        const first = greedyCover(m);
        const again = build({ tests: ts.filter((t) => first.kept.has(t.id)) });
        const second = greedyCover(again);
        expect(second.residual).toEqual([]);
      }),
    );
  });

  it('never proposes a test that owns a probe nobody else covers', () => {
    fc.assert(
      fc.property(arbTests, (ts) => {
        const m = build({ tests: ts });
        const cover = greedyCover(m);
        const counts = new Map<string, number>();
        for (const t of ts)
          if (!t.flaky)
            for (const p of new Set(t.probes))
              counts.set(`u${p % 3}|${p}`, (counts.get(`u${p % 3}|${p}`) ?? 0) + 1);
        for (const t of ts) {
          if (t.flaky) continue;
          const unique = [...new Set(t.probes)].some((p) => counts.get(`u${p % 3}|${p}`) === 1);
          if (unique) expect(cover.residual).not.toContain(t.id);
        }
      }),
    );
  });

  it('a flaky test is kept and carries nothing for anyone else', () => {
    const m = build({
      tests: [
        { id: 'a', probes: [1, 2], kills: [1], seconds: 0.1, flaky: true },
        { id: 'b', probes: [1, 2], kills: [1], seconds: 0.2 },
      ],
    });
    const cover = greedyCover(m);
    expect(cover.kept.has('a')).toBe(true);
    expect(cover.kept.has('b')).toBe(true);
    expect(judge(m, 'a', cover.kept).tier).toBe('KEEP');
    expect(judge(m, 'b', new Set(['a'])).tier).toBe('KEEP');
    expect(soleKillers(m).get('m1')).toBe('b');
  });

  it('a test touching a unit outside the kill matrix is at most SUSPECTED', () => {
    const m = build({
      tests: [
        { id: 'a', probes: [1, 4], kills: [], seconds: 0.1 },
        { id: 'b', probes: [1, 4], kills: [], seconds: 0.2 },
      ],
      scopeAll: false,
    });
    m.scope.add('u1'); // probe 1 → u1, probe 4 → u1 as well; u1 in scope
    expect(judge(m, 'b', new Set(['a'])).tier).toBe('CONFIRMED');
    m.scope.clear();
    expect(judge(m, 'b', new Set(['a'])).tier).toBe('SUSPECTED');
  });

  it('a duplicate cluster keeps its fastest member as representative', () => {
    const m = build({
      tests: [
        { id: 'slow', probes: [1, 2, 3], kills: [], seconds: 0.9 },
        { id: 'fast', probes: [3, 2, 1], kills: [], seconds: 0.1 },
        { id: 'other', probes: [1], kills: [], seconds: 0.1 },
      ],
    });
    const cl = clusters(m);
    expect(cl).toHaveLength(1);
    expect(cl[0].representative).toBe('fast');
    expect(cl[0].members).toEqual(['fast', 'slow']);
  });

  it('projection finds a lost probe per member, and lost kills per unchanged unit', () => {
    const m = build({
      tests: [
        { id: 'a', probes: [1, 2], kills: [1], seconds: 0.1 },
        { id: 'b', probes: [1], kills: [], seconds: 0.1 },
      ],
    });
    const base = project(m, ['a', 'b']);
    const head = project(m, ['b']);
    const reg = regressions(base, head);
    expect(reg.length).toBeGreaterThan(0);
    expect(reg.every((r) => r.lostProbes > 0)).toBe(true);
    expect(lostKills(m, new Set(['b']), new Set(['u1']))).toEqual([
      { mutant: 'm1', unit: 'u1', line: 1, killedByOnBase: ['a'] },
    ]);
    expect(lostKills(m, new Set(['a', 'b']), null)).toEqual([]);
  });
});
