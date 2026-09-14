import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { gains } from './gains.mjs';
import { killsOf, ledger, summaryLine } from './ledger.mjs';

/**
 * The merge rule on a hand-built round: mergeable only when something went down and nothing
 * held went down; a lost kill on unchanged code or a red random-order run refuses; anything
 * unmeasured is INCOMPLETE. The gains diagram draws the ledger and nothing else.
 */
const round = {
  repo: 'backend',
  round: 1,
  runId: 'r',
  baseCommit: 'b',
  demoted: ['t1', 't2'],
  notApplied: [],
  tiers: { A: { taken: 2 } },
};
const proposal = { summary: { tests: 100, prTierSeconds: { before: 50 } } };
const okInvariants = {
  i1: { status: 'PASS', checked: { files: 5, classes: 5, methods: 40 }, regressions: [] },
  i2: { status: 'PASS' },
  i4: { status: 'PASS' },
};

function killsFile(d: string, name: string, killed: string[], survived: string[]) {
  const p = join(d, name);
  const mutants: Record<string, unknown> = {};
  for (const id of killed)
    mutants[id] = {
      file: id.startsWith('changed') ? 'src/changed.java' : 'src/a.java',
      status: 'KILLED',
    };
  for (const id of survived) mutants[id] = { file: 'src/a.java', status: 'SURVIVED' };
  writeFileSync(p, JSON.stringify({ mutants }));
  return killsOf(p)!;
}

