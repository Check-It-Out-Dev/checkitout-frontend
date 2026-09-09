#!/usr/bin/env node
// The verdict of a cluster run, from files: the merged Playwright JSON, the shard exit files and the k6
// per-runner summaries in ci-reports/. Prints a Markdown summary (for $GITHUB_STEP_SUMMARY or a terminal)
// and exits 1 when a shard reported unexpected tests or a k6 runner crossed a threshold. Flaky tests are
// counted and named, never failed on: the dashboard's flaky list is where they are watched.
//
//   node tools/ci/k8s-summary.mjs [ci-reports] [--json out.json]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || 'ci-reports';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const lines = [];
const say = (s = '') => lines.push(s);
let red = false;

// ---- Playwright: merged.json + shard-<n>.exit ----
const mergedPath = join(dir, 'merged.json');
const tests = { expected: 0, unexpected: 0, flaky: 0, skipped: 0, durationSec: 0, unexpectedTitles: [], flakyTitles: [] };
if (existsSync(mergedPath)) {
  const merged = JSON.parse(readFileSync(mergedPath, 'utf8'));
  const stats = merged.stats || {};
  tests.expected = stats.expected || 0;
  tests.unexpected = stats.unexpected || 0;
  tests.flaky = stats.flaky || 0;
  tests.skipped = stats.skipped || 0;
  tests.durationSec = Math.round((stats.duration || 0) / 1000);
  const walk = (suite, path) => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const title = [...path, spec.title].join(' › ');
        if (t.status === 'unexpected') tests.unexpectedTitles.push(`${suite.file || ''} › ${title}`);
        if (t.status === 'flaky') tests.flakyTitles.push(`${suite.file || ''} › ${title}`);
      }
    }
    for (const s of suite.suites || []) walk(s, [...path, s.title]);
  };
  for (const s of merged.suites || []) walk(s, []);
}
const shards = readdirSync(dir)
  .filter((f) => /^shard-\d+\.exit$/.test(f))
  .sort()
  .map((f) => ({ shard: f.match(/\d+/)[0], exit: readFileSync(join(dir, f), 'utf8').trim() }));

say('### Browser tiers on the cluster');
say();
if (existsSync(mergedPath)) {
  say('| expected | unexpected | flaky | skipped | wall |');
  say('| --- | --- | --- | --- | --- |');
  say(`| ${tests.expected} | ${tests.unexpected} | ${tests.flaky} | ${tests.skipped} | ${tests.durationSec} s |`);
  say();
  if (shards.length) say(`Shards: ${shards.map((s) => `${s.shard} → exit ${s.exit}`).join(', ')}.`);
  if (tests.unexpectedTitles.length) {
    red = true;
    say();
    say('Unexpected:');
    for (const t of tests.unexpectedTitles) say(`- ${t}`);
  }
  if (tests.flakyTitles.length) {
    say();
    say('Flaky (passed on retry, listed on the dashboard):');
    for (const t of tests.flakyTitles) say(`- ${t}`);
  }
} else {
  red = true;
  say(`No merged report at ${mergedPath}: the shards did not produce blobs.`);
}

// ---- k6: one JSON per runner ----
const k6Files = readdirSync(dir).filter((f) => /^api-.*\.json$/.test(f)).sort();
const k6 = [];
for (const f of k6Files) {
  const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const m = d.metrics || {};
  const p95 = (name) => (m[name] && m[name].values ? m[name].values['p(95)'] : undefined);
  const thresholdsOk = Object.values(m).every((x) => !x.thresholds || Object.values(x.thresholds).every((t) => t.ok));
  const row = {
    runner: f.replace(/^api-/, '').replace(/\.json$/, ''),
    requests: m.http_reqs ? m.http_reqs.values.count : 0,
    failedRate: m.http_req_failed ? m.http_req_failed.values.rate : 0,
    checksRate: m.checks ? m.checks.values.rate : 0,
    p95Ms: p95('http_req_duration'),
    browseP95Ms: p95('http_req_duration{journey:browse}'),
    applyP95Ms: p95('http_req_duration{journey:apply}'),
    thresholdsOk,
  };
  if (!thresholdsOk) red = true;
  k6.push(row);
}
if (k6.length) {
  say();
  say('### k6 from inside the cluster');
  say();
  say('| runner | requests | failed | checks | p95 | browse p95 | apply p95 | thresholds |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const ms = (x) => (typeof x === 'number' ? `${x.toFixed(0)} ms` : '–');
  for (const r of k6) {
    say(`| ${r.runner} | ${r.requests} | ${(r.failedRate * 100).toFixed(2)} % | ${(r.checksRate * 100).toFixed(1)} % | ${ms(r.p95Ms)} | ${ms(r.browseP95Ms)} | ${ms(r.applyP95Ms)} | ${r.thresholdsOk ? 'within budget' : 'crossed'} |`);
  }
}

say();
say(red ? '**Verdict: red.**' : '**Verdict: green.**');
const out = lines.join('\n') + '\n';
process.stdout.write(out);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ red, tests, shards, k6 }, null, 2));
process.exit(red ? 1 : 0);
