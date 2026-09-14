#!/usr/bin/env node
/**
 * Joins the per-worker files written by tools/subsume/jest-probes.ts into two artifacts:
 *   reports/subsume/probes.jsonl  — one line per test: { test, spec, hits }
 *   reports/subsume/maps.json     — per instrumented file: statementMap / fnMap / branchMap
 * and prints what it found. The worker files are consumed: a run's records are merged once and
 * the next run starts clean — left in place, three armed runs on the box merged into 5,082
 * "tests" of a 1,302-test suite (2026-09-14), and a tally of the merged file counted them all.
 *
 *   node tools/subsume/merge-probes.mjs          # always reports/subsume under the working tree
 */
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The directory is fixed. Every caller — the workflows, the README — merges reports/subsume under
// the working tree; a directory taken from the command line was a path with questions attached.
const dir = join(process.cwd(), 'reports', 'subsume');
if (!existsSync(dir)) {
  console.error(`merge-probes: no ${dir} — run jest with --coverage first`);
  process.exit(2);
}
const names = readdirSync(dir);
const probeFiles = names.filter((n) => /^probes\.\d+\.jsonl$/.test(n)).sort();
const mapFiles = names.filter((n) => /^maps\.\d+\.jsonl$/.test(n)).sort();

const lines = [];
for (const name of probeFiles) {
  for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
    if (line.trim()) lines.push(line);
  }
}
const maps = {};
for (const name of mapFiles) {
  for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    maps[m.file] ??= { statementMap: m.statementMap, fnMap: m.fnMap, branchMap: m.branchMap };
  }
}
if (!probeFiles.length) {
  console.error(
    `merge-probes: no probes.<pid>.jsonl in ${dir} — was the run armed (SUBSUME_PROBES=1)?`,
  );
  process.exit(2);
}
writeFileSync(join(dir, 'probes.jsonl'), lines.join('\n') + (lines.length ? '\n' : ''));
writeFileSync(join(dir, 'maps.json'), JSON.stringify(maps));
for (const name of [...probeFiles, ...mapFiles]) unlinkSync(join(dir, name));

const kinds = { tests: 0, load: 0, final: 0 };
for (const l of lines) {
  if (l.startsWith('{"final":true')) kinds.final += 1;
  else if (l.includes(' :: (module load)"')) kinds.load += 1;
  else kinds.tests += 1;
}
console.log(
  `merge-probes: ${probeFiles.length} worker file(s), ${kinds.tests} tests + ${kinds.load} module-load + ${
    kinds.final
  } final records, ${Object.keys(maps).length} instrumented files -> ${join(dir, 'probes.jsonl')}`,
);
