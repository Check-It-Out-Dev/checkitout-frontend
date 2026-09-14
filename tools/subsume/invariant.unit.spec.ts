import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkInvariants,
  javaFile,
  loadArtefacts,
  readSuite,
  summaryLine,
  unstableProbes,
} from './invariant.mjs';

/**
 * The gate is believed only after the seeded violations are red (tools/subsume/README.md):
 * a lost probe on unchanged code (1), a lost kill (2), a permuted input yielding the same bytes
 * (4); and a missing artefact is INCOMPLETE, never PASS.
 */
const T1 = 'src/a.spec.ts :: t1 covers all of a';
const T2 = 'src/a.spec.ts :: t2 covers part of a';

function side(
  d: string,
  name: string,
  tests: { id: string; s: number[] }[],
  opts: { kills?: boolean; killedBy?: string[] } = {},
) {
  const dir = join(d, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'probes.jsonl'),
    tests
      .map((t) =>
        JSON.stringify({
          test: t.id,
          spec: 'src/a.spec.ts',
          seconds: 0.1,
          hits: { 'src/a.ts': { s: t.s, f: [0], b: [] } },
        }),
      )
      .join('\n') + '\n',
  );
  writeFileSync(
    join(dir, 'maps.json'),
    JSON.stringify({
      'src/a.ts': {
        statementMap: {
          0: { start: { line: 1 } },
          1: { start: { line: 2 } },
          2: { start: { line: 3 } },
        },
        fnMap: { 0: { loc: { start: { line: 1 }, end: { line: 3 } } } },
        branchMap: {},
      },
    }),
  );
  if (opts.kills !== false)
    writeFileSync(
      join(dir, 'mutation.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        config: { disableBail: true },
        files: {
          'src/a.ts': {
            mutants: [
              {
                id: '1',
                status: 'Killed',
                killedBy: opts.killedBy ?? ['0'],
                location: { start: { line: 2 } },
              },
            ],
          },
        },
        testFiles: {
          'src/a.spec.ts': {
            tests: [
              { id: '0', name: 't1 covers all of a' },
              { id: '1', name: 't2 covers part of a' },
            ],
          },
        },
      }),
    );
  return dir;
}

const full = [
  { id: T1, s: [0, 1, 2] },
  { id: T2, s: [0, 1] },
];

function run(
  d: string,
  headTests: { id: string; s: number[] }[],
  extra: Record<string, unknown> = {},
) {
  const base = loadArtefacts('frontend', join(d, 'base'));
  const head = loadArtefacts('frontend', join(d, 'head'), { kills: false });
  return checkInvariants({
    repo: 'frontend',
    base,
    head,
    changed: new Set<string>(),
    suite: { tests: headTests.length, failed: 0 },
    i4: 'pass',
    baseCommit: 'b',
    headCommit: 'h',
    ...extra,
  });
}

