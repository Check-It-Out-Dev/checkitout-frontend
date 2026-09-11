#!/usr/bin/env node
// The numbers every run publishes, measured from the run's own artifacts and written into the Pages site
// (docs/ci/METRICS.md is the schema of record). One tool for the three repositories: it reads whichever
// inputs the run produced and omits the sections it did not.
//
//   node tools/ci/quality-metrics.mjs --out site [inputs] [reports]
//
// inputs (each optional, repeatable where noted)
//   --jest results.json                 `jest --json --outputFile=results.json`; tier "jest"
//   --coverage coverage-summary.json    Jest json-summary (lines, statements, branches, functions)
//   --playwright merged.json            `playwright merge-reports --reporter json`; tiers from the spec path
//   --verdict summary.json              k8s-summary.mjs output; carries `status` green|incomplete|red
//   --junit "glob:tier"                 JUnit XML files (surefire, failsafe, pytest), repeatable
//   --jacoco jacoco.xml                 line coverage from a JaCoCo report
//   --k6 "glob"                         k6 handleSummary JSON, one per runner
//   --lighthouse lighthouse.json        from tools/ci/lighthouse-summary.mjs
//   --kubernetes '{"shards":4,"wallSec":116,"k6Runners":2}'
//   --mutation summary.json             mutation score, from tools/ci/mutation-summary.mjs (Stryker)
//                                       or tools/ci/pit-summary.mjs (PIT) — both write the same keys
//   --sarif "glob"                      SARIF from the security scanners; repeatable
//   --security latest.json              an already-counted summary from tools/ci/sarif-summary.mjs,
//                                       which is how a publisher picks up the security tier's result
//                                       from the site without re-reading its SARIF
//   --copy name=dir                     copy a report directory to <name>/<run>/ in the site, repeatable
//                                       (allure also gets allure/latest/)
//   --started-at ISO  --duration-sec N  the run's start and length (defaults: now, 0)
//   --workflow name                     defaults to $GITHUB_WORKFLOW
//   --keep N                            runs kept on the site (default 30); history.jsonl is never pruned
//   --window N                          runs of the flaky window (default 10)
//
// The run identity comes from the GitHub environment (GITHUB_REPOSITORY, GITHUB_RUN_NUMBER, GITHUB_RUN_ID,
// GITHUB_SHA, GITHUB_REF_NAME, GITHUB_SERVER_URL) or from --repo/--run-number/--run-id/--sha/--branch.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flakyList } from './flaky-report.mjs';
import { byCodepoint } from '../lib/order.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const opt = {};
const multi = { junit: [], copy: [], k6: [], sarif: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  if (key in multi) multi[key].push(val);
  else opt[key] = val;
}
const out = resolve(opt.out || 'site');
const env = process.env;
const repo = opt.repo || env.GITHUB_REPOSITORY || 'Check-It-Out-Dev/checkitout-frontend';
const runNumber = Number(opt['run-number'] || env.GITHUB_RUN_NUMBER || 0);
const runId = Number(opt['run-id'] || env.GITHUB_RUN_ID || 0);
const sha = (opt.sha || env.GITHUB_SHA || '').slice(0, 7);
const branch = opt.branch || env.GITHUB_REF_NAME || 'main';
const workflow = opt.workflow || env.GITHUB_WORKFLOW || 'local';
const server = env.GITHUB_SERVER_URL || 'https://github.com';
const startedAt = opt['started-at'] || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const durationSec = Number(opt['duration-sec'] || 0);
const keep = Number(opt.keep || 30);
const windowRuns = Number(opt.window || 10);
if (!runNumber) die('a run number is required (--run-number or GITHUB_RUN_NUMBER)');

