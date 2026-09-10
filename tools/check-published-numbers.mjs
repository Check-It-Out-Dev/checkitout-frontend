#!/usr/bin/env node
/**
 * Every number this repository publishes about itself, checked against one
 * measured file.
 *
 * The failure this prevents has happened twice, in both directions. The live
 * site claimed 216 generated models and 74 services against a directory holding
 * 181 and 41 — inflated, and contradicting the README on the same page load.
 * It also claimed 949 Jest tests against a suite that had grown to 1,141 —
 * deflated, and undersold. Both were typed once and never had any relationship
 * to the repository afterwards.
 *
 * No existing gate could catch either. `check:i18n-parity` proves the two
 * locales agree with EACH OTHER; 216 and 181 are both valid strings and both
 * present in both files. Nothing compared either to the code.
 *
 * The measured numbers live in `docs/testing/measured-counts.json`, written by
 * `npm run measure:counts`, which asks the runners. This script compares every
 * published copy against that file in a few milliseconds, so it can run on
 * every commit. Together: the slow measurement is deliberate, the fast check is
 * automatic, and drift is caught at whichever end moves first.
 *
 * Adding a test now fails this gate until the surfaces are updated. That is the
 * intent — a test count that nobody has to maintain is a test count nobody can
 * trust.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTS = join(REPO_ROOT, 'docs', 'testing', 'measured-counts.json');

const read = (p) => readFileSync(join(REPO_ROOT, p), 'utf8');
const write = (p, text) => writeFileSync(join(REPO_ROOT, p), text);

/**
 * `--fix` writes the measured value into every surface that disagrees.
 *
 * Forty-eight figures across a README, a docs index, two locale files and a component is not an
 * edit anyone performs accurately by hand, and the alternative -- leaving them stale -- is the
 * failure this gate exists to stop. The gate already knows, for each figure, which file it is in
 * and which capture group holds it, so it can put the number back where it found the old one.
 *
 * It rewrites ONLY the captured digits, never the sentence around them, and it keeps the
 * separator style it found: "1,884" becomes "1,912" and "1 884" becomes "1 912", because those
 * two are different languages' typography rather than a formatting accident. A claim the pattern
 * no longer matches at all is never fixed -- that one means the sentence was reworded and the gate
 * has stopped guarding anything, which a human has to look at.
 */
const FIX = process.argv.includes('--fix');
const fixes = [];

/**
 * The measured number, wearing the separators the published one wore.
 *
 * Only for numbers. A measurement date is a value too, and stripping its punctuation the way a
 * thousands separator is stripped turned "2026-09-08" into "20260910" on the first run of this.
 */
function likeOriginal(original, measured) {
  if (!/^[\d,   .]+$/.test(String(measured))) return String(measured);
  const plain = String(measured).replace(/[^\d.]/g, '');
  const sep = /(\d)([,\u00a0\u202f ])(\d)/.exec(original);
  if (!sep) return plain;
  return plain.replace(/\B(?=(\d{3})+(?!\d))/g, sep[2]);
}

/**
 * Replace one capture group in `text`, by index rather than by another search: two figures in one
 * sentence can be the same digits, and a naive replace would rewrite the wrong one.
 */
function replaceGroup(text, pattern, groupIndex, measured) {
  const withIndices = new RegExp(pattern.source, pattern.flags.includes('d') ? pattern.flags : pattern.flags + 'd');
  const found = withIndices.exec(text);
  if (!found || !found.indices || !found.indices[groupIndex]) return null;
  const [start, end] = found.indices[groupIndex];
  return text.slice(0, start) + likeOriginal(found[groupIndex], measured) + text.slice(end);
}

let m;
try {
  m = JSON.parse(readFileSync(COUNTS, 'utf8'));
} catch {
  console.error('check:published-numbers — no measured counts to check against.\n');
  console.error(`   Expected ${relative(REPO_ROOT, COUNTS)}.`);
  console.error('   Fix:\n      npm run measure:counts\n');
  process.exit(1);
}

const jest = m.jest.tests;
const { distinct } = m.playwright;
const t = m.playwright.tiers;
const p = m.playwright.projects;
/**
 * The estate figure the site shows is both repositories added together. The
 * backend half cannot be measured from here, so it is a DECLARED input in the
 * measured file, carrying the command that produced it. Declaring it does not
 * make it true — but it does make the arithmetic checkable, and the arithmetic
 * is what silently broke: four tests were added here and the combined figure
 * two pages away kept its old value.
 */
