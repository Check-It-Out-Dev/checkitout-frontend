#!/usr/bin/env node
/**
 * The invariants gate — the replay plane. No model, no secret: it reads the artefacts a base run
 * left behind (the nightly's cache) and the artefacts the pull request's own run produced, and
 * says whether the four things the story promises still hold (tools/subsume/README.md,
 * "invariant-report.json"):
 *
 *   I1  coverage never lower on any file, class or method the pull request did not touch: every
 *       probe a base test covered there is covered by a head test
 *   I2  no mutant killed on base whose code is unchanged is left unkilled by the tests still in
 *       the tier (the kill matrix is the base's — mutation runs at night, not on the pull request)
 *   I3  the suite is green
 *   I4  the published numbers are consistent — the repository's own check, its result passed in
 *
 * A missing artefact is INCOMPLETE, never PASS: silence is not success. The report carries no
 * timestamp and every list is sorted, so two runs on the same inputs are byte-identical.
 *
 *   node tools/subsume/invariant.mjs --repo frontend|backend --base <dir> --head <dir>
 *        --changed <file with one repo-relative path per line> --suite <jest-results.json | surefire-reports dir>
 *        --i4 pass|fail [--flaky flaky.json] [--base-commit sha] [--head-commit sha] [--out reports/subsume]
 *
 * Exit codes: 0 PASS, 1 FAIL, 2 INCOMPLETE.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { lostKills } from './kills.mjs';
import { loadJava, loadJest, markFlaky, realTests } from './load.mjs';
import { project } from './project.mjs';

const NAMES = {
  frontend: { probes: 'probes.jsonl', maps: 'maps.json', kills: 'mutation.json' },
  backend: { probes: 'probes.jsonl', maps: 'classes.json', kills: 'kills.json' },
};

/**
 * One side's artefacts: the matrix plus the two lookups the gate needs and the matrix does not
 * keep — which source file a unit and a mutant belong to. `kills: false` for the head side.
 */
export function loadArtefacts(repo, dir, { kills = true, flaky = null } = {}) {
  const names = NAMES[repo];
  const paths = { probes: join(dir, names.probes), maps: join(dir, names.maps) };
  if (kills) paths.kills = join(dir, names.kills);
  const missing = Object.entries(paths)
    .filter(([, p]) => !existsSync(p))
    .map(([k]) => `${dir}/${names[k]}`);
  if (missing.length) return { matrix: null, missing, unitFile: null, mutantFile: null };
  let matrix;
  let unitFile;
  let mutantFile;
  if (repo === 'backend') {
    matrix = loadJava({ probes: paths.probes, classes: paths.maps, kills: paths.kills ?? null });
    const classes = JSON.parse(readFileSync(paths.maps, 'utf8'));
    unitFile = (unit) => classes[unit]?.file ?? javaFile(unit);
    const kills = paths.kills ? JSON.parse(readFileSync(paths.kills, 'utf8')).mutants : {};
    mutantFile = (id) => kills[id]?.file ?? unitFile(matrix.mutants.get(id)?.unit ?? '');
  } else {
    matrix = loadJest({ probes: paths.probes, maps: paths.maps, mutation: paths.kills ?? null });
    unitFile = (unit) => unit;
    mutantFile = (id) => matrix.mutants.get(id)?.unit ?? id.split('#')[0];
  }
  if (flaky) markFlaky(matrix, JSON.parse(readFileSync(flaky, 'utf8')).tests ?? []);
  return { matrix, missing: [], unitFile, mutantFile };
}

/** `com.x.Outer$Inner` → `src/main/java/com/x/Outer.java`, the fallback when classes.json is silent. */
export function javaFile(fqcn) {
  const parts = fqcn.split('.');
  const outer = parts.pop().split('$')[0];
  return `src/main/java/${parts.join('/')}/${outer}.java`;
}

/**
 * Probes that differ between two armed runs of the same base: time- and network-dependent paths
 * (cron jobs firing during the run, a startup validator reaching a server) flip between runs no
 * matter what the tier contains. They are named, counted, and left out of I1 — a regression on
 * them would be drift, not a lost test.
 */
export function unstableProbes(matrixA, matrixB) {
  const union = (m) => {
    const s = new Set();
    for (const t of realTests(m)) for (const p of t.probes) s.add(p);
    return s;
  };
  const a = union(matrixA);
  const b = union(matrixB);
  const out = new Set();
  for (const p of a) if (!b.has(p)) out.add(p);
  for (const p of b) if (!a.has(p)) out.add(p);
  return out;
}

/**
 * The judgement. `base` and `head` are what loadArtefacts returned (head without kills);
 * `changed` is the set of repo-relative paths the pull request touched; `suite` is
 * `{ tests, failed }` or null; `i4` is 'pass', 'fail' or null; `unstable` the probes a second
 * base run showed to flip on their own.
 * @param {{ repo: string, base: any, head: any, changed: Set<string>, suite: { tests: number, failed: number } | null,
 *   i4: string | null, baseCommit?: string | null, headCommit?: string | null, unstable?: Set<string> }} input
 */
