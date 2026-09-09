#!/usr/bin/env node
// The flaky list: every test that flaked or failed in any of the last N runs, with its status in each of
// those runs, from the per-run outcome files metrics/tests/<workflow>-<run>.json that quality-metrics.mjs
// writes (docs/ci/METRICS.md §4). A test leaves the list by being green for N runs, never by being deleted.
//
// The window is per workflow. Run numbers are per workflow, so the browser tiers and the cluster run both
// count from 1 and would otherwise share one namespace: the tenth browser-tiers run and the tenth cluster
// run are different runs of different suites, and mixing them makes "the last ten runs" meaningless.
//
//   node tools/ci/flaky-report.mjs site/metrics/tests [--window 10] [--workflow browser-tiers]
//   import { flakyList } from './flaky-report.mjs'                      used by quality-metrics.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} testsDir      site/metrics/tests
 * @param {number} windowRuns    how many runs the window spans
 * @param {string|null} workflow when given, only that workflow's runs count
 * @returns {{ list: object[], runs: number[] }} the flaky entries and the run numbers of the window
 */
export function flakyList(testsDir, windowRuns = 10, workflow = null) {
  if (!existsSync(testsDir)) return { list: [], runs: [] };
  const entries = [];
  for (const f of readdirSync(testsDir)) {
    const m = /^(?:(.+)-)?(\d+)\.json$/.exec(f);
    if (!m) continue;
    // A file with no workflow prefix predates the per-workflow namespace and cannot be attributed.
    if (workflow ? m[1] !== workflow : m[1]) continue;
    entries.push({ run: Number(m[2]), file: f });
  }
  entries.sort((a, b) => a.run - b.run);
  const window = entries.slice(-windowRuns);
  const files = window.map((e) => e.run);
  const byId = new Map();
  for (const { run, file } of window) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(testsDir, file), 'utf8'));
    } catch {
      continue;
    }
    for (const t of data.tests || []) {
      if (!byId.has(t.id)) byId.set(t.id, new Map());
      byId.get(t.id).set(run, t.status);
    }
  }
  const list = [];
  for (const [id, statuses] of byId) {
    const history = files.map((run) => statuses.get(run) || 'absent');
    const runsFlaky = history.filter((s) => s === 'flaky').length;
    const runsFailed = history.filter((s) => s === 'fail').length;
    if (runsFlaky + runsFailed === 0) continue;
    let lastSeen = null;
    for (let i = files.length - 1; i >= 0; i--) if (history[i] === 'flaky' || history[i] === 'fail') { lastSeen = files[i]; break; }
    const sep = id.indexOf(' › ');
    list.push({
      title: sep > 0 ? id.slice(sep + 3) : id,
      file: sep > 0 ? id.slice(0, sep) : '',
      window: files.length,
      runsFlaky,
      runsFailed,
      lastSeen,
      history,
    });
  }
  list.sort((a, b) => b.lastSeen - a.lastSeen || b.runsFailed - a.runsFailed || b.runsFlaky - a.runsFlaky || a.title.localeCompare(b.title));
  return { list, runs: files };
}

if (process.argv[1] && /flaky-report\.mjs$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--')) || 'site/metrics/tests';
  const win = args.includes('--window') ? Number(args[args.indexOf('--window') + 1]) : 10;
  const wf = args.includes('--workflow') ? args[args.indexOf('--workflow') + 1] : null;
  const { list, runs } = flakyList(dir, win, wf);
  console.log(`Flaky or failing in the last ${runs.length} runs (${runs[0] ?? '–'}…${runs[runs.length - 1] ?? '–'}): ${list.length}`);
  for (const f of list) console.log(`- ${f.title}\n  ${f.file}  ${f.history.join(' ')}  flaky ${f.runsFlaky}  failed ${f.runsFailed}  last seen run ${f.lastSeen}`);
}