describe('invariants gate', () => {
  it('passes when the demoted test is carried, and says so in one line', () => {
    const d = mkdtempSync(join(tmpdir(), 'inv-'));
    side(d, 'base', full);
    side(d, 'head', [{ id: T1, s: [0, 1, 2] }], { kills: false });
    const r = run(d, [{ id: T1, s: [0, 1, 2] }]);
    expect(r.verdict).toBe('PASS');
    expect(r.demoted).toEqual({ count: 1, tests: [T2] });
    expect(r.i1?.checked).toEqual({ files: 1, classes: 1, methods: 1 });
    expect(r.i2).toMatchObject({ status: 'PASS', mutantsChecked: 1, skippedChangedCode: 0 });
    expect(summaryLine(r)).toBe(
      'Invariants: PASS — 1 tests demoted · coverage unchanged on 1 files, 1 classes, 1 methods · 1 mutants checked, 0 lost · suite green (1 tests) · published numbers consistent',
    );
  });

  it('breakage 1: a probe lost on unchanged code is an I1 regression on that method', () => {
    const d = mkdtempSync(join(tmpdir(), 'inv-'));
    side(d, 'base', full);
    side(d, 'head', [{ id: T1, s: [0, 1] }], { kills: false });
    const r = run(d, [{ id: T1, s: [0, 1] }]);
    expect(r.verdict).toBe('FAIL');
    expect(r.i1?.regressions).toEqual([
      {
        file: 'src/a.ts',
        unit: 'src/a.ts',
        method: 'fn:0',
        lostProbes: 1,
        lines: { base: 0, head: 0 },
        branches: { base: 0, head: 0 },
      },
    ]);
    expect(summaryLine(r)).toContain('coverage LOWER on 1 of 1 methods');
  });

  it('breakage 2: a mutant only the demoted test killed is an I2 loss', () => {
    const d = mkdtempSync(join(tmpdir(), 'inv-'));
    side(d, 'base', full, { killedBy: ['1'] });
    side(d, 'head', [{ id: T1, s: [0, 1, 2] }], { kills: false });
    const r = run(d, [{ id: T1, s: [0, 1, 2] }]);
    expect(r.verdict).toBe('FAIL');
    expect(r.i2?.lost).toEqual([
      {
        mutant: 'src/a.ts#1',
        unit: 'src/a.ts',
        line: 2,
        killedByOnBase: [T2],
        reason: 'test demoted',
      },
    ]);
  });

  it('sets aside probes that flip between two runs of the same base, and says so', () => {
    const d = mkdtempSync(join(tmpdir(), 'inv-'));
    side(d, 'base', full);
    side(d, 'base2', [
      { id: T1, s: [0, 1] }, // probe 2 flipped off on its own in the second base run
      { id: T2, s: [0, 1] },
    ]);
    side(d, 'head', [{ id: T1, s: [0, 1] }], { kills: false });
    const base = loadArtefacts('frontend', join(d, 'base'));
    const base2 = loadArtefacts('frontend', join(d, 'base2'), { kills: false });
    const unstable = unstableProbes(base.matrix, base2.matrix);
    expect([...unstable]).toEqual(['src/a.ts|s|2']);
    const r = checkInvariants({
      repo: 'frontend',
      base,
      head: loadArtefacts('frontend', join(d, 'head'), { kills: false }),
      changed: new Set<string>(),
      suite: { tests: 1, failed: 0 },
      i4: 'pass',
      unstable,
    });
    expect(r.verdict).toBe('PASS');
    expect(r.i1?.unstable).toEqual({ probes: 1, witnessed: 0, units: ['src/a.ts'] });
    expect(summaryLine(r)).toContain('(1 drifting probes in 1 classes set aside)');
  });

  it('changed code is judged by the coverage floors, not by I1/I2', () => {
    const d = mkdtempSync(join(tmpdir(), 'inv-'));
    side(d, 'base', full, { killedBy: ['1'] });
    side(d, 'head', [{ id: T1, s: [0] }], { kills: false });
    const r = run(d, [{ id: T1, s: [0] }], { changed: new Set(['src/a.ts']) });
    expect(r.verdict).toBe('PASS');
    expect(r.i1?.checked.files).toBe(0);
    expect(r.i2).toMatchObject({ mutantsChecked: 0, skippedChangedCode: 1 });
  });

  it('breakage 4: a permuted probes.jsonl yields the same bytes', () => {
    const d1 = mkdtempSync(join(tmpdir(), 'inv-'));
    const d2 = mkdtempSync(join(tmpdir(), 'inv-'));
    side(d1, 'base', full);
    side(d2, 'base', [...full].reverse());
    side(d1, 'head', [{ id: T1, s: [2, 1, 0] }], { kills: false });
    side(d2, 'head', [{ id: T1, s: [0, 1, 2] }], { kills: false });
    const a = run(d1, [{ id: T1, s: [] }]);
    const b = run(d2, [{ id: T1, s: [] }]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a missing artefact is INCOMPLETE, never PASS', () => {
    const d = mkdtempSync(join(tmpdir(), 'inv-'));
    side(d, 'base', full, { kills: false });
    side(d, 'head', [{ id: T1, s: [0, 1, 2] }], { kills: false });
    const r = run(d, [{ id: T1, s: [0, 1, 2] }]);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.incomplete).toEqual([join(d, 'base') + '/mutation.json']);
    expect(summaryLine(r)).toMatch(/^Invariants: INCOMPLETE — missing: /);
    const r2 = run(d, [{ id: T1, s: [0, 1, 2] }], { suite: null, i4: null });
    expect(r2.incomplete).toContain('suite result');
    expect(r2.incomplete).toContain('published-numbers check');
  });

  it('reads a suite result from jest-results.json and from surefire XML, and names Java files', () => {
    const d = mkdtempSync(join(tmpdir(), 'inv-'));
    writeFileSync(
      join(d, 'jest-results.json'),
      JSON.stringify({ numTotalTests: 12, numFailedTests: 1 }),
    );
    expect(readSuite(join(d, 'jest-results.json'))).toEqual({ tests: 12, failed: 1 });
    const sf = join(d, 'surefire-reports');
    mkdirSync(sf);
    writeFileSync(
      join(sf, 'TEST-a.xml'),
      '<testsuite name="a" tests="3" errors="1" failures="0" skipped="0">',
    );
    writeFileSync(
      join(sf, 'TEST-b.xml'),
      '<testsuite name="b" tests="4" errors="0" failures="0" skipped="1">',
    );
    expect(readSuite(sf)).toEqual({ tests: 7, failed: 1 });
    expect(readSuite(join(d, 'nowhere'))).toBeNull();
    expect(javaFile('com.x.Outer$Inner')).toBe('src/main/java/com/x/Outer.java');
  });
});