function die(msg) {
  console.error(`quality-metrics: ${msg}`);
  process.exit(1);
}
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function glob(pattern) {
  // A minimal glob: one directory and a file pattern with * — plus a single `**` segment, which matches
  // the directory and everything below it. The backend needs the recursive form: the e2e profile gives
  // every Cucumber suite its own reportsDirectory, so the XMLs sit at
  // failsafe-reports/<suite>/TEST-*.xml and no single-directory pattern can reach them.
  const norm = pattern.replace(/\\/g, '/');
  const re = (name) =>
    new RegExp(
      '^' +
        basename(name)
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*') +
        '$',
    );
  if (norm.includes('**')) {
    const [head, tail] = norm.split(/\/?\*\*\/?/, 2);
    const filePattern = re(tail || '*');
    const root = head || '.';
    const out = [];
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (filePattern.test(e.name)) out.push(full);
      }
    };
    walk(root);
    return out.sort(byCodepoint);
  }
  const dir = dirname(norm);
  const filePattern = re(norm);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => filePattern.test(f))
    .map((f) => join(dir, f))
    .sort(byCodepoint);
}
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

/* ---------- tests: tiers and per-test outcomes ---------- */
const tiers = {};
const tests = []; // { id, status: pass|flaky|fail|skipped, durationSec, retries }
const tier = (name) =>
  (tiers[name] ??= { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, durationSec: 0 });
function record(name, status, durationSec, id, retries = 0) {
  const t = tier(name);
  t.total++;
  t[status === 'pass' ? 'passed' : status === 'fail' ? 'failed' : status]++;
  t.durationSec += durationSec;
  tests.push({ id, status, durationSec: r2(durationSec), retries });
}

if (opt.jest && existsSync(opt.jest)) {
  const j = readJson(opt.jest);
  for (const file of j.testResults || []) {
    const rel = file.name.replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/');
    for (const a of file.assertionResults || []) {
      const status = a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'skipped';
      record('jest', status, (a.duration || 0) / 1000, `${rel} › ${a.fullName}`);
    }
  }
}

function playwrightTier(file) {
  if (/features-gen|\.feature/.test(file)) return 'bdd';
  const m = /^(?:e2e-tests\/)?([^/]+)\//.exec(file.replace(/\\/g, '/'));
  return m ? m[1] : 'playwright';
}
if (opt.playwright && existsSync(opt.playwright)) {
  const p = readJson(opt.playwright);
  const walk = (suite, path, file) => {
    const f = suite.file || file;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const status =
          t.status === 'expected'
            ? 'pass'
            : t.status === 'unexpected'
              ? 'fail'
              : t.status === 'flaky'
                ? 'flaky'
                : 'skipped';
        const results = t.results || [];
        const dur = results.reduce((s, r) => s + (r.duration || 0), 0) / 1000;
        const title = [...path, spec.title].join(' › ');
        record(
          playwrightTier(f),
          status,
          dur,
          `${f} › ${title} [${t.projectName || 'default'}]`,
          Math.max(0, results.length - 1),
        );
      }
    }
    for (const s of suite.suites || []) walk(s, [...path, s.title], f);
  };
  for (const s of p.suites || []) walk(s, [], s.file);
}

function junitFiles(spec) {
  // "glob:tier"; the tier is after the LAST colon so a Windows drive letter survives.
  const i = spec.lastIndexOf(':');
  const pattern = i > 1 ? spec.slice(0, i) : spec;
  const name = i > 1 ? spec.slice(i + 1) : 'junit';
  return { files: glob(pattern), name: name || 'junit' };
}
function parseJunit(xml) {
  const cases = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = Object.fromEntries(
      [...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [
        a[1],
        // `&amp;` last, always. Decoding it in the middle re-decodes what the replacements
        // after it produce: `&amp;lt;` becomes `&lt;` becomes `<`, so a test name containing the
        // literal text `&lt;` comes back as a tag. Entity decoding is only correct outside-in.
        a[2]
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&'),
      ]),
    );
    const body = m[3] || '';
    let status = 'pass';
    if (/<skipped\b/.test(body)) status = 'skipped';
    else if (/<(failure|error)\b/.test(body)) status = 'fail';
    else if (/<(flakyFailure|flakyError|rerunFailure|rerunError)\b/.test(body)) status = 'flaky';
    cases.push({
      name: attrs.name || '',
      classname: attrs.classname || '',
      time: Number(attrs.time || 0),
      status,
    });
  }
  return cases;
}
for (const spec of multi.junit) {
  const { files, name } = junitFiles(spec);
  for (const f of files) {
    for (const c of parseJunit(readFileSync(f, 'utf8'))) {
      record(name, c.status, c.time, `${c.classname} › ${c.name}`);
    }
  }
}

