import { CLOSING, HEADER, mermaidBlock, prBody, shortName } from './pr-body.mjs';

/**
 * The body quotes the round's files and types nothing: with no ledger it says so instead of
 * guessing a number; the look-twice list is capped and says how many more; the title carries
 * the seconds only when they were measured.
 */
const junit =
  '[engine:junit-jupiter]/[class:com.sm.x.unit.FooUnitTest]/[nested-class:Bar]/[method:shouldDo()]';
const round = {
  repo: 'backend',
  round: 1,
  runId: 'local-1',
  baseCommit: 'abc',
  proposalCommit: 'def',
  demoted: [junit, junit + 'x'],
  notApplied: [{ test: junit, reason: 'parameterized' }],
  tiers: { A: { available: 3, taken: 2 }, B: { available: 1, taken: 0 } },
  provisional: false,
};
const pack = {
  classesTouched: 1,
  budget: { classCap: 0.5 },
  gates: { determinism: 'measured' },
  lookTwice: Array.from({ length: 45 }, (_, i) => ({ test: `src/app/a.spec.ts :: A edge ${i}` })),
  forecast: { A: { tests: 1 }, B: { tests: 1 }, roundsToSaturationAtThisBudget: 1 },
  saturated: false,
};

describe('pr-body', () => {
  it('names the speaker, quotes the round, and says what is not measured', () => {
    const { title, body } = prBody({ round, pack });
    expect(title).toBe('[test-governance] round 1 — 2 tests demoted');
    expect(body.startsWith(HEADER + '\n')).toBe(true);
    expect(body.endsWith(CLOSING + '\n')).toBe(true);
    expect(body).toContain('run `local-1`, base `abc`, proposal `def`');
    expect(body).toContain('A 2 of 3 · B 0 of 1');
    expect(body).toContain('Not measured on the box');
    expect(body).toContain('## Look twice (45) — not applied');
    expect(body).toContain('… and 5 more in `pack.json`');
    expect(body).toContain('- 1 × `parameterized`');
  });

  it('carries the ledger line and the seconds into the title when they were measured', () => {
    const ledger = {
      verdict: 'MERGEABLE',
      round: 1,
      demoted: 2,
      before: { tests: 100, seconds: 50 },
      after: { tests: 98, seconds: 45 },
      gains: { tests: 2, seconds: 5, secondsPct: -10 },
      kept: {
        coverageUnchangedCode: true,
        killsUnchangedCode: true,
        mutationScore: true,
        suiteGreen: true,
        randomOrderGreen: true,
        publishedNumbers: true,
      },
      mutation: { scoreBefore: 40, scoreAfter: 40 },
    };
    const gains = '```mermaid\nflowchart LR\n  a --> b\n```\n\nVerdict: **MERGEABLE**.\n';
    const diagram = 'intro\n\n```mermaid\nflowchart LR\n  d --> c\n```\n\n| table |\n';
    const { title, body } = prBody({ round, pack, ledger, gains, diagram, artefacts: 'run 7' });
    expect(title).toBe('[test-governance] round 1 — 2 tests demoted, 50 s → 45 s');
    expect(body).toContain('**Governance round 1: MERGEABLE');
    expect(body).toContain('Verdict: **MERGEABLE**.');
    expect(body).toContain(
      '## What leaves, and who carries it\n\n```mermaid\nflowchart LR\n  d --> c\n```',
    );
    expect(body).toContain('(run 7)');
    expect(body).not.toContain('| table |');
  });

  it('shortens ids the way a person reads them', () => {
    expect(shortName(junit)).toBe('FooUnitTest$Bar#shouldDo()');
    expect(
      shortName(
        junit.replace(
          '[method:shouldDo()]',
          '[test-template:p(int)]/[test-template-invocation:#2]',
        ),
      ),
    ).toBe('FooUnitTest$Bar#p()[#2]');
    expect(shortName('src/app/core/a.spec.ts :: A does b')).toBe('a.spec.ts :: A does b');
    expect(mermaidBlock('no fence')).toBeNull();
  });
});
