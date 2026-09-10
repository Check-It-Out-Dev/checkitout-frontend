#!/usr/bin/env node
/**
 * One table for a night that ran seven tiers, and one word for whether the system is healthy.
 *
 * A nightly that publishes seven separate reports has the same problem as nine workflows firing on
 * every push: the answer to "is it healthy" becomes a research task, so nobody asks it. This reads
 * what the tiers left behind and says it once.
 *
 * Two distinctions it refuses to blur:
 *   - a tier that FAILED is different from one that was SKIPPED, and both differ from one that was
 *     CANCELLED. A cancelled tier means the night is incomplete and its verdict cannot be trusted;
 *     a skipped one may be perfectly deliberate.
 *   - a tier with no artifact is not a passing tier. Silence is reported as silence.
 *
 *   node tools/ci/nightly-verdict.mjs --needs '<json>' --results <dir> [--json out.json]
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const resultsDir = flag('results') || 'results';
const outPath = flag('json');

let needs = {};
let needsUnreadable = false;
try {
  needs = JSON.parse(flag('needs') || '{}');
} catch {
  // An unreadable needs context must never be read as "everything succeeded".
  needsUnreadable = true;
}

/** Every JSON file a tier left behind, shallow-searched; tiers name their own artifacts. */
function findJson(dir, depth = 3) {
  if (!existsSync(dir) || depth < 0) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) out.push(...findJson(p, depth - 1));
    else if (entry.endsWith('.json')) out.push(p);
  }
  return out;
}

const files = findJson(resultsDir);

/** Pull the numbers a human actually wants out of whatever shape a tier wrote. */
function harvest() {
  const facts = {};
  for (const f of files) {
    let d;
    try {
      d = JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      continue;
    }
    const name = f.replace(/\\/g, '/');
    // Playwright merged report, or our own summary.json shape
    const stats = d.stats || (d.tests && d.tests.total !== undefined ? null : null);
    if (stats && (stats.expected !== undefined || stats.unexpected !== undefined)) {
      facts.tests = facts.tests || { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
      facts.tests.expected += stats.expected || 0;
      facts.tests.unexpected += stats.unexpected || 0;
      facts.tests.flaky += stats.flaky || 0;
      facts.tests.skipped += stats.skipped || 0;
    }
    if (d.mutationScore !== undefined) facts.mutationScore = d.mutationScore;
    if (d.thresholds && d.metrics) facts.mutationScore = d.metrics.mutationScore ?? facts.mutationScore;
    if (d.categories) {
      // Lighthouse manifest or LHR
      facts.lighthouse = Object.fromEntries(
        Object.entries(d.categories).map(([k, v]) => [k, Math.round((v.score || 0) * 100)])
      );
    }
    if (/summary\.json$/.test(name) && d.verdict) facts.verdicts = [...(facts.verdicts || []), d.verdict];
  }
  return facts;
}

const facts = harvest();

const ORDER = ['browser', 'full-stack', 'kubernetes', 'lighthouse', 'contract', 'mutation', 'security'];
const rows = [];
let failed = 0;
let cancelled = 0;
for (const job of ORDER) {
  const result = needs[job]?.result;
  if (result === undefined) continue;
  if (result === 'failure') failed++;
  if (result === 'cancelled') cancelled++;
  rows.push({ job, result });
}
for (const [job, v] of Object.entries(needs)) {
  if (!ORDER.includes(job) && job !== 'verdict') rows.push({ job, result: v?.result });
}

const incomplete = cancelled > 0 || needsUnreadable;
const verdict = incomplete ? 'incomplete' : failed > 0 ? 'red' : 'green';

const icon = (r) =>
  ({ success: 'passed', failure: '**failed**', cancelled: '**cancelled**', skipped: 'skipped' }[r] || r || 'unknown');

const lines = [];
lines.push('### The night');
lines.push('');
lines.push(`**Verdict: ${verdict}.**` + (incomplete ? ' A cancelled tier means this run cannot be read as healthy.' : ''));
lines.push('');
lines.push('| tier | result |');
lines.push('| --- | --- |');
for (const r of rows) lines.push(`| ${r.job} | ${icon(r.result)} |`);
lines.push('');

if (facts.tests) {
  const t = facts.tests;
  lines.push(`Tests across the tiers that published a report: **${t.expected} passed**, ` +
    `${t.unexpected} unexpected, ${t.flaky} flaky, ${t.skipped} skipped.`);
  lines.push('');
}
if (facts.mutationScore !== undefined) {
  lines.push(`Mutation score: **${facts.mutationScore}%** — the share of deliberate defects the tests caught.`);
  lines.push('');
}
if (facts.lighthouse) {
  lines.push('Lighthouse: ' + Object.entries(facts.lighthouse).map(([k, v]) => `${k} ${v}`).join(' · '));
  lines.push('');
}
if (!files.length) {
  lines.push('_No tier published an artifact this run. That is reported as silence rather than as success._');
  lines.push('');
}

const out = lines.join('\n');
console.log(out);

if (outPath) {
  writeFileSync(outPath, JSON.stringify({
    verdict, failed, cancelled, rows, facts, artifactsSeen: files.length,
  }, null, 1));
}

// The verdict is the exit code: a red or incomplete night must not read as a green one.
process.exit(verdict === 'green' ? 0 : 1);
