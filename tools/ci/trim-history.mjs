#!/usr/bin/env node
/**
 * Keep an Allure 3 history file under a size budget by dropping its oldest runs.
 *
 * Allure 3's history is JSON-lines, one line per run, and each line carries `knownTestCaseIds` --
 * every test id in that run. The line is therefore as long as the suite is wide: about 1 MB for the
 * frontend's 1,600 tests and about 7 MB for the backend's 10,400. Nothing prunes it, so the file
 * grows by one line per run forever.
 *
 * The backend's reached 98.6 MiB and the next append crossed GitHub's 100 MB limit. The push was
 * refused, which took out the report, the dashboard's history and the metrics with it -- behind a
 * single red job at the end of an otherwise green pipeline, which is how a publish failure hides.
 *
 * A line cap was the obvious fix and the wrong one: `tail -n 20` on a file of roughly fifteen
 * enormous lines does nothing at all. The budget has to be in bytes, because bytes are what the
 * limit is about.
 *
 *   node tools/ci/trim-history.mjs <file> [--max-bytes 20971520] [--min-runs 2]
 *
 * Keeps the NEWEST runs that fit, always at least `--min-runs` of them so a trend still has two
 * points to draw, and rewrites the file in place. Says what it did, because a silent trim is
 * indistinguishable from a broken one.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};

// 20 MB: comfortably inside GitHub's 100 MB file limit even if a suite doubles, and small enough
// that every report job's `checkout ref: gh-pages` stays quick.
const maxBytes = flag('max-bytes', 20 * 1024 * 1024);
const minRuns = flag('min-runs', 2);

if (!file) {
  console.error('usage: trim-history.mjs <file> [--max-bytes N] [--min-runs N]');
  process.exit(2);
}

// Absent is not an error: the first run of a new report has no history yet.
if (!existsSync(file)) {
  console.log(`trim-history: ${file} does not exist yet — nothing to trim.`);
  process.exit(0);
}

const before = statSync(file).size;
const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// Walk from the newest backwards, taking runs while they fit.
const kept = [];
let bytes = 0;
for (let i = lines.length - 1; i >= 0; i--) {
  const size = Buffer.byteLength(lines[i], 'utf8') + 1;
  if (kept.length >= minRuns && bytes + size > maxBytes) break;
  kept.unshift(lines[i]);
  bytes += size;
}

if (kept.length === lines.length) {
  console.log(
    `trim-history: ${file} is ${mb(before)} across ${lines.length} run(s), inside the ` +
      `${mb(maxBytes)} budget — kept as is.`,
  );
  process.exit(0);
}

writeFileSync(file, kept.join('\n') + '\n');
const after = statSync(file).size;
// The floor wins over the budget: one run this large means a suite that outgrew the number, and
// saying so is more use than a message claiming it fits when it does not.
const verdict =
  after > maxBytes
    ? `still over the ${mb(maxBytes)} budget — --min-runs ${minRuns} kept them`
    : `under the ${mb(maxBytes)} budget`;
console.log(
  `trim-history: ${file} was ${mb(before)} across ${lines.length} run(s); kept the newest ` +
    `${kept.length} at ${mb(after)}, ${verdict}.`,
);