// Zero tests read from artifacts that were explicitly named is never a true statement about a run: it is
// a glob that missed. The backend's site published "0 tests, pass rate 100 %" for six runs because
// `results/unit-results/TEST-*.xml` was one directory short of `results/unit-results/surefire-reports/`.
if (tests.length === 0) {
  const inputs = [
    ...multi.junit.map((j) => `--junit ${j}`),
    ...(opt.jest ? [`--jest ${opt.jest}`] : []),
    ...(opt.playwright ? [`--playwright ${opt.playwright}`] : []),
  ];
  if (inputs.length) {
    const tree = (dir, depth = 0) => {
      if (depth > 2 || !existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? [`${'  '.repeat(depth)}${e.name}/`, ...tree(join(dir, e.name), depth + 1)]
          : [`${'  '.repeat(depth)}${e.name}`],
      );
    };
    const roots = [
      ...new Set(
        inputs.map((i) => i.split(' ')[1].split(/[/\\]/)[0]).filter((r) => r && !r.startsWith('-')),
      ),
    ];
    die(
      `not one test was read, so there is nothing to publish. Inputs given:\n  ${inputs.join('\n  ')}\n` +
        roots
          .map(
            (r) =>
              `What is actually under ${r}/:\n${
                tree(r)
                  .slice(0, 60)
                  .map((l) => '  ' + l)
                  .join('\n') || '  (nothing)'
              }`,
          )
          .join('\n'),
    );
  }
}

const scored = tests.filter((t) => t.status !== 'skipped');
const durations = scored.map((t) => t.durationSec).sort((a, b) => a - b);
const p95 = durations.length
  ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]
  : 0;
