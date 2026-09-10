#!/usr/bin/env node
/**
 * Hard gate (L3 completeness): every BE Cucumber feature file must be
 * re-proven through the FE-visible surface OR explicitly waived.
 *
 * This is the enforcement keystone of the layered test architecture
 * (docs/testing/LAYERED-TEST-ARCHITECTURE.md, slice 5). L3 already
 * requires each ported FE `.feature` to cite its BE source
 * (check:integration-cucumber-citation proves citations are VALID); this
 * gate proves the port set is COMPLETE — the BE corpus can't grow a new
 * feature that silently goes unported and unwaived.
 *
 * Pass criteria — for every BE feature under
 * `checkitout-backend/src/test/resources/features/**`, one of:
 *   - PORTED: some FE `e2e-tests/bdd/features/**` opens with
 *       `# Source of truth: checkitout-backend/src/test/resources/features/<path>`
 *   - WAIVED: `<path>` is listed under `## Waived` in
 *       `e2e-tests/bdd/CORPUS-WAIVERS.md`
 *
 * Also fails on a STALE waiver (a waived path that no longer exists in the
 * BE corpus) and a DOUBLE-COVER (a path both ported and waived) — keeps the
 * waiver file honest as the BE corpus moves.
 *
 * The BE repo is a sibling checkout; if it's absent (e.g. FE-only CI), the
 * gate self-skips with a notice rather than failing.
 *
 * Hooked into check:full + pre-commit.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BE_FEATURES_DIR = resolve(
  ROOT,
  '..',
  'checkitout-backend',
  'src',
  'test',
  'resources',
  'features',
);
const FE_FEATURES_DIR = join(ROOT, 'e2e-tests', 'bdd', 'features');
const WAIVERS_FILE = join(ROOT, 'e2e-tests', 'bdd', 'CORPUS-WAIVERS.md');

const CITATION_RE =
  /Source of truth:\s*checkitout-backend\/src\/test\/resources\/features\/(\S+\.feature)/i;

// Cross-repo gate: completeness is measured against the BE repo's feature
// corpus, which only exists as a sibling checkout on a dev machine. In CI
// (single-repo checkout) the comparison is impossible — skip loudly rather
// than fail on a missing sibling. Local runs keep full strictness.
try {
  await stat(BE_FEATURES_DIR);
} catch {
  console.log(
    'check:bdd-corpus SKIPPED — sibling checkitout-backend checkout not present ' +
      '(cross-repo gate; runs at full strictness locally and in the ' +
      'full-stack workflow).',
  );
  process.exit(0);
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.feature')) out.push(p);
  }
  return out;
}

const toPosix = (p) => p.split('\\').join('/');

async function main() {
  // BE corpus absent → self-skip (FE-only checkout).
  try {
    await stat(BE_FEATURES_DIR);
  } catch {
    console.log('check:bdd-corpus SKIP — BE feature dir not found (FE-only checkout).');
    return;
  }

  const beFiles = await walk(BE_FEATURES_DIR);
  const beRel = beFiles.map((f) => toPosix(relative(BE_FEATURES_DIR, f))).sort();

  // Ported: BE paths cited by FE feature headers.
  const feFiles = await walk(FE_FEATURES_DIR);
  const ported = new Set();
  for (const f of feFiles) {
    const head = (await readFile(f, 'utf8')).slice(0, 1200);
    const m = head.match(CITATION_RE);
    if (m) ported.add(toPosix(m[1]));
  }

  // Waived: paths under "## Waived" as `- \`path\` — …`.
  const waived = new Set();
  const waiverText = await readFile(WAIVERS_FILE, 'utf8').catch(() => '');
  const waivedSection = waiverText.split(/^##\s+Waived\s*$/m)[1] ?? '';
  for (const line of waivedSection.split('\n')) {
    const m = line.match(/^\s*-\s*`([^`]+\.feature)`/);
    if (m) waived.add(toPosix(m[1]));
  }

  const beSet = new Set(beRel);
  const missing = beRel.filter((p) => !ported.has(p) && !waived.has(p));
  const staleWaivers = [...waived]
    .filter((p) => !beSet.has(p))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const doubleCovered = [...waived]
    .filter((p) => ported.has(p))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const problems = [];
  if (missing.length) {
    problems.push(
      `${missing.length} BE feature(s) neither ported nor waived:\n` +
        missing.map((p) => `    - ${p}`).join('\n') +
        `\n  → port it (FE .feature with a "Source of truth:" header) or waive it in ${toPosix(relative(ROOT, WAIVERS_FILE))}.`,
    );
  }
  if (staleWaivers.length) {
    problems.push(
      `${staleWaivers.length} stale waiver(s) — path no longer in the BE corpus:\n` +
        staleWaivers.map((p) => `    - ${p}`).join('\n'),
    );
  }
  if (doubleCovered.length) {
    problems.push(
      `${doubleCovered.length} feature(s) both ported AND waived (remove the waiver):\n` +
        doubleCovered.map((p) => `    - ${p}`).join('\n'),
    );
  }

  if (problems.length) {
    console.error('check:bdd-corpus FAILED\n\n' + problems.join('\n\n'));
    process.exit(1);
  }

  console.log(
    `check:bdd-corpus OK — ${beRel.length} BE features accounted for ` +
      `(${ported.size} ported, ${waived.size} waived).`,
  );
}

main().catch((err) => {
  console.error('check:bdd-corpus ERROR', err);
  process.exit(1);
});