describe('governance ledger', () => {
  const d = mkdtempSync(join(tmpdir(), 'ledger-'));
  const before = killsFile(d, 'before.json', ['m1', 'm2', 'changed-m3'], ['m4']);

  it('is MERGEABLE when tests and seconds went down and every held measure held', () => {
    const after = killsFile(d, 'after.json', ['m1', 'm2', 'changed-m3'], ['m4']);
    const l = ledger({
      round,
      proposal,
      invariants: okInvariants,
      suiteAfter: { tests: 98, failed: 0 },
      probesAfter: { tests: 98, seconds: 45.5 },
      killsBefore: before,
      killsAfter: after,
      changed: new Set(['src/changed.java']),
      randomOrder: 'pass',
    });
    expect(l.verdict).toBe('MERGEABLE');
    expect(l.gains).toEqual({ tests: 2, seconds: 4.5, secondsPct: -9 });
    expect(l.mutation).toMatchObject({
      scoreBefore: 75,
      scoreAfter: 75,
      checkedUnchanged: 2,
      lost: [],
    });
    expect(summaryLine(l)).toContain(
      'MERGEABLE — 2 tests demoted · tests 100 → 98 · tier 50 s → 45.5 s (-9 %, proposal vs this machine)',
    );
    const g = gains(l);
    expect(g).toContain('```mermaid');
    expect(g).toContain('b0 -- "−2" --> a0');
    expect(g).toContain('Verdict: **MERGEABLE**');
  });

  it('refuses a lost kill on unchanged code, and a red random-order run', () => {
    const lostOne = killsFile(d, 'after-lost.json', ['m1', 'changed-m3'], ['m2', 'm4']);
    const l = ledger({
      round,
      proposal,
      invariants: okInvariants,
      suiteAfter: { tests: 98, failed: 0 },
      probesAfter: { tests: 98, seconds: 45 },
      killsBefore: before,
      killsAfter: lostOne,
      changed: new Set(['src/changed.java']),
      randomOrder: 'pass',
    });
    expect(l.verdict).toBe('NOT-MERGEABLE');
    expect(l.mutation?.lost).toEqual(['m2']);
    expect(summaryLine(l)).toContain('not held: mutationScore');
    const after = killsFile(d, 'after-ok.json', ['m1', 'm2', 'changed-m3'], ['m4']);
    const l2 = ledger({
      ...{ round, proposal, invariants: okInvariants },
      suiteAfter: { tests: 98, failed: 0 },
      probesAfter: { tests: 98, seconds: 45 },
      killsBefore: before,
      killsAfter: after,
      randomOrder: 'fail',
    });
    expect(l2.verdict).toBe('NOT-MERGEABLE');
    expect(l2.kept.randomOrderGreen).toBe(false);
  });

  it('charges a lost kill to the machine when every killer stayed, and takes the before from the same machine', () => {
    // m2 was killed on the base by a test that stays in the tier: losing it on this machine is
    // the machine's doing, listed and not held against the round; m1's killer was demoted
    const p = join(d, 'before-killers.json');
    writeFileSync(
      p,
      JSON.stringify({
        mutants: {
          m1: { file: 'src/a.java', status: 'KILLED', killedBy: ['t1'] },
          m2: { file: 'src/a.java', status: 'KILLED', killedBy: ['kept-1', 'kept-2'] },
          m3: { file: 'src/a.java', status: 'TIMED_OUT', killedBy: ['kept-1'] },
        },
      }),
    );
    const before2 = killsOf(p)!;
    expect([...before2.killed].sort((a, b) => a.localeCompare(b))).toEqual(['m1', 'm2', 'm3']); // a time-out is a detection
    const afterEnv = killsFile(d, 'after-env.json', ['m1', 'm3'], ['m2']);
    const l = ledger({
      round,
      proposal,
      invariants: okInvariants,
      suiteAfter: { tests: 98, failed: 0 },
      probesBefore: { tests: 100, seconds: 52 },
      probesAfter: { tests: 98, seconds: 45 },
      killsBefore: before2,
      killsAfter: afterEnv,
      randomOrder: 'pass',
    });
    expect(l.before).toEqual({ tests: 100, seconds: 52, sameMachine: true });
    expect(l.mutation).toMatchObject({ lost: [], lostByEnvironment: ['m2'] });
    expect(l.verdict).toBe('MERGEABLE');
    expect(summaryLine(l)).toContain('1 mutant(s) lost to the machine, not the round');
    expect(summaryLine(l)).toContain('same machine');
    const afterDem = killsFile(d, 'after-dem.json', ['m2', 'm3'], ['m1']);
    const l2 = ledger({
      round,
      proposal,
      invariants: okInvariants,
      suiteAfter: { tests: 98, failed: 0 },
      probesAfter: { tests: 98, seconds: 45 },
      killsBefore: before2,
      killsAfter: afterDem,
      randomOrder: 'pass',
    });
    expect(l2.mutation).toMatchObject({ lost: ['m1'], lostByEnvironment: [] });
    expect(l2.verdict).toBe('NOT-MERGEABLE');
  });

  it('is INCOMPLETE when anything is unmeasured, and says what', () => {
    const l = ledger({
      round,
      proposal,
      invariants: okInvariants,
      suiteAfter: { tests: 98, failed: 0 },
      probesAfter: { tests: 98, seconds: 45 },
      killsBefore: before,
      killsAfter: null,
      randomOrder: null,
    });
    expect(l.verdict).toBe('INCOMPLETE');
    expect(l.incomplete).toEqual(['kill matrix after', 'random-order run']);
    expect(summaryLine(l)).toBe(
      'Governance round 1: INCOMPLETE — missing: kill matrix after, random-order run',
    );
    expect(gains(l)).toContain('missing: kill matrix after, random-order run');
  });

  it('reads a Stryker report as well as a PIT one', () => {
    const p = join(d, 'mutation.json');
    writeFileSync(
      p,
      JSON.stringify({
        files: {
          'src/a.ts': {
            mutants: [
              { id: '1', status: 'Killed' },
              { id: '2', status: 'Survived' },
            ],
          },
        },
      }),
    );
    const k = killsOf(p)!;
    expect([...k.killed]).toEqual(['src/a.ts#1']);
    expect(k.score).toBe(50);
    expect(k.files.get('src/a.ts#2')).toBe('src/a.ts');
  });
});
