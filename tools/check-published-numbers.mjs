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
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTS = join(REPO_ROOT, 'docs', 'testing', 'measured-counts.json');

const read = (p) => readFileSync(join(REPO_ROOT, p), 'utf8');

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
    failures.push({ file, label: path, got: String(raw).trim(), want: expected });
  } else {
    checked.push(`${file} · ${path}`);
  }
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
claim('README.md', 'clean-clone total', /the ([\d,]+) tests, on a clean clone/, m.total);
claim('README.md', 'pyramid L1/L2 label', /L1 · L2 — ([\d,]+) Jest tests/, jest);
claim('README.md', 'roadmap row', /\| ([\d,]+) Jest unit \+ component tests/, jest);

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
}

// ── Coverage, published four ways. The percentages barely move; the raw counts
//    move with every test, and two of them were already one and two behind. ──
const c = m.coverage;
claim('README.md', 'coverage badge', /badge\/lines_covered-([\d.]+)%25/, c.lines.pct.toFixed(1));
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
  ['badge note', /badges are static, measured (\d{4}-\d{2}-\d{2}),/],
  ['page note', /was measured on \*\*(\d{4}-\d{2}-\d{2})\*\*/],
  ['coverage note', /Measured (\d{4}-\d{2}-\d{2})\. Coverage excludes/],
]) {
  const found = read('README.md').match(pattern);
  if (!found) failures.push({ file: 'README.md', label, detail: 'the measurement date is gone' });
  else if (found[1] !== m.measuredAt)
    failures.push({ file: 'README.md', label, got: found[1], want: m.measuredAt });
  else checked.push(`README.md · ${label}`);
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
    failures.push({
      file: 'README.md',
      label: 'G15 · figures this gate checks',
      got: found[1],
      want: asserted,
    });
  } else {
    checked.push('README.md · G15 · figures this gate checks');
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
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
   …then update the surfaces above to the measured values.

Both halves matter. If the code changed, the surfaces are stale. If the code
did not, then a published number was typed rather than measured, which is the
whole failure this gate exists to stop.
`);
process.exit(1);
