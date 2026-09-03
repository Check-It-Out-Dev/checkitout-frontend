#!/usr/bin/env node
/**
 * Hard gate: every fixture registered in src/app/sandbox/fixtures/*.ts
 * must appear in the visual snapshot spec's FIXTURES list — OR be
 * explicitly listed in EXCLUDED below with a one-line reason.
 *
 * The visual spec deliberately hardcodes its FIXTURES list (rather
 * than reading SANDBOX_REGISTRY at runtime) so visual diffs are
 * predictable when registry order shifts. That choice is correct,
 * but it created a silent-drift hazard: adding a new fixture to the
 * registry without adding it to FIXTURES means the new state ships
 * with no visual coverage.
 *
 * Caught 2026-05-10: opportunities-list-loading, profile-loading,
 * and verify-email-verifying were all registered but missing from
 * FIXTURES. Loading-state regressions on those screens would have
 * shipped silently.
 *
 * Hooked into pre-commit + npm run check:full.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = join(REPO_ROOT, 'src/app/sandbox/fixtures');
const VISUAL_SPEC = join(REPO_ROOT, 'e2e-tests/visual/sandbox-snapshots.spec.ts');
const SNAPSHOT_DIR = join(REPO_ROOT, 'e2e-tests/visual/sandbox-snapshots.spec.ts-snapshots');
// Engines the spec actually runs on (matches test.beforeEach skip).
const ENGINES = ['chromium-desktop', 'mobile-chrome'];
const PLATFORMS = ['win32', 'linux', 'darwin'];

// Fixtures that exist in the registry but are intentionally NOT in the
// visual FIXTURES list. Add an entry here (with a reason) to silence
// the gate for a fixture that doesn't need a visual baseline.
const EXCLUDED = new Set([
  // example: 'fixture-id', // reason it doesn't need a visual snapshot
  'company-setup-preview-interactive', // interactive stub for manual sandbox exploration; initial render duplicates company-setup-idle
  'company-setup-duplicate-interactive', // interactive stub (form-driven 409 path); initial render duplicates company-setup-idle
]);

const idRe = /id:\s*'([a-z][a-z0-9-]+)'/g;

function extractFixtureIds() {
  const ids = new Set();
  for (const entry of readdirSync(FIXTURES_DIR)) {
    if (!entry.endsWith('.fixture.ts')) continue;
    const text = readFileSync(join(FIXTURES_DIR, entry), 'utf8');
    let m;
    while ((m = idRe.exec(text)) !== null) {
      // Filter out route-param-id false positives like `id: '42'`.
      // Real fixture ids start with a lowercase letter and contain a hyphen
      // (or are a single multi-character word matching a known component).
      // The id regex above already requires `[a-z]` start; combine with
      // the heuristic that fixture IDs come from a `SandboxFixture` literal
      // — those have `label:` on the next non-blank line.
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
      if (/^\s*,?\s*label:\s*'/.test(after)) {
        ids.add(m[1]);
      }
    }
  }
  return ids;
}

function extractFixturesListIds() {
  const text = readFileSync(VISUAL_SPEC, 'utf8');
  // Find the FIXTURES = [ ... ] block, extract every quoted string inside.
  const match = text.match(/const FIXTURES\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (!match) {
    console.error(`could not locate FIXTURES = [...] in ${VISUAL_SPEC}`);
    process.exit(2);
  }
  const ids = new Set();
  const inner = match[1];
  for (const m of inner.matchAll(/'([a-z][a-z0-9-]+)'/g)) {
    ids.add(m[1]);
  }
  return ids;
}

function hasBaseline(id) {
  for (const engine of ENGINES) {
    for (const platform of PLATFORMS) {
      if (existsSync(join(SNAPSHOT_DIR, `${id}-${engine}-${platform}.png`))) return true;
    }
  }
  return false;
}

const registryIds = extractFixtureIds();
const fixturesIds = extractFixturesListIds();

const missing = [...registryIds].filter((id) => !fixturesIds.has(id) && !EXCLUDED.has(id));
const stale = [...fixturesIds].filter((id) => !registryIds.has(id));
const noBaseline = [...fixturesIds].filter((id) => !hasBaseline(id));

if (missing.length === 0 && stale.length === 0 && noBaseline.length === 0) {
  console.log(
    `Visual fixture coverage: ${registryIds.size}/${registryIds.size} registered → in FIXTURES → with baseline ✓`,
  );
  process.exit(0);
}

if (missing.length > 0) {
  console.error(`Visual fixture coverage FAILED — ${missing.length} registered fixture(s) missing from ${VISUAL_SPEC}:\n`);
  for (const id of missing) console.error(`    ${id}`);
  console.error(
    `\nFix: add the IDs to the FIXTURES array in ${VISUAL_SPEC} and run\n` +
      `  npx playwright test e2e-tests/visual --grep "${missing.join('|')}" --update-snapshots\n` +
      `to capture baselines. If a fixture genuinely doesn't need a baseline\n` +
      `(rare), add it to the EXCLUDED set in tools/check-visual-fixture-coverage.mjs\n` +
      `with a one-line reason.`,
  );
}

if (stale.length > 0) {
  console.error(`\nFIXTURES references ${stale.length} id(s) not in any *.fixture.ts file:\n`);
  for (const id of stale) console.error(`    ${id}`);
  console.error(`Either restore the fixture or remove the FIXTURES entry.`);
}

if (noBaseline.length > 0) {
  console.error(
    `\n${noBaseline.length} fixture(s) in FIXTURES have no baseline PNG under ${SNAPSHOT_DIR}/:\n`,
  );
  for (const id of noBaseline) console.error(`    ${id}`);
  console.error(
    `\nFix: capture baselines for the missing fixtures:\n` +
      `  npx playwright test e2e-tests/visual --grep "${noBaseline.join('|')}" --update-snapshots\n` +
      `then commit the new PNG files.`,
  );
}

process.exit(1);
