import { diagram } from './diagram.mjs';
import { newMatrix } from './load.mjs';
import { propose, short, toMarkdown } from './propose.mjs';

/**
 * The proposal is a rendering of the core's judgement; these cases pin the parts a reviewer or
 * an agent will rely on: the tier an agent may act on, the numbers the PR body quotes, and the
 * seeded violation the ADR names first — a test that owns a probe nobody else covers is never
 * CONFIRMED, whatever else is true of it.
 */
function build(
  tests: {
    id: string;
    spec: string;
    probes: string[];
    kills?: string[];
    seconds: number;
    flaky?: boolean;
  }[],
  scope: string[],
) {
  const m = newMatrix('test');
  for (const t of tests) {
    m.tests.set(t.id, {
      id: t.id,
      spec: t.spec,
      seconds: t.seconds,
      flaky: !!t.flaky,
      probes: new Set(t.probes),
      kills: new Set(t.kills ?? []),
      covers: new Set(t.kills ?? []),
      units: new Set(t.probes.map((p) => p.split('|')[0])),
    });
    for (const p of t.probes)
      if (!m.probes.has(p))
        m.probes.set(p, { unit: p.split('|')[0], member: 'f', lines: null, branch: false });
    for (const k of t.kills ?? []) {
      if (!m.mutants.has(k))
        m.mutants.set(k, { unit: k.split('#')[0], line: 1, status: 'KILLED', killers: new Set() });
      m.mutants.get(k)!.killers.add(t.id);
    }
  }
  for (const u of scope) m.scope.add(u);
  return m;
}

const matrix = () =>
  build(
    [
      // seconds chosen so greedy cover picks the cheap partial test before its superset —
      // the case the cover's second pass exists for
      {
        id: 'A.spec :: keeps everything',
        spec: 'src/a.spec.ts',
        probes: ['a|1', 'a|2', 'a|3'],
        kills: ['a#1', 'a#2'],
        seconds: 2,
      },
      {
        id: 'A.spec :: restates part of it',
        spec: 'src/a.spec.ts',
        probes: ['a|1', 'a|2'],
        kills: ['a#1'],
        seconds: 0.5,
      },
      {
        id: 'A.spec :: owns a probe',
        spec: 'src/a.spec.ts',
        probes: ['a|1', 'a|9'],
        kills: [],
        seconds: 0.5,
      },
      {
        id: 'B.spec :: touches b which nobody mutates',
        spec: 'src/b.spec.ts',
        probes: ['a|1', 'b|1'],
        kills: ['a#1'],
        seconds: 3,
      },
      {
        id: 'B.spec :: also b',
        spec: 'src/b.spec.ts',
        probes: ['a|1', 'b|1'],
        kills: ['a#1'],
        seconds: 4,
      },
      {
        id: 'C.spec :: loads nothing instrumented',
        spec: 'src/c.spec.ts',
        probes: [],
        seconds: 0.1,
      },
    ],
    ['a'],
  );

describe('propose', () => {
  let report: Awaited<ReturnType<typeof propose>>;
  beforeAll(async () => {
    report = await propose(matrix(), { commit: 'abc' });
  });

  it('names the solver that chose the core, and its certificate', () => {
    expect(report.solver.method).toMatch(/^(mip|reduction)$/);
    expect(report.solver.incumbentCost).toBeLessThanOrEqual(report.solver.greedyCost);
    expect(report.solver.gapPct).toBe(0);
  });

  it('carries the redundancy score per candidate and the suite metrics, both stated', () => {
    const c = report.candidates.find((x) => x.test === 'A.spec :: restates part of it')!;
    expect(c.redundancy).toMatchObject({ covRed: 1, killRed: 1, score: 1, killsNothing: false });
    expect(report.metrics).toMatchObject({ probeLoss: 0, killLoss: 0 });
    expect(report.metrics.tests.after).toBe(report.summary.kept);
    expect(toMarkdown(report)).toContain('| Probes carried |');
  });

  it('confirms only what the kept tests carry inside the kill matrix scope', () => {
    const tiers = Object.fromEntries(report.candidates.map((c) => [c.test, c.tier]));
    expect(tiers['A.spec :: restates part of it']).toBe('CONFIRMED');
    expect(tiers['A.spec :: owns a probe']).toBeUndefined(); // never a candidate: it owns a|9
    expect(
      ['B.spec :: touches b which nobody mutates', 'B.spec :: also b'].filter(
        (t) => tiers[t] === 'SUSPECTED',
      ),
    ).toHaveLength(1);
    expect(
      report.candidates.every((c) => c.tier !== 'CONFIRMED' || c.why.probes.unique === 0),
    ).toBe(true);
  });

  it('never confirms a test the instrument cannot see', () => {
    const c = report.candidates.find((x) => x.test === 'C.spec :: loads nothing instrumented');
    expect(c?.tier ?? 'KEEP').toBe('KEEP');
    expect(c?.reason ?? 'unobserved').toBe('unobserved');
    expect(report.summary.unobserved).toBe(1);
    expect(report.summary.kept).toBe(report.summary.tests - report.summary.confirmed);
  });

  it('gives every subgraph in the diagram its own id, a readable label, and reads left to right', () => {
    const d = diagram(report);
    expect(d).toMatch(/subgraph n\d+\["a"\]\n {4}direction LR/);
    expect(d).not.toMatch(/subgraph spec/);
    // a label never exceeds 48 characters and a `#` inside one is an entity, not a comment
    for (const m of d.matchAll(/\["([^"]*)"\]/g)) expect(m[1].length).toBeLessThanOrEqual(48);
    expect(d).not.toMatch(/\["[^"]*#(?!35;|quot;|lt;|gt;)/);
  });

  it('keeps every probe and kill after the confirmed demotions', () => {
    expect(report.summary.probes.carriedAfter).toBe(report.summary.probes.total);
    expect(report.summary.kills.carriedAfter).toBe(report.summary.kills.total);
    expect(report.summary.kept + report.summary.confirmed).toBe(report.summary.tests);
    expect(report.summary.prTierSeconds.after).toBeLessThan(report.summary.prTierSeconds.before);
  });

  it('names the carriers of a confirmed candidate', () => {
    const c = report.candidates.find((x) => x.test === 'A.spec :: restates part of it')!;
    expect(c.subsumedBy).toEqual(['A.spec :: keeps everything']);
  });

  it('renders numbers the PR body will quote, and a diagram with the demoted test dashed', () => {
    const md = toMarkdown(report);
    expect(md).toContain(`${report.summary.confirmed} of ${report.summary.tests} tests may leave`);
    const d = diagram(report);
    expect(d).toContain('```mermaid');
    expect(d).toContain(':::demoted');
    expect(d).toContain('probes · ');
    expect(diagram({ ...report, candidates: [] })).toContain('No test leaves');
  });

  it('shortens both identities for tables without using the short form as a key', () => {
    expect(
      short(
        '[engine:junit-jupiter]/[class:com.x.FooTest]/[nested-class:Inner]/[method:bar()]/[test-template-invocation:#2]',
      ),
    ).toBe('FooTest$Inner#bar()[2]');
    expect(short('src/app/x/y.spec.ts :: Y does z')).toBe('y.spec.ts :: Y does z');
  });
});