const totals = Object.values(tiers).reduce(
  (a, t) => ({
    total: a.total + t.total,
    passed: a.passed + t.passed,
    failed: a.failed + t.failed,
    flaky: a.flaky + t.flaky,
    skipped: a.skipped + t.skipped,
  }),
  { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
);
const scoredCount = totals.passed + totals.failed + totals.flaky;
for (const t of Object.values(tiers)) t.durationSec = Math.round(t.durationSec);

/* ---------- coverage ---------- */
let coverage;
if (opt.coverage && existsSync(opt.coverage)) {
  const c = readJson(opt.coverage).total;
  coverage = {
    lines: r2(c.lines.pct),
    statements: r2(c.statements.pct),
    branches: r2(c.branches.pct),
    functions: r2(c.functions.pct),
  };
} else if (opt.jacoco && existsSync(opt.jacoco)) {
  const xml = readFileSync(opt.jacoco, 'utf8');
  const tail = xml.slice(xml.lastIndexOf('</package>'));
  const pick = (type) => {
    const m = new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"`).exec(tail);
    return m ? r2((100 * Number(m[2])) / (Number(m[1]) + Number(m[2]) || 1)) : undefined;
  };
  coverage = {
    lines: pick('LINE'),
    statements: pick('INSTRUCTION'),
    branches: pick('BRANCH'),
    functions: pick('METHOD'),
  };
}

/* ---------- k6 ---------- */
let perf;
const k6Files = multi.k6.flatMap(glob);
if (k6Files.length) {
  let requests = 0,
    failed = 0,
    p95Ms = 0,
    thresholdsOk = true,
    profile = 'unknown';
  const journeys = {};
  for (const f of k6Files) {
    const m = readJson(f).metrics || {};
    const prof = /api-([a-z]+)-/.exec(basename(f));
    if (prof) profile = prof[1];
    const reqs = m.http_reqs ? m.http_reqs.values.count : 0;
    requests += reqs;
    failed += m.http_req_failed ? m.http_req_failed.values.rate * reqs : 0;
    p95Ms = Math.max(p95Ms, m.http_req_duration?.values?.['p(95)'] || 0);
    for (const [name, metric] of Object.entries(m)) {
      if (metric.thresholds && !Object.values(metric.thresholds).every((t) => t.ok))
        thresholdsOk = false;
      const jm = /^http_req_duration\{journey:([a-z_]+)\}$/.exec(name);
      if (jm) {
        const j = (journeys[jm[1]] ??= { p95Ms: 0, p99Ms: 0, budgetMs: null, ok: true });
        j.p95Ms = Math.max(j.p95Ms, metric.values['p(95)'] || 0);
        j.p99Ms = Math.max(j.p99Ms, metric.values['p(99)'] || 0);
        for (const [th, res] of Object.entries(metric.thresholds || {})) {
          const b = /p\(95\)<(\d+)/.exec(th);
          if (b) j.budgetMs = Number(b[1]);
          if (!res.ok) j.ok = false;
        }
      }
    }
  }
  for (const j of Object.values(journeys)) {
    j.p95Ms = r2(j.p95Ms);
    j.p99Ms = r2(j.p99Ms);
  }
  perf = {
    k6: {
      profile,
      requests,
      failedRate: r4(requests ? failed / requests : 0),
      p95Ms: r2(p95Ms),
      thresholdsOk,
      journeys,
    },
  };
}

/* ---------- lighthouse, kubernetes ---------- */
let lighthouse;
if (opt.lighthouse && existsSync(opt.lighthouse)) {
  const l = readJson(opt.lighthouse);
  lighthouse = {
    url: l.url,
    performance: l.performance,
    accessibility: l.accessibility,
    bestPractices: l.bestPractices,
    seo: l.seo,
  };
}
let kubernetes;
if (opt.kubernetes) kubernetes = JSON.parse(opt.kubernetes);

/* ---------- mutation: would the tests notice if the code were wrong ---------- */
// Coverage says a line ran. This says something checked the result. Two numbers, because the gap
// between them separates "write a test" from "make a test assert something".
let mutation;
if (opt.mutation && existsSync(opt.mutation)) {
  const m = readJson(opt.mutation);
  if (m.mutationScore !== null && m.mutationScore !== undefined) {
    mutation = {
      score: m.mutationScore,
      coveredScore: m.coveredScore ?? null,
      mutants: m.mutants?.total ?? null,
      survived: m.mutants?.Survived ?? m.mutants?.SURVIVED ?? null,
      floor: m.floor ?? null,
      ...(m.classesWithNoUnitTest !== undefined
        ? { classesWithNoUnitTest: m.classesWithNoUnitTest }
        : {}),
    };
  }
}

/* ---------- security: what the scanners found, this run ---------- */
// Counted from the SARIF the scanners emit rather than from the code-scanning API, so the number is
// this run's own evidence and stays readable offline and in a fork. A tool that produced a SARIF and
// found nothing is recorded as zero rather than dropped: a scanner going silent should be visible.
let security;
if (opt.security && existsSync(opt.security)) {
  const s = readJson(opt.security);
  if (s && typeof s.total === 'number') security = s;
}
const sarifFiles = multi.sarif.flatMap(glob);
if (!security && sarifFiles.length) {
  const byLevel = { error: 0, warning: 0, note: 0 };
  const byTool = {};
  for (const f of sarifFiles) {
    let d;
    try {
      d = readJson(f);
    } catch {
      console.warn(`quality-metrics: ${f} is not readable SARIF, skipped`);
      continue;
    }
    for (const run of d.runs || []) {
      const tool = run.tool?.driver?.name || basename(f);
      byTool[tool] ??= 0;
      for (const r of run.results || []) {
        const lvl = String(r.level || 'warning').toLowerCase();
        if (lvl in byLevel) byLevel[lvl]++;
        byTool[tool]++;
      }
    }
  }
  security = {
    total: byLevel.error + byLevel.warning + byLevel.note,
    ...byLevel,
    tools: byTool,
    scans: sarifFiles.length,
  };
}

/* ---------- the site: reports, tests file, flaky list, metrics, history, badges, dashboard ---------- */
mkdirSync(join(out, 'metrics', 'tests'), { recursive: true });
mkdirSync(join(out, 'badges'), { recursive: true });
// Run numbers are per workflow: browser-tiers 10 and k8s-test-execution 10 are different runs of different
// suites. Without the prefix they share one file name, one history line and one flaky window — the second
// one to publish deletes the first, and "the last ten runs" mixes two suites.
//
// The report directories needed the same key and did not have it, which was worse than a name clash:
// the publish is an overlay, so four workflows writing `allure/<n>` did not overwrite each other, they
// MERGED. Under workflow_call `github.run_number` is the CALLER's, so one night put browser-tiers,
// nightly-full-stack and k8s-test-execution into one directory; `allure/18` on the backend reached
// 23,823 files and 65 MB, and the report it served was three tiers' files in one index. That is what
// eventually timed out the Pages deployment (run 34575591685, 621 MB, "syncing_files" until it aborted).
const runKey = `${workflow}-${runNumber}`;

const reports = {};
for (const spec of multi.copy) {
  const [name, dir] = spec.split('=');
  if (!dir || !existsSync(dir)) {
    console.warn(`quality-metrics: no ${name} report at ${dir}, skipped`);
    continue;
  }
  const dest = join(out, name, runKey);
  rmSync(dest, { recursive: true, force: true });
  cpSync(dir, dest, { recursive: true });
  reports[name] = `${name}/${runKey}/`;
  if (name === 'allure') {
    rmSync(join(out, 'allure', 'latest'), { recursive: true, force: true });
    cpSync(dir, join(out, 'allure', 'latest'), { recursive: true });
  }
}
writeFileSync(
  join(out, 'metrics', 'tests', `${runKey}.json`),
  JSON.stringify({ run: runNumber, workflow, tests }),
);
const { list: flaky } = flakyList(join(out, 'metrics', 'tests'), windowRuns, workflow);

// A run whose jobs did not all finish is `incomplete`: its counts are partial and it must never be read,
// on the dashboard or in the history, as a green run (k8s-summary.mjs decides this).
const verdict = opt.verdict && existsSync(opt.verdict) ? readJson(opt.verdict) : null;
const runStatus = (verdict && verdict.status) || null;

const metrics = {
  schema: 1,
  repo,
  run: {
    number: runNumber,
    id: runId,
    sha,
    branch,
    workflow,
    startedAt,
    durationSec,
    url: `${server}/${repo}/actions/runs/${runId}`,
    ...(runStatus ? { status: runStatus } : {}),
  },
  tests: {
    ...totals,
    passRate: r4(scoredCount ? totals.passed / scoredCount : 1),
    flakyRate: r4(scoredCount ? totals.flaky / scoredCount : 0),
    durationMeanSec: r2(
      durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    ),
    durationP95Sec: r2(p95),
    tiers,
  },
  ...(coverage ? { coverage } : {}),
  ...(perf ? { perf } : {}),
  ...(lighthouse ? { lighthouse } : {}),
  ...(kubernetes ? { kubernetes } : {}),
  ...(mutation ? { mutation } : {}),
  ...(security ? { security } : {}),
  flaky,
  reports,
};
writeFileSync(join(out, 'quality-metrics.json'), JSON.stringify(metrics, null, 2));

const line = {
  run: runNumber,
  id: runId,
  sha,
  at: startedAt,
  workflow,
  durationSec,
  ...(runStatus ? { status: runStatus } : {}),
  total: totals.total,
  passed: totals.passed,
  failed: totals.failed,
  flaky: totals.flaky,
  skipped: totals.skipped,
  passRate: metrics.tests.passRate,
  flakyRate: metrics.tests.flakyRate,
  ...(coverage ? { coverageLines: coverage.lines } : {}),
  ...(perf ? { k6P95Ms: perf.k6.p95Ms, k6FailedRate: perf.k6.failedRate } : {}),
  ...(lighthouse
    ? { lhPerformance: lighthouse.performance, lhAccessibility: lighthouse.accessibility }
    : {}),
  ...(mutation
    ? { mutationScore: mutation.score, mutationCoveredScore: mutation.coveredScore }
    : {}),
  ...(security ? { securityFindings: security.total, securityErrors: security.error } : {}),
};
const historyPath = join(out, 'metrics', 'history.jsonl');
const existing = existsSync(historyPath)
  ? readFileSync(historyPath, 'utf8').split('\n').filter(Boolean)
  : [];
const kept = existing.filter((l) => {
  try {
    const h = JSON.parse(l);
    return !(h.run === runNumber && (h.workflow || workflow) === workflow);
  } catch {
    return false;
  }
});
writeFileSync(historyPath, kept.concat(JSON.stringify(line)).join('\n') + '\n');

const badge = (name, label, message, color) =>
  writeFileSync(
    join(out, 'badges', `${name}.json`),
    JSON.stringify({ schemaVersion: 1, label, message, color }),
  );
badge(
  'tests',
  'tests',
  `${totals.passed} passed${totals.flaky ? ` · ${totals.flaky} flaky` : ''}${totals.failed ? ` · ${totals.failed} failed` : ''}`,
  totals.failed ? 'red' : totals.flaky ? 'yellow' : 'brightgreen',
);
if (coverage)
  badge(
    'coverage',
    'coverage',
    `${coverage.lines.toFixed(1)} %`,
    coverage.lines >= 75 ? 'brightgreen' : coverage.lines >= 60 ? 'yellow' : 'red',
  );
if (perf)
  badge(
    'k6',
    'k6 p95',
    `${perf.k6.p95Ms >= 1000 ? (perf.k6.p95Ms / 1000).toFixed(2) + ' s' : perf.k6.p95Ms.toFixed(0) + ' ms'} · ${(perf.k6.failedRate * 100).toFixed(0)} % failed`,
    perf.k6.thresholdsOk ? 'brightgreen' : 'red',
  );
if (mutation) {
  // Coloured against the tier's own floor rather than a universal number: 72 % is strong for a
  // frontend scoped to core services and weak for a hand-written parser. The floor is the contract.
  const f = mutation.floor ?? 60;
  badge(
    'mutation',
    'mutation',
    `${mutation.score.toFixed(1)} %${mutation.coveredScore != null ? ` · ${mutation.coveredScore.toFixed(1)} % covered` : ''}`,
    mutation.score >= f + 10 ? 'brightgreen' : mutation.score >= f ? 'yellow' : 'red',
  );
}
if (security) {
  // Errors are the number that matters; warnings and notes are counted but do not colour the badge,
  // because a scanner that reports 400 style notes would otherwise make the estate look on fire.
  badge(
    'security',
    'security',
    security.total
      ? `${security.error} error${security.error === 1 ? '' : 's'} · ${security.warning} warning${security.warning === 1 ? '' : 's'}`
      : 'no findings',
    security.error ? 'red' : security.warning ? 'yellow' : 'brightgreen',
  );
}
if (lighthouse) {
  const low = Math.min(
    lighthouse.performance,
    lighthouse.accessibility,
    lighthouse.bestPractices,
    lighthouse.seo,
  );
  badge(
    'lighthouse',
    'lighthouse',
    `${lighthouse.performance} · ${lighthouse.accessibility} · ${lighthouse.bestPractices} · ${lighthouse.seo}`,
    low >= 90 ? 'brightgreen' : low >= 75 ? 'yellow' : 'red',
  );
}
badge(
  'flaky',
  `flaky (${windowRuns} runs)`,
  `${flaky.length} ${flaky.length === 1 ? 'test' : 'tests'}`,
  flaky.length === 0 ? 'brightgreen' : flaky.length <= 3 ? 'yellow' : 'red',
);

for (const f of ['index.html', 'styles.css', 'dashboard.js'])
  cpSync(join(here, 'pages', f), join(out, f));
writeFileSync(join(out, '.nojekyll'), '');

// Prune: keep the newest N run directories per report kind and N outcome files; history.jsonl stays.
const prune = (dir, isRun, numberOf = (f) => Number(f.replace('.json', ''))) => {
  if (!existsSync(dir)) return;
  const runs = readdirSync(dir)
    .filter((f) => isRun(f))
    .map((f) => ({ f, n: numberOf(f) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => b.n - a.n);
  for (const x of runs.slice(keep)) rmSync(join(dir, x.f), { recursive: true, force: true });
};
for (const name of ['allure', 'playwright', 'k6', 'lighthouse'])
  prune(join(out, name), (f) => /^\d+$/.test(f) && statSync(join(out, name, f)).isDirectory());
// Per workflow, so a busy workflow cannot prune away another one's window. Files with no prefix are the
// pre-namespace ones: they cannot be attributed to a workflow, so they go.
prune(
  join(out, 'metrics', 'tests'),
  // Not a RegExp built around `workflow`: the value is `github.workflow`, which is a display name
  // and therefore contains spaces, brackets and dots -- "Browser tiers (fast)" compiles to a
  // pattern that means something else entirely, and one with an unbalanced bracket does not
  // compile at all. A prefix test asks the same question and cannot be read as syntax.
  (f) => f.startsWith(`${workflow}-`) && /^\d+\.json$/.test(f.slice(workflow.length + 1)),
  (f) => Number(f.slice(workflow.length + 1).replace('.json', '')),
);
for (const f of existsSync(join(out, 'metrics', 'tests'))
  ? readdirSync(join(out, 'metrics', 'tests'))
  : []) {
  if (/^\d+\.json$/.test(f)) rmSync(join(out, 'metrics', 'tests', f), { force: true });
}

/* ---------- step summary ---------- */
const lines = [];
lines.push(`### Quality metrics, run ${runNumber}`);
lines.push('');
lines.push('| tier | tests | passed | failed | flaky | skipped | took |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const [name, t] of Object.entries(tiers))
  lines.push(
    `| ${name} | ${t.total} | ${t.passed} | ${t.failed} | ${t.flaky} | ${t.skipped} | ${t.durationSec} s |`,
  );
lines.push(
  `| **all** | ${totals.total} | ${totals.passed} | ${totals.failed} | ${totals.flaky} | ${totals.skipped} | ${durationSec} s |`,
);
lines.push('');
const bits = [
  `pass rate ${(metrics.tests.passRate * 100).toFixed(2)} %`,
  `flaky in the last ${windowRuns} runs: ${flaky.length}`,
];
if (coverage) bits.push(`line coverage ${coverage.lines.toFixed(1)} %`);
if (perf)
  bits.push(
    `k6 p95 ${perf.k6.p95Ms.toFixed(0)} ms, ${(perf.k6.failedRate * 100).toFixed(2)} % failed, thresholds ${perf.k6.thresholdsOk ? 'ok' : 'crossed'}`,
  );
if (lighthouse)
  bits.push(
    `Lighthouse ${lighthouse.performance}/${lighthouse.accessibility}/${lighthouse.bestPractices}/${lighthouse.seo}`,
  );
lines.push(bits.join(' · ') + '.');
if (Object.keys(reports).length)
  lines.push(
    `Reports: ${Object.entries(reports)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ')}.`,
  );
console.log(lines.join('\n'));
