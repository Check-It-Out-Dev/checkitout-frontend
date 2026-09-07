#!/usr/bin/env node
/**
 * Ask every runner how many tests it has, and write the answers down.
 *
 * The numbers in the README, on the site and in the sister repositories were
 * wrong twice, in opposite directions and for the same reason: they were typed
 * once and then had no relationship to the repository. The site claimed 216
 * generated models against a directory holding 181, and claimed 949 Jest tests
 * against a suite that had grown to 1,141. Nothing could have caught either —
 * `check:i18n-parity` proves the two locales agree with each other, not that
 * either agrees with the code.
 *
 * So the counts get a single home. This script MEASURES them, slowly and
 * honestly, by asking the runners: `jest --listTests` plus a real count of the
 * cases, and `playwright test --list` per project, which is the only counter
 * that includes skipped and `fixme` tests — a skipped test is still a test
 * somebody has to explain. It writes `docs/testing/measured-counts.json`.
 *
 * `check-published-numbers.mjs` then compares every published figure against
 * that file on every commit, in milliseconds. The slow measurement runs when
 * you ask for it (`npm run measure:counts`) and in CI; the fast check runs
 * always. Drift is caught at whichever end moves first.
 *
 * Playwright's device projects re-run the same specs on a second engine, so
 * summing all six projects would count most tests twice. The distinct total is
 * the one-engine set: `bdd` + `chromium-desktop` + `perf`.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO_ROOT, 'docs', 'testing', 'measured-counts.json');

/**
 * The runners are invoked as JS entry points under this Node, never through
 * `npx`: Node refuses to `spawn` a `.cmd` without a shell, and going through a
 * shell to reach a shim that reaches a script is three chances to lose an exit
 * code. These paths are what the shims call anyway.
 */
const BIN = {
  jest: join(REPO_ROOT, 'node_modules', 'jest', 'bin', 'jest.js'),
  playwright: join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js'),
  bddgen: join(REPO_ROOT, 'node_modules', 'playwright-bdd', 'dist', 'cli', 'index.js'),
};

/** Run one of them and hand back BOTH streams — the summary is not always on stdout. */
function run(bin, args, env = {}) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) throw r.error;
  return String(r.stdout ?? '') + String(r.stderr ?? '');
}

/** `Total: N tests in M files` — Playwright's own tally, skipped included. */
function playwright(project, filter) {
  const args = ['test', '--list', `--project=${project}`];
  if (filter) args.push(filter);
  const out = run(BIN.playwright, args, { PERF_TIER: '1' });
  const m = out.match(/^Total:\s+(\d+)\s+test/m);
  if (!m) throw new Error(`could not read a total for project ${project}`);
  return Number(m[1]);
}

/**
 * A directory filter in Playwright is a path SUBSTRING, not a prefix boundary,
 * so `e2e-tests/visual` also matches `e2e-tests/visual-parity`. That cost a
 * published number once: the README said 179 visual snapshots when 41 of them
 * were parity diffs. Subtract deliberately rather than hoping.
 */
function visualOnly(withParity, parity) {
  return withParity - parity;
}

console.log('Measuring. This asks the runners, so it takes a minute.\n');

// Jest's own summary from a real run. `--listTests` counts FILES, and a file
// holds many cases, so it is the wrong instrument. The summary goes to stderr,
// which is why `run` returns both streams. A red suite still reports its
// totals, and a count is still a count.
const jestText = run(BIN.jest, ['--silent', '--coverage', '--coverageReporters=json-summary']);
const jestTests = Number((jestText.match(/Tests:\s+(\d+) passed, (\d+) total/) ?? [])[2] ?? 0);
const jestSuites = Number(
  (jestText.match(/Test Suites:\s+(\d+) passed, (\d+) total/) ?? [])[2] ?? 0,
);
if (!jestTests) throw new Error('could not read the Jest total');
console.log(`  jest                 ${jestTests} tests in ${jestSuites} suites`);

/**
 * Coverage, from the same run. It is published four ways — a badge, a table of
 * four rows with raw counts, a caveat calling function coverage "not good
 * enough", and a roadmap row — and every one of those was a hand copy. The
 * percentages barely move; the raw counts move with every test, and two of them
 * were already one and two behind.
 */
const cov = JSON.parse(
  readFileSync(join(REPO_ROOT, 'coverage', 'coverage-summary.json'), 'utf8'),
).total;
const coverage = Object.fromEntries(
  ['lines', 'statements', 'branches', 'functions'].map((k) => [
    k,
    { pct: cov[k].pct, covered: cov[k].covered, total: cov[k].total },
  ]),
);
console.log(
  `  coverage             lines ${coverage.lines.pct}% · branches ${coverage.branches.pct}% · functions ${coverage.functions.pct}%`,
);

// bddgen must run before the bdd project can be listed — its testDir is generated.
run(BIN.bddgen, []);

const projects = {};
for (const p of [
  'bdd',
  'chromium-desktop',
  'mobile-chrome',
  'perf',
  'mobile-safari',
  'tablet-safari',
]) {
  projects[p] = playwright(p);
  console.log(`  ${p.padEnd(20)} ${projects[p]}`);
}

const tiers = {};
for (const [name, filter] of [
  ['integration', 'e2e-tests/integration'],
  ['visualWithParity', 'e2e-tests/visual'],
  ['visualParity', 'e2e-tests/visual-parity'],
  ['sandbox', 'e2e-tests/sandbox'],
  ['scenarios', 'e2e-tests/scenarios'],
  ['msw', 'e2e-tests/msw'],
]) {
  tiers[name] = playwright('chromium-desktop', filter);
}
tiers.visual = visualOnly(tiers.visualWithParity, tiers.visualParity);
delete tiers.visualWithParity;
console.log(`  tiers                ${JSON.stringify(tiers)}`);