export function checkInvariants({
  repo,
  base,
  head,
  changed,
  suite,
  i4,
  baseCommit = null,
  headCommit = null,
  unstable = new Set(),
}) {
  const incomplete = [...(base?.missing ?? []), ...(head?.missing ?? [])];
  if (!suite) incomplete.push('suite result');
  if (i4 !== 'pass' && i4 !== 'fail') incomplete.push('published-numbers check');
  /** @type {{ schema: number, repo: string, base: { commit: string | null }, head: { commit: string | null }, verdict: string, i1: any, i2: any, i3: any, i4: any, demoted: { count: number, tests: string[] }, incomplete: string[] }} */
  const report = {
    schema: 1,
    repo,
    base: { commit: baseCommit ?? null },
    head: { commit: headCommit ?? null },
    verdict: 'INCOMPLETE',
    i1: null,
    i2: null,
    i3: null,
    i4: null,
    demoted: { count: 0, tests: [] },
    incomplete: incomplete.sort(),
  };
  if (!base?.matrix || !head?.matrix) return report;

  const baseTests = realTests(base.matrix).map((t) => t.id);
  const headTests = realTests(head.matrix).map((t) => t.id);
  const headSet = new Set(headTests);

  // I1 — per unchanged unit and member, every base probe is still covered.
  // A class in which any probe flipped between the two base runs is judged by nothing: drift
  // clusters in time-dependent classes (a scheduled cleanup, a cron, a database-file check), and
  // two runs see only the flips that happened to occur — the first backend round on a runner
  // lost one probe of InMemoryStorageRateLimitService.scheduledCleanup that neither base run
  // had flipped. The classes are named in the report so nobody mistakes silence for a pass.
  const unstableUnits = new Set();
  for (const p of unstable) unstableUnits.add(base.matrix.probes.get(p)?.unit ?? p.split('|')[0]);
  const pb = project(base.matrix, baseTests);
  const ph = project(head.matrix, headTests);
  const files = new Set();
  let classes = 0;
  let methods = 0;
  const regressions = [];
  for (const [unit, b] of pb) {
    const file = base.unitFile(unit);
    if (changed.has(file)) continue;
    if (unstableUnits.has(unit)) continue;
    files.add(file);
    classes += 1;
    const h = ph.get(unit);
    for (const [member, bm] of b.members) {
      methods += 1;
      const hm = h?.members.get(member);
      const lost = [...bm.probes].filter((p) => !hm?.probes.has(p) && !unstable.has(p));
      if (lost.length === 0) continue;
      regressions.push({
        file,
        unit,
        method: member,
        lostProbes: lost.length,
        lines: { base: bm.lines.size, head: hm?.lines.size ?? 0 },
        branches: { base: bm.branches.size, head: hm?.branches.size ?? 0 },
      });
    }
  }
  regressions.sort((a, b) => a.unit.localeCompare(b.unit) || a.method.localeCompare(b.method));
  report.i1 = {
    status: regressions.length ? 'FAIL' : 'PASS',
    unchangedFiles: files.size,
    checked: { files: files.size, classes, methods },
    unstable: { probes: unstable.size, units: [...unstableUnits].sort() },
    regressions,
  };

  // I2 — base kills on unchanged code, against the tests still in the tier
  const unchangedUnits = new Set();
  let mutantsChecked = 0;
  let skippedChangedCode = 0;
  for (const [id, mu] of base.matrix.mutants) {
    if (mu.status !== 'KILLED' && mu.status !== 'Killed') continue;
    if (changed.has(base.mutantFile(id))) skippedChangedCode += 1;
    else {
      mutantsChecked += 1;
      unchangedUnits.add(mu.unit);
    }
  }
  // PIT names a class-level failure under a mutant by the container (a nested class with no
  // [method:…] segment), which the listener never records as a test; such a kill is kept while
  // any test of that class remains in the tier.
  const isContainer = (k) => !/\[(method|test-template):/.test(k);
  const headIds = [...headSet];
  const containerKept = (k) => headIds.some((id) => id.startsWith(k + '/'));
  let containerKills = 0;
  const lost = lostKills(base.matrix, headSet, unchangedUnits)
    .filter((l) => {
      const byContainer = l.killedByOnBase.some((k) => isContainer(k) && containerKept(k));
      if (byContainer) containerKills += 1;
      return !byContainer;
    })
    .map((l) => ({
      ...l,
      reason: l.killedByOnBase.some((k) => headSet.has(k)) ? 'killer flaky' : 'test demoted',
    }))
    .sort((a, b) => a.mutant.localeCompare(b.mutant));
  report.i2 = {
    status: lost.length ? 'FAIL' : 'PASS',
    mutantsChecked,
    skippedChangedCode,
    containerKillsKept: containerKills,
    lost,
  };

  // I3, I4 — results handed in
  if (suite)
    report.i3 = {
      status: suite.failed === 0 && suite.tests > 0 ? 'PASS' : 'FAIL',
      suite: repo === 'backend' ? 'junit' : 'jest',
      tests: suite.tests,
      failed: suite.failed,
    };
  if (i4 === 'pass' || i4 === 'fail')
    report.i4 = { status: i4 === 'pass' ? 'PASS' : 'FAIL', tool: 'check-published-numbers' };

  const demoted = baseTests.filter((id) => !headSet.has(id)).sort();
  report.demoted = { count: demoted.length, tests: demoted };

  const statuses = [report.i1, report.i2, report.i3, report.i4].map((x) => x?.status);
  report.verdict = incomplete.length ? 'INCOMPLETE' : statuses.includes('FAIL') ? 'FAIL' : 'PASS';
  return report;
}

const n = (x) => (x ?? 0).toLocaleString('en-US');

/** The one line of the step summary, the same fields in the same order on every run. */
export function summaryLine(r) {
  if (r.verdict === 'INCOMPLETE' && !r.i1)
    return `Invariants: INCOMPLETE — missing: ${r.incomplete.join(', ')}`;
  const c = r.i1.checked;
  const drift = r.i1.unstable?.probes
    ? ` (${n(r.i1.unstable.probes)} drifting probes in ${n(r.i1.unstable.units.length)} classes set aside)`
    : '';
  const coverage = r.i1.regressions.length
    ? `coverage LOWER on ${n(r.i1.regressions.length)} of ${n(c.methods)} methods${drift}`
    : `coverage unchanged on ${n(c.files)} files, ${n(c.classes)} classes, ${n(c.methods)} methods${drift}`;
  const suite = r.i3
    ? r.i3.failed === 0
      ? `suite green (${n(r.i3.tests)} tests)`
      : `suite RED (${n(r.i3.failed)} of ${n(r.i3.tests)} failed)`
    : 'suite result missing';
  const numbers = r.i4
    ? r.i4.status === 'PASS'
      ? 'published numbers consistent'
      : 'published numbers STALE'
    : 'published numbers unchecked';
  return `Invariants: ${r.verdict} — ${n(r.demoted.count)} tests demoted · ${coverage} · ${n(r.i2.mutantsChecked)} mutants checked, ${n(r.i2.lost.length)} lost · ${suite} · ${numbers}`;
}

/** `{ tests, failed }` from jest-results.json or a surefire-reports directory. */
export function readSuite(path) {
  if (!path || !existsSync(path)) return null;
  if (path.endsWith('.json')) {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return { tests: j.numTotalTests ?? 0, failed: j.numFailedTests ?? 0 };
  }
  let tests = 0;
  let failed = 0;
  for (const f of readdirSync(path)) {
    if (!/^TEST-.*\.xml$/.test(f)) continue;
    const head = readFileSync(join(path, f), 'utf8').slice(0, 2000);
    const attr = (name) => Number((head.match(new RegExp(`${name}="(\\d+)"`)) ?? [])[1] ?? 0);
    tests += attr('tests');
    failed += attr('failures') + attr('errors');
  }
  return { tests, failed };
}

const isMain =
  Boolean(process.argv[1]) && /invariant\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const repo = arg('repo', 'frontend');
  const out = arg('out', 'reports/subsume');
  const changedFile = arg('changed');
  const changed = new Set(
    changedFile && existsSync(changedFile)
      ? readFileSync(changedFile, 'utf8')
          .split('\n')
          .map((l) => l.trim().replace(/\\/g, '/'))
          .filter(Boolean)
      : [],
  );
  const base = loadArtefacts(repo, arg('base', 'reports/subsume/base'), { flaky: arg('flaky') });
  const head = loadArtefacts(repo, arg('head', 'reports/subsume'), { kills: false });
  // a second armed run of the base names the probes that flip on their own
  const base2Dir = arg('base2');
  const base2 = base2Dir ? loadArtefacts(repo, base2Dir, { kills: false }) : null;
  const unstable =
    base?.matrix && base2?.matrix ? unstableProbes(base.matrix, base2.matrix) : new Set();
  const report = checkInvariants({
    repo,
    base,
    head,
    changed,
    suite: readSuite(arg('suite')),
    i4: arg('i4', null),
    baseCommit: arg('base-commit', null),
    headCommit: arg('head-commit', null),
    unstable,
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'invariant-report.json'), JSON.stringify(report, null, 1));
  const line = summaryLine(report);
  process.stdout.write(line + '\n'); // the one-line result of the tool, on stdout for the caller to read
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n', { flag: 'a' });
  process.exit(report.verdict === 'PASS' ? 0 : report.verdict === 'FAIL' ? 1 : 2);
}