const estateTotal = m.total + m.siblings.backend.testMethods;

/**
 * Numbers are written for people, so the same value appears as "1142", "1,142"
 * and "1 142" (Polish uses a space, and the source files use a real non-breaking
 * one). Compare the digits, not the typography.
 */
const digits = (s) => String(s).replace(/[\s,  ]/g, '');
const eq = (found, expected) => digits(found) === digits(expected);

const failures = [];
const checked = [];

/**
 * Assert one figure. `pattern` must capture the number in group 1 (or in the
 * groups named by `expect`, in order). A pattern that matches NOTHING is a
 * failure too — a published number that has been reworded out of existence is
 * how a gate silently stops guarding anything.
 */
function claim(file, label, pattern, expected) {
  const text = read(file);
  const want = Array.isArray(expected) ? expected : [expected];
  const found = text.match(pattern);
  if (!found) {
    failures.push({
      file,
      label,
      detail: `no longer matches ${pattern} — the sentence changed, so this gate stopped checking it`,
    });
    return;
  }
  want.forEach((w, i) => {
    const got = found[i + 1];
    if (!eq(got, w)) {
      if (FIX) {
        const rewritten = replaceGroup(read(file), pattern, i + 1, w);
        if (rewritten != null) {
          write(file, rewritten);
          fixes.push(`${file} · ${label}${want.length > 1 ? ` [${i + 1}]` : ''}: ${got} -> ${w}`);
          // Still a checked figure: G15 asserts checked + failures + 1, and a fixed claim that
          // counted as neither would make this gate rewrite its own total to a smaller number.
          checked.push(`${file} · ${label}`);
          return;
        }
      }
      failures.push({
        file,
        label: `${label}${want.length > 1 ? ` [${i + 1}]` : ''}`,
        got,
        want: w,
      });
    } else {
      checked.push(`${file} · ${label}`);
    }
  });
}

/**
 * The same, for a dotted path into a JSON translation file. Values there are
 * whole phrases ("10 728 tests", "10 728 testów"), so the first number in the
 * string is the claim and the rest is grammar.
 */
function claimJson(file, path, expected) {
  const doc = JSON.parse(read(file));
  const raw = path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);
  if (raw == null) {
    failures.push({ file, label: path, detail: 'key is gone' });
    return;
  }
  const found = String(raw).match(/\d[\d\s, ]*/);
  if (!found) {
    failures.push({ file, label: path, detail: `no number in ${JSON.stringify(raw)}` });
    return;
  }
  if (!eq(found[0], expected)) {
    if (FIX && fixJsonString(file, String(raw), found[0], likeOriginal(found[0], expected))) {
      fixes.push(`${file} · ${path}: ${found[0].trim()} -> ${expected}`);
      checked.push(`${file} · ${path}`);
      return;
    }
    failures.push({ file, label: path, got: String(raw).trim(), want: expected });
  } else {
    checked.push(`${file} · ${path}`);
  }
}

/**
 * Rewrite one number inside one translation string, in the raw file text.
 *
 * Through JSON.parse/stringify it would be one line of code and a four-thousand-line diff: these
 * locale files are hand-formatted and hold every string the application says. So the edit is made
 * on the text, keyed on the escaped form of the whole value, and it is refused unless that value
 * occurs EXACTLY once -- two keys sharing a phrase would otherwise have the wrong one rewritten.
 */
function fixJsonString(file, value, oldNumber, newNumber) {
  // The number pattern is greedy about trailing separators, so "10 792 testow" matches
  // "10 792 " with the space that belongs to the next word. Replacing that span would delete it:
  // the first run of this produced "10 820testow". Only the digits are the claim.
  oldNumber = oldNumber.replace(/[\s,  ]+$/, '');
  const text = read(file);
  const encoded = JSON.stringify(value);
  if (text.split(encoded).length !== 2) return false;
  const updated = JSON.stringify(value.replace(oldNumber, newNumber));
  write(file, text.replace(encoded, updated));
  return true;
}

