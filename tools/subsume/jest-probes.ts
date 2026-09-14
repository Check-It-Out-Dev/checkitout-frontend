/**
 * Per-test coverage probes — instance one of "AI in the loop, invariants in charge"
 * (docs/testing/ai-in-the-loop.md).
 *
 * Registered from setup-jest.ts, so it runs in every spec file, and does nothing unless
 * SUBSUME_PROBES=1 is set (CI sets it next to `--coverage`; a plain `npm test` stays silent).
 * Under `jest --coverage`, babel-plugin-istanbul keeps cumulative counters in the environment's
 * `__coverage__`, and Jest gives every spec file a fresh environment. Diffing the counters around
 * each test (tools/subsume/probe-diff.ts) yields what THAT test exercised. Three kinds of record
 * go to reports/subsume/probes.<pid>.jsonl (each worker writes its own file;
 * tools/subsume/merge-probes.mjs joins them):
 *
 *   { test: "<spec> :: (module load)", spec, hits }   counters that moved while the file loaded
 *   { test: "<spec> :: <full test name>", spec, hits }  one per test, hits may be {}
 *   { final: true, spec, totals }                       per file: how many counters ended > 0
 *
 * The `final` record is the check on the instrument: for every spec, the union of its per-test
 * hits must equal its final totals (tools/subsume/check-probes.mjs). Both live in the runtime's
 * coordinate system (transpiled statement ids); istanbul's own reports are source-mapped back to
 * TypeScript and cannot be compared count for count, which is why each instrumented file's maps
 * — including `inputSourceMap` — are written once per worker to maps.<pid>.jsonl for the
 * projection to source lines later.
 *
 * Under Stryker (`__stryker__`), which instruments for mutants rather than coverage, the hook
 * stays off regardless of the flag.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { diff, snapshot, type Counters, type Hits, type Snapshot } from './probe-diff';

/** Paths in the artefact are repository-relative with forward slashes, so a matrix cached from a
 *  runner compares with one produced on a developer's machine. */
function rel(p: string | undefined): string {
  return relative(process.cwd(), p ?? '')
    .split('\\')
    .join('/');
}
function relHits(hits: Hits): Hits {
  return Object.fromEntries(Object.entries(hits).map(([file, h]) => [rel(file), h]));
}

type FileCoverage = Counters & {
  statementMap: unknown;
  fnMap: unknown;
  branchMap: unknown;
  inputSourceMap?: unknown;
};
const g = globalThis as unknown as {
  __coverage__?: Record<string, FileCoverage>;
  __stryker__?: unknown;
  __stryker2__?: unknown;
};

const dir = process.env['SUBSUME_DIR'] ?? join(process.cwd(), 'reports', 'subsume');
const probesFile = join(dir, `probes.${process.pid}.jsonl`);
const mapsFile = join(dir, `maps.${process.pid}.jsonl`);
const mapped = new Set<string>();
let prev: Snapshot = {};

function active(): boolean {
  return process.env['SUBSUME_PROBES'] === '1' && !g.__stryker__ && !g.__stryker2__;
}

function write(record: object): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(probesFile, JSON.stringify(record) + '\n');
}

let startedAt = 0;

function emit(test: string, hits: Hits, seconds: number | null): void {
  write({ test, spec: rel(expect.getState().testPath), seconds, hits: relHits(hits) });
  for (const file of Object.keys(hits)) {
    if (mapped.has(file)) continue;
    mapped.add(file);
    const fc = g.__coverage__?.[file];
    if (!fc) continue;
    appendFileSync(
      mapsFile,
      JSON.stringify({
        file: rel(file),
        statementMap: fc.statementMap,
        fnMap: fc.fnMap,
        branchMap: fc.branchMap,
        inputSourceMap: fc.inputSourceMap ?? null,
      }) + '\n',
    );
  }
}

beforeAll(() => {
  if (!active()) return;
  const cur = snapshot(g.__coverage__);
  emit(`${rel(expect.getState().testPath)} :: (module load)`, diff({}, cur), null);
  prev = cur;
});

beforeEach(() => {
  startedAt = performance.now();
});

afterEach(() => {
  if (!active()) return;
  const seconds = Math.round(performance.now() - startedAt) / 1000;
  const cur = snapshot(g.__coverage__);
  const state = expect.getState();
  emit(`${rel(state.testPath)} :: ${state.currentTestName}`, diff(prev, cur), seconds);
  prev = cur;
});

afterAll(() => {
  if (!active()) return;
  const totals: Record<string, { s: number; f: number; b: number }> = {};
  for (const [file, c] of Object.entries(snapshot(g.__coverage__))) {
    totals[rel(file)] = {
      s: Object.values(c.s).filter((n) => n > 0).length,
      f: Object.values(c.f).filter((n) => n > 0).length,
      b: Object.values(c.b).reduce((acc, paths) => acc + paths.filter((n) => n > 0).length, 0),
    };
  }
  write({ final: true, spec: rel(expect.getState().testPath), totals });
});
