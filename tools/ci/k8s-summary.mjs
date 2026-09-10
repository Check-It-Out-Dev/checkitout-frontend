#!/usr/bin/env node
// The verdict of a cluster run, from files: the merged Playwright JSON, the shard exit files and the k6
// per-runner summaries in ci-reports/. Prints a Markdown summary (for $GITHUB_STEP_SUMMARY or a terminal)
// and exits 1 when a shard reported unexpected tests or a k6 runner crossed a threshold. Flaky tests are
// counted and named, never failed on: the dashboard's flaky list is where they are watched.
//
// Three verdicts, not two. A run whose shards did not all finish cannot be called green: its numbers cover
// only what ran. Pass the workflow's own needs context (--needs '${{ toJSON(needs) }}') or the shard count
// the job expected (--expect-shards 4) and a cancelled or missing shard makes the verdict `incomplete`.
// Without that, a push that cancels an in-flight run publishes a green verdict from partial blobs — which
// is what happened on main at 16:15 on 2026-09-09.
//
//   node tools/ci/k8s-summary.mjs [ci-reports] [--json out.json] [--needs <json>] [--expect-shards <n>]
//                                 [--optional job1,job2]   jobs allowed to be skipped deliberately
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { byCodepoint } from '../lib/order.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || 'ci-reports';
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const jsonOut = flag('json');
const needsRaw = flag('needs');
// Jobs this run was never going to execute, comma separated - see the note by the needs loop.
const optional = new Set(
  (flag('optional') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const expectShards = Number(flag('expect-shards') || 0);
const lines = [];
const say = (s = '') => lines.push(s);
let red = false;
let incomplete = false;
const missing = [];

// ---- did every job this verdict speaks for actually finish? ----
if (needsRaw) {
  let needs = null;
  try {
    needs = JSON.parse(needsRaw);
  } catch {
    // An unreadable needs context must never be read as "nothing was cancelled".
    incomplete = true;
    missing.push('the needs context could not be parsed');
  }
  // A job that was deliberately not run is not a hole in the report: the pull-request pipeline
  // skips the slow tiers on purpose, and calling that "incomplete" on every pull request would
  // train everyone to ignore the word. A CANCELLED job is still incomplete however it was named -
  // that one is always an accident.
  for (const [job, v] of Object.entries(needs || {})) {
    const result = (v && v.result) || 'unknown';
    if (result === 'cancelled' || (result === 'skipped' && !optional.has(job))) {
      incomplete = true;
      missing.push(`job ${job} was ${result}`);
    }
  }
}

// ---- Playwright: merged.json + shard-<n>.exit ----
const mergedPath = join(dir, 'merged.json');
const tests = {
  expected: 0,
  unexpected: 0,
  flaky: 0,
  skipped: 0,
  durationSec: 0,
  unexpectedTitles: [],
  flakyTitles: [],
};
const timings = [];
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
        if (t.status === 'unexpected')
          tests.unexpectedTitles.push(`${suite.file || ''} › ${title}`);
        if (t.status === 'flaky') tests.flakyTitles.push(`${suite.file || ''} › ${title}`);
        // Budgets the tier measured but did not assert (PERF_TIMING=report on a shared runner). They belong
        // in the report or they are invisible: a number nobody reads is the same as a number nobody took.
        // Playwright mirrors annotations onto the test from its LAST result only, so a retried test would
        // lose the earlier readings; read both places and de-duplicate.
        const seen = new Set();
        for (const a of [
          ...(t.annotations || []),
          ...(t.results || []).flatMap((r) => r.annotations || []),
        ]) {
          if (!a || a.type !== 'timing' || !a.description || seen.has(a.description)) continue;
          seen.add(a.description);
          const [name, reading] = a.description.split(/:\s(.+)/);
          timings.push({ test: title, name, reading: reading ?? a.description });
        }
      }
    }
    for (const s of suite.suites || []) walk(s, [...path, s.title]);
  };
  for (const s of merged.suites || []) walk(s, []);
}
const shards = readdirSync(dir)
  .filter((f) => /^shard-\d+\.exit$/.test(f))
  .sort(byCodepoint)
  .map((f) => ({ shard: f.match(/\d+/)[0], exit: readFileSync(join(dir, f), 'utf8').trim() }));

say('### Browser tiers on the cluster');
say();
if (existsSync(mergedPath)) {
  say('| expected | unexpected | flaky | skipped | wall |');
  say('| --- | --- | --- | --- | --- |');
  say(
    `| ${tests.expected} | ${tests.unexpected} | ${tests.flaky} | ${tests.skipped} | ${tests.durationSec} s |`,
  );
  say();
  if (shards.length) say(`Shards: ${shards.map((s) => `${s.shard} → exit ${s.exit}`).join(', ')}.`);
  if (expectShards && shards.length < expectShards) {
    incomplete = true;
    missing.push(`${expectShards - shards.length} of ${expectShards} shards left no exit file`);
  }
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
  if (timings.length) {
    say();
    say('Measured, not asserted — these budgets belong to the machine, not to the application:');
    say();
    say('| test | reading |');
    say('| --- | --- |');
    for (const t of timings) say(`| ${t.test} · ${t.name} | ${t.reading} |`);
  }
} else {
  red = true;
  say(`No merged report at ${mergedPath}: the shards did not produce blobs.`);
}

// ---- k6: one JSON per runner ----
const k6Files = readdirSync(dir)
  .filter((f) => /^api-.*\.json$/.test(f))
  .sort(byCodepoint);
const k6 = [];
for (const f of k6Files) {
  const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const m = d.metrics || {};
  const p95 = (name) => (m[name] && m[name].values ? m[name].values['p(95)'] : undefined);
  const thresholdsOk = Object.values(m).every(
    (x) => !x.thresholds || Object.values(x.thresholds).every((t) => t.ok),
  );
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
    say(
      `| ${r.runner} | ${r.requests} | ${(r.failedRate * 100).toFixed(2)} % | ${(r.checksRate * 100).toFixed(1)} % | ${ms(r.p95Ms)} | ${ms(r.browseP95Ms)} | ${ms(r.applyP95Ms)} | ${r.thresholdsOk ? 'within budget' : 'crossed'} |`,
    );
  }
}

const status = incomplete ? 'incomplete' : red ? 'red' : 'green';
say();
if (incomplete) {
  say(
    `**Verdict: incomplete.** ${missing.join('; ')} — the numbers above cover only what finished, so this run`,
  );
  say('is not a green run and is not published as one.');
  if (red) say('It is red as well: the unexpected tests above did run and did fail.');
} else {
  say(red ? '**Verdict: red.**' : '**Verdict: green.**');
}
const out = lines.join('\n') + '\n';
process.stdout.write(out);
if (jsonOut)
  writeFileSync(
    jsonOut,
    JSON.stringify({ status, red, incomplete, missing, tests, shards, k6, timings }, null, 2),
  );
process.exit(status === 'green' ? 0 : 1);
