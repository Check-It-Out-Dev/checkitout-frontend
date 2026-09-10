#!/usr/bin/env node
// Collapse the tag-filter noise in a Cucumber-per-suite JUnit tree, in place.
//
// Why. The backend runs one Failsafe execution per suite (RunAdminIT, RunSecurityIT, ...), and every one
// of them boots the whole feature corpus and reports EVERY scenario: the ones its tags select are
// executed, the rest are written out as <skipped/>. Fifteen suites therefore emit fifteen results for
// each scenario - one real, fourteen tag-filtered - and they are indistinguishable by identity, because
// JUnit's classname is the Gherkin feature name and only the <testsuite name> differs.
//
// Allure keys a test on classname + name, so it folds those fifteen into one test with fourteen
// "retries": a 277-scenario corpus is published as 165 tests with 165 retries, and the history and the
// flaky list built on top of that are noise.
//
// What this does. Drop a <testcase> only when it is skipped AND the same (classname, name) is executed
// in another file of the same tree. That is exactly the tag-filter duplicate. A scenario skipped
// everywhere - a real skip, an assumption that did not hold - is kept, in every file, so a suite that
// stops running something still says so.
//
// Usage: node junit-collapse-tag-skips.mjs <dir> [--glob TEST-*.xml] [--dry]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
const dry = argv.includes('--dry');
if (!dir) {
  console.error('usage: junit-collapse-tag-skips.mjs <dir> [--dry]');
  process.exit(2);
}

/** Every TEST-*.xml under dir, at any depth. */
const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/^TEST-.*\.xml$/.test(e)) out.push(p);
  }
  return out;
};

// One <testcase ...> element, with its body when it has one. Attributes are single- or double-quoted.
const TESTCASE = /<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/>|>[\s\S]*?<\/testcase>)/g;
const attr = (raw, name) => {
  const m = raw.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`));
  return m ? (m[2] ?? m[3]) : '';
};
const isSkipped = (body) => body !== '/>' && /<skipped\b/.test(body);
const key = (raw) => `${attr(raw, 'classname')} :: ${attr(raw, 'name')}`;

if (!existsSync(dir)) {
  // A tier that did not run leaves no directory. That is not an error here: the run simply has nothing
  // of this kind to collapse, and the metrics step is what decides whether a missing tier matters.
  console.log(`junit-collapse-tag-skips: no ${dir}, nothing to do`);
  process.exit(0);
}

const files = walk(dir);
if (!files.length) {
  console.log(`junit-collapse-tag-skips: no TEST-*.xml under ${dir}, nothing to do`);
  process.exit(0);
}

// Pass 1: which tests are executed somewhere?
const executed = new Set();
const texts = new Map();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  texts.set(f, text);
  for (const m of text.matchAll(TESTCASE)) if (!isSkipped(m[2])) executed.add(key(m[1]));
}

// Pass 2: drop the skipped duplicates of those.
let dropped = 0;
let kept = 0;
let touched = 0;
for (const f of files) {
  const text = texts.get(f);
  let fileDropped = 0;
  const next = text.replace(TESTCASE, (whole, raw, body) => {
    if (isSkipped(body) && executed.has(key(raw))) {
      fileDropped++;
      return '';
    }
    kept++;
    return whole;
  });
  if (!fileDropped) continue;
  dropped += fileDropped;
  touched++;
  // The counters in <testsuite> would otherwise disagree with the elements underneath.
  const fixed = next.replace(/<testsuite\b((?:[^>"']|"[^"]*"|'[^']*')*?)>/, (whole, raw) => {
    const cases = [...next.matchAll(TESTCASE)];
    const n = (name, pred) =>
      raw.includes(`${name}=`)
        ? whole.replace(new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`), `${name}="${cases.filter((c) => pred(c)).length}"`)
        : whole;
    let out = n('tests', () => true);
    const withCount = (src, name, pred) =>
      src.replace(new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`), `${name}="${cases.filter((c) => pred(c)).length}"`);
    out = withCount(out, 'skipped', (m) => isSkipped(m[2]));
    return out;
  });
  if (!dry) writeFileSync(f, fixed);
}

console.log(
  `junit-collapse-tag-skips: ${dropped} tag-filtered duplicate(s) dropped from ${touched} of ${files.length} file(s); ` +
    `${kept} result(s) kept${dry ? ' (dry run, nothing written)' : ''}`,
);
