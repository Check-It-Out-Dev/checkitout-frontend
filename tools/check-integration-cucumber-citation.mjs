#!/usr/bin/env node
/**
 * Hard gate: every integration spec MUST cite the BE Cucumber feature
 * file it ports. The FE integration tier is a 1:1 port of BE Cucumber
 * (memory `feedback_fe_integration_must_mirror_be_cucumber_1_to_1`);
 * "FE-only" canary tests are not allowed.
 *
 * The audit on 2026-05-12 confirmed the discipline holds today — every
 * existing spec opens with a `Source of truth:` docstring + per-test
 * `BE Scenario:` comments. This gate keeps that property mechanical
 * so the next PR can't silently break it.
 *
 * Pass criteria (per spec file):
 *   - Header contains "Source of truth:" pointing at a .feature path, OR
 *   - Header contains "BE Cucumber" / "BE Scenario:" / "Ported from"
 *
 * Exempt:
 *   - e2e-tests/integration/_trace/**  (Stage-5b trace library — internal
 *     test infrastructure, not a Cucumber port)
 *   - *.unit.spec.ts                   (jest unit tests, not Playwright)
 *
 * Hooked into pre-commit + the loop iteration body.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INTEGRATION_DIR = join(ROOT, 'e2e-tests', 'integration');
// The BDD (Cucumber-oracle) tier: each ported .feature must carry the same
// "Source of truth:" citation header pointing at its BE Cucumber source.
const BDD_FEATURES_DIR = join(ROOT, 'e2e-tests', 'bdd', 'features');

const CITATION_PATTERNS = [
  /Source of truth:/i,
  /BE Cucumber/i,
  /BE Scenario:/i,
  /Ported from/i,
  /\.feature\b/,
  // Explicit escape hatch for FE-only infrastructure flows. The marker
  // MUST include a one-line justification (audited by reviewers, not by
  // this gate). Examples that legitimately use it:
  //   - Stage 5b trace-equivalence (legacy↔greenfield comparison flows)
  //   - T3 route-smoke (Angular router/guard behavior, no BE equivalent)
  // If you find yourself reaching for this marker, ask: is the test really
  // FE-only, or could it be ported from an existing BE Cucumber scenario?
  /FE-only:/i,
];

const EXEMPT_DIRS = ['_trace'];
const EXEMPT_FILENAME_SUFFIX = '.unit.spec.ts';

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const p = join(dir, entry);
    const s = await stat(p);
    if (s.isDirectory()) {
      if (EXEMPT_DIRS.includes(entry)) continue;
      yield* walk(p);
    } else if (s.isFile() && entry.endsWith('.spec.ts') && !entry.endsWith(EXEMPT_FILENAME_SUFFIX)) {
      yield p;
    }
  }
}

async function* walkFeatures(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return; // BDD tier not present yet — nothing to check.
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    const s = await stat(p);
    if (s.isDirectory()) yield* walkFeatures(p);
    else if (s.isFile() && entry.endsWith('.feature')) yield p;
  }
}

const violations = [];
let scanned = 0;

for await (const path of walk(INTEGRATION_DIR)) {
  scanned++;
  const content = await readFile(path, 'utf8');
  // Only check the first 100 lines — the citation belongs in the header.
  const header = content.split('\n').slice(0, 100).join('\n');
  const ok = CITATION_PATTERNS.some((re) => re.test(header));
  if (!ok) {
    violations.push(relative(ROOT, path));
  }
}

for await (const path of walkFeatures(BDD_FEATURES_DIR)) {
  scanned++;
  const content = await readFile(path, 'utf8');
  const header = content.split('\n').slice(0, 100).join('\n');
  const ok = CITATION_PATTERNS.some((re) => re.test(header));
  if (!ok) {
    violations.push(relative(ROOT, path));
  }
}

if (violations.length > 0) {
  console.error(`Integration BE-Cucumber citation check: ${violations.length} violation(s) ✗`);
  console.error('');
  console.error('Every integration spec must cite the BE Cucumber feature it ports.');
  console.error('Add a header docstring matching one of:');
  console.error('  - "Source of truth: src/test/resources/features/<name>.feature"');
  console.error('  - "BE Cucumber: <feature-name>"');
  console.error('  - "Ported from <feature-name>"');
  console.error('  - A direct reference to a .feature path');
  console.error('');
  console.error('Memory: feedback_fe_integration_must_mirror_be_cucumber_1_to_1');
  console.error('');
  console.error('Violations:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log(`Integration BE-Cucumber citation check: ${scanned}/${scanned} specs cite source ✓`);