/** A date inside a translated sentence — a stale date is a quieter lie than a stale number. */
function claimJsonDate(file, path, expected) {
  const doc = JSON.parse(read(file));
  const raw = path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);
  const found = String(raw ?? '').match(/\d{4}-\d{2}-\d{2}/);
  if (!found) failures.push({ file, label: path, detail: 'no date in the sentence' });
  else if (found[0] !== expected) {
    if (FIX && fixJsonString(file, String(raw), found[0], expected)) {
      fixes.push(`${file} · ${path}: ${found[0]} -> ${expected}`);
      checked.push(`${file} · ${path} (date)`);
    } else {
      failures.push({ file, label: path, got: found[0], want: expected });
    }
  } else checked.push(`${file} · ${path} (date)`);
}

// ── README.md ───────────────────────────────────────────────────────────────
claim('README.md', 'tests badge', /badge\/tests-(\d+)-/, m.total);
claim('README.md', 'headline total', /\*\*([\d,]+) tests across nine tiers/, m.total);
claim(
  'README.md',
  'headline breakdown',
  /([\d,]+) Jest · ([\d,]+) BDD scenarios · ([\d,]+) live-backend integration · ([\d,]+) visual · ([\d,]+) experience/,
  [jest, p.bdd, t.integration, t.visual, p.perf],
);
claim('README.md', 'offline subset', /\*\*([\d,]+) of the ([\d,]+) tests\*\*/, [
  m.offline,
  m.total,
]);
claim('README.md', 'pyramid arithmetic', /([\d,]+) Jest \+ ([\d,]+) Playwright = ([\d,]+) tests/, [
  jest,
  distinct,
  m.total,
]);
claim('README.md', 'npm test line', /npm test\s+# ([\d,]+) Jest unit/, jest);
claim(
  'README.md',
  'integration line',
  /npm run test:integration\s+# ([\d,]+) live-backend/,
  t.integration,
);

// The four remaining literal copies in the README. They are prose rather than a
// table, which is exactly why they were the ones left behind the last time.
claim('README.md', 'prose total', /\*\*([\d,]+) tests\.\*\* Five layers/, m.total);
claim('README.md', 'in-progress · integration row', /\| ([\d,]+) live-backend integration tests/, t.integration);
claim(
  'README.md',
  'in-progress · visual row',
  /\| ([\d,]+) visual snapshots over ([\d,]+) fixtures \+ ([\d,]+) parity diffs/,
  [t.visual, m.gates.visualFixtures, t.visualParity],
);
claim('README.md', 'in-progress · experience row', /Experience tier — ([\d,]+) measurements/, p.perf);
claim('README.md', 'roadmap row', /\| ([\d,]+) Jest unit \+ component tests/, jest);
claim('README.md', 'sandbox line', /npm run test:sandbox\s+# ([\d,]+) component-sandbox/, t.sandbox);
claim('README.md', 'perf line', /npm run test:perf\s+# ([\d,]+) experience/, p.perf);
claim('README.md', 'pyramid suites', /│ {2,}(\d+) suites/, m.jest.suites);
// Two figures this gate was standing next to without checking. The badge-note total was even
// written into this file's own pattern as a literal, so it would have reported "the measurement
// date is gone" the first time the count moved -- a gate that stops guarding and blames the
// sentence. Found by running --fix and reading the diff: every other total on the page changed
// and these two did not.
claim(
  'README.md',
  'badge note total',
  /the test count is static — ([\d,]+) across every tier/,
  m.total,
);
claim('README.md', 'pyramid · L2 component', /never HTTP {2,}│ {2,}([\d,]+) tests/, jest);
// The docs index repeats one figure; it was the one place G15 did not look, and it was stale.
claim('docs/README.md', 'docs index Jest', /the ([\d,]+) Jest tests and the gate wall/, jest);
// The CI table's measured duration — asked of GitHub by measure:counts, kept with its own date.
if (m.ci?.prRun) {
  // The CI/CD table rounds to the nearest ten seconds - a median that moves by four seconds is not a
  // change anyone should have to edit a README for - so the gate rounds the measured value the same way.
  claim('README.md', 'PR run duration', /\|\s*~(\d+) s\s*\|/, String(Math.round(m.ci.prRun.medianSeconds / 10) * 10));
}

// ── The live site. Numbers appear in both locales and must agree with the repo,
//    not merely with each other — which is all check:i18n-parity can prove. ──
for (const locale of ['en', 'pl']) {
  const f = `src/assets/i18n/${locale}.json`;
  claimJson(f, 'landing.survey.testing.feTiers.unit.count', jest);
  claimJson(f, 'landing.survey.testing.feTiers.visual.count', t.visual);
  claimJson(f, 'landing.survey.testing.feTiers.integration.count', t.integration);
  // The estate total is FE + BE, and the BE half cannot be measured from this
  // repository — it is carried in the measured file as a declared input with
  // its provenance, so at least the ARITHMETIC is checkable. The failure this
  // catches is real and just happened: four tests were added here and the
  // combined figure two pages away stayed at its old value.
  claimJson(f, 'landing.survey.hub.map.proof.tests.t', estateTotal);
  // The entry page's repository badges and CI card (2026-09). The frontend badge
  // quotes the total; the backend badge quotes the declared sibling figure; the
  // PR-run row quotes the Jest count and the measured median duration.
  claimJson(f, 'landing.survey.estate.repos.frontend.figure', m.total);
  claimJson(f, 'landing.survey.estate.repos.backend.figure', m.siblings.backend.testMethods);
  claimJson(f, 'landing.survey.pipelines.runs.pr.what', jest);
  if (m.ci?.prRun) {
    claimJson(f, 'landing.survey.pipelines.runs.pr.figure', m.ci.prRun.medianSeconds);
    claimJsonDate(f, 'landing.survey.pipelines.note', m.ci.prRun.measuredAt);
  }
}

// ── Coverage, published four ways. The percentages barely move; the raw counts
//    move with every test, and two of them were already one and two behind. ──
const c = m.coverage;
// The coverage badge reads from the quality dashboard now, so there is no number in the file to gate -
// and nothing to go stale. What IS worth asserting is that it still points at this repository's badge.
claim('README.md', 'coverage badge is live',
  /img\.shields\.io\/endpoint\?url=https:\/\/check-it-out-dev\.github\.io\/(checkitout-frontend)\/badges\/coverage\.json/,
  'checkitout-frontend');
for (const [row, key] of [
  ['Lines', 'lines'],
  ['Statements', 'statements'],
  ['Branches', 'branches'],
  ['Functions', 'functions'],
]) {
  claim(
    'README.md',
    `coverage row · ${row}`,
    new RegExp(String.raw`\*\*${row}\*\*\s*\|[^|]*?\*\*([\d.]+) %\*\* \((\d+) / (\d+)\)`),
    [c[key].pct.toFixed(2), c[key].covered, c[key].total],
  );
}

// ── The date the page claims its numbers were measured on. A stale date is a
//    quieter lie than a stale number and outlives it. ───────────────────────
for (const [label, pattern] of [
  ['badge note', /the test count is static — [\d,]+ across every tier, measured (\d{4}-\d{2}-\d{2})/],
  ['page note', /was measured on \*\*(\d{4}-\d{2}-\d{2})\*\*/],
  ['coverage note', /Measured (\d{4}-\d{2}-\d{2})\. Coverage excludes/],
]) {
  const found = read('README.md').match(pattern);
  if (!found) failures.push({ file: 'README.md', label, detail: 'the measurement date is gone' });
  else if (found[1] !== m.measuredAt) {
    const rewritten = FIX ? replaceGroup(read('README.md'), pattern, 1, m.measuredAt) : null;
    if (rewritten != null) {
      write('README.md', rewritten);
      fixes.push(`README.md · ${label}: ${found[1]} -> ${m.measuredAt}`);
      checked.push(`README.md · ${label}`);
    } else {
      failures.push({ file: 'README.md', label, got: found[1], want: m.measuredAt });
    }
  } else checked.push(`README.md · ${label}`);
}

// ── The gate table. Each row quotes its gate's headline number, and every one
//    of those was copied out of a terminal on the day the row was written. The
//    i18n one was already wrong by six keys before this check existed. ───────
const g = m.gates;
claim(
  'README.md',
  'G3 · i18n keys and templates',
  /different key sets — (\d+) keys and (\d+) templates/,
  [g.i18nKeys, g.i18nTemplates],
);
claim(
  'README.md',
  'G4 · registered fixtures',
  /— (\d+)\/\d+ registered and captured/,
  g.visualFixtures,
);
claim(
  'README.md',
  'G6 · specs citing a feature',
  /— (\d+)\/\d+ cite theirs/,
  g.integrationSpecsCiting,
);
claim(
  'README.md',
  'G7 · corpus completeness',
  /— (\d+) accounted for, (\d+) ported, (\d+) waived/,
  [g.bdd.beFeatures, g.bdd.ported, g.bdd.waived],
);
claim('README.md', 'G9 · contract coverage', /— (\d+)\/(\d+) proven, (\d+) waived with reasons/, [
  g.contractCoverage.proven,
  g.contractCoverage.wrappers,
  g.contractCoverage.waived,
]);
// ── The one component that hard-codes them. It drifted furthest: 216/74. ────
claim(
  'src/app/feature/survey/showcases/contract-pipeline-showcase.component.ts',
  'generated client',
  /(\d+) generated models \+ (\d+) services/,
  [m.generatedClient.models, m.generatedClient.services],
);

// ── The gate's own row, which quotes how many figures it checks. Asserted last
//    because the answer is the length of everything above. It is stable until
//    someone adds a claim — which is exactly when the row should be rewritten,
//    and exactly when this fails. ───────────────────────────────────────────
{
  // +1 for this row itself, so the number the README states and the number the
  // success line prints are the same number. A count that excluded itself would
  // be off by one against the summary two lines below, which is precisely the
  // kind of small disagreement this whole gate exists to make impossible.
  const asserted = checked.length + failures.length + 1;
  const found = read('README.md').match(/disagreeing with the measured one — (\d+) figures/);
  if (!found) {
    failures.push({
      file: 'README.md',
      label: 'G15 · figures this gate checks',
      detail: 'the row no longer states a count',
    });
  } else if (Number(found[1]) !== asserted) {
    // --fix reaches this row too: it is the one figure that changes whenever a claim is ADDED
    // rather than whenever the code changes, so leaving it out would make every new claim a
    // two-step edit and, the second time, an ignored red line.
    const rewritten = FIX
      ? replaceGroup(read('README.md'), /disagreeing with the measured one — (\d+) figures/, 1, asserted)
      : null;
    if (rewritten != null) {
      write('README.md', rewritten);
      fixes.push(`README.md · G15 · figures this gate checks: ${found[1]} -> ${asserted}`);
      checked.push('README.md · G15 · figures this gate checks');
    } else {
      failures.push({
        file: 'README.md',
        label: 'G15 · figures this gate checks',
        got: found[1],
        want: asserted,
      });
    }
  } else {
    checked.push('README.md · G15 · figures this gate checks');
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
if (fixes.length) {
  console.log(`check:published-numbers --fix — rewrote ${fixes.length} figure(s):`);
  console.log('');
  for (const f of fixes) console.log(`   ${f}`);
  console.log('');
  console.log('Re-run without --fix to confirm, and read the diff: the gate rewrote numbers,');
  console.log('it did not check whether the sentences around them are still true.');
  console.log('');
}
if (failures.length === 0) {
  console.log(
    `check:published-numbers OK — ${checked.length} published figures match ` +
      `docs/testing/measured-counts.json (measured ${m.measuredAt}).`,
  );
  process.exit(0);
}

console.error(`check:published-numbers FAILED — ${failures.length} figure(s) disagree.\n`);
for (const f of failures) {
  console.error(`   ${f.file}`);
  console.error(`     ${f.label}`);
  if (f.detail) console.error(`       ${f.detail}`);
  else console.error(`       published ${f.got}, measured ${f.want}`);
}
console.error(`
Fix:
   npm run measure:counts        # re-ask the runners, if the code changed
   npm run check:published-numbers -- --fix   # write the measured values into the surfaces
   …then read the diff. --fix rewrites the digits, never the sentence around them,
   and never a claim whose pattern stopped matching — that one is a reworded
   sentence, and it needs a person.

Both halves matter. If the code changed, the surfaces are stale. If the code
did not, then a published number was typed rather than measured, which is the
whole failure this gate exists to stop.
`);
process.exit(1);