// The generated client — the other pair of numbers that drifted, by 35 and 33.
//
// `models.ts` is a barrel re-exporting the rest, so 182 files are 181 types.
// That one is the difference between the published 182 and the true 181, and
// it is also why the backend's 182 SCHEMAS and the frontend's 181 MODELS are
// both right: springdoc emits per-view schema variants the generator collapses.
//
// Services: `*.api.ts` only. Each has an `*.apiInterface.ts` beside it, and
// counting the directory would double every one of them.
const models = readdirSync(join(REPO_ROOT, 'src', 'app', 'api', 'model')).filter(
  (f) => f.endsWith('.ts') && f !== 'models.ts',
).length;
const services = readdirSync(join(REPO_ROOT, 'src', 'app', 'api', 'api')).filter(
  (f) => f.endsWith('.api.ts') && !f.endsWith('.apiInterface.ts'),
).length;

/**
 * The gate wall's own figures.
 *
 * The README's gate table quotes each gate's headline number — "4472 keys",
 * "140/140 registered", "19/31 proven". Every one of those was typed by hand
 * from a terminal the day the row was written, and the first one is already
 * wrong: the suite has 4,478 keys. The gates print their counts; nothing was
 * reading them.
 *
 * So ask each gate what it says, and keep the answer. They are the fast static
 * checks, so this costs a couple of seconds.
 */
const gateOutput = (script) => run(join(REPO_ROOT, 'tools', script), []);
const first = (text, re, fallback = null) => {
  const found = text.match(re);
  return found ? found.slice(1).map(Number) : fallback;
};

const parity = gateOutput('check-i18n-parity.mjs');
const fixtures = gateOutput('check-visual-fixture-coverage.mjs');
const citations = gateOutput('check-integration-cucumber-citation.mjs');
const corpus = gateOutput('check-bdd-corpus-completeness.mjs');
const contract = gateOutput('check-contract-coverage.mjs');

const [i18nKeys, i18nTemplates] = first(parity, /(\d+)\/\d+ keys \+ (\d+) template/, [0, 0]);
const [visualFixtures] = first(fixtures, /(\d+)\/\d+ registered/, [0]);
const [citing] = first(citations, /(\d+)\/\d+ specs cite/, [0]);
const [beFeatures, ported, waived] = first(
  corpus,
  /(\d+) BE features accounted for \((\d+) ported, (\d+) waived\)/,
  [0, 0, 0],
);
const [proven, wrappers] = first(
  contract,
  /(\d+)\/(\d+) wrappers under an L0 contract; (?:\d+ client-side \+ \d+ transformed-boundary waived)/,
  [0, 0, 0],
);
const contractWaivedTotal = (() => {
  const f = contract.match(/(\d+) client-side \+ (\d+) transformed-boundary/);
  return f ? Number(f[1]) + Number(f[2]) : 0;
})();
const gates = {
  i18nKeys,
  i18nTemplates,
  visualFixtures,
  integrationSpecsCiting: citing,
  bdd: { beFeatures, ported, waived },
  contractCoverage: { proven, wrappers, waived: contractWaivedTotal },
};
console.log(`  gates                ${JSON.stringify(gates)}`);

const distinctPlaywright = projects.bdd + projects['chromium-desktop'] + projects.perf;

const measured = {
  $comment:
    'Written by tools/measure-test-counts.mjs. Do not hand-edit — run `npm run measure:counts`. ' +
    'check-published-numbers.mjs asserts every published figure against this file.',
  measuredAt: new Date().toISOString().slice(0, 10),
  jest: { tests: jestTests, suites: jestSuites },
  playwright: { projects, tiers, distinct: distinctPlaywright },
  total: jestTests + distinctPlaywright,
  // What a clean clone can actually run: no backend, no credentials.
  offline: jestTests + tiers.visual + tiers.sandbox + tiers.msw + projects.perf,
  generatedClient: { models, services },
  gates,
  coverage,
  // Not measured here, and labelled so. The site shows one figure for the whole
  // estate, and half of it lives in another repository; carrying the number with
  // the command that produced it is the difference between a stale claim and a
  // stale claim you can re-run. Update it when the backend does.
  siblings: {
    backend: {
      repo: 'https://github.com/Check-It-Out-Dev/checkitout-backend',
      testMethods: 8908,
      // Re-run in the public clone on 2026-09-07: 8,312 @Test + 596 @ParameterizedTest.
      // The pattern is unanchored on purpose — thirty of the parameterized ones
      // carry a `(name = …)`, and the backend's own README counts them.
      measuredAt: '2026-09-07',
      // Written without a backslash on purpose: this string has already been
      // through one layer of escaping and come out describing a different
      // regexp than the one that was run.
      command: [
        'grep -rhE ' + String.raw`'^\s*@Test'` + " src/test --include='*.java' | wc -l",
        'and the same for @ParameterizedTest',
      ].join('; '),
    },
  },
};

writeFileSync(OUT, JSON.stringify(measured, null, 2) + '\n', 'utf8');
console.log(`\n  total (distinct)     ${measured.total}`);
console.log(`  runnable offline     ${measured.offline}`);
console.log(`\nWrote ${OUT.replace(REPO_ROOT, '.')}`);
console.log('Now run `npm run check:published-numbers` to see what has drifted.');
