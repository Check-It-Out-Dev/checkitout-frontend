#!/usr/bin/env node
/**
 * The instrument checked against itself: for every spec file, the union of its per-test hits
 * (plus the module-load record) must equal the totals the same environment reported when the
 * file finished — statements, functions and branch paths that ended above zero. Both numbers
 * come from the same counters in the same coordinate system, so any disagreement is a counter
 * the hook lost or invented, and the subsumption analysis built on it would be wrong before it
 * started. (istanbul's own summary is source-mapped back to TypeScript and counts a different
 * set of statements; it is not the reference here.)
 *
 *   node tools/subsume/check-probes.mjs [--probes reports/subsume/probes.jsonl]
 * Exit 0 when every spec agrees, 1 otherwise (each disagreeing spec/file is printed).
 */
import { readFileSync } from 'node:fs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const probesPath = arg('probes', 'reports/subsume/probes.jsonl');

const union = {}; // spec -> file -> { s:Set, f:Set, b:Set }
const finals = {}; // spec -> file -> { s, f, b }
let tests = 0;
for (const line of readFileSync(probesPath, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const rec = JSON.parse(line);
  if (rec.final) {
    finals[rec.spec] = rec.totals;
    continue;
  }
  if (!rec.test.endsWith(' :: (module load)')) tests += 1;
  const perFile = (union[rec.spec] ??= {});
  for (const [file, h] of Object.entries(rec.hits)) {
    const u = (perFile[file] ??= { s: new Set(), f: new Set(), b: new Set() });
    h.s.forEach((id) => u.s.add(id));
    h.f.forEach((id) => u.f.add(id));
    h.b.forEach(([id, i]) => u.b.add(`${id}:${i}`));
  }
}

let specs = 0;
let bad = 0;
for (const [spec, totals] of Object.entries(finals)) {
  specs += 1;
  const got = union[spec] ?? {};
  const files = new Set([...Object.keys(totals), ...Object.keys(got)]);
  let ok = true;
  for (const file of files) {
    const t = totals[file] ?? { s: 0, f: 0, b: 0 };
    const u = got[file] ?? { s: new Set(), f: new Set(), b: new Set() };
    const have = { s: u.s.size, f: u.f.size, b: u.b.size };
    const diffs = ['s', 'f', 'b'].filter((k) => have[k] !== t[k]);
    if (diffs.length) {
      ok = false;
      console.log(
        `MISMATCH ${spec} -> ${file}: ` +
          diffs.map((k) => `${k} union=${have[k]} final=${t[k]}`).join(', '),
      );
    }
  }
  if (!ok) bad += 1;
}
const specsWithoutFinal = Object.keys(union).filter((s) => !finals[s]).length;
if (specsWithoutFinal)
  console.log(`WARN ${specsWithoutFinal} spec(s) have hits but no final record`);
console.log(`check-probes: ${specs - bad}/${specs} specs self-consistent; ${tests} tests recorded`);
process.exit(bad || specsWithoutFinal ? 1 : 0);
