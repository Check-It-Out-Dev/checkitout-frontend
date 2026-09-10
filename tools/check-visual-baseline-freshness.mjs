#!/usr/bin/env node
/**
 * Hard gate (G5): the sandbox-snapshot baselines must be at least as
 * fresh as the component sources whose UI they capture. If a
 * `*.component.html` (or `.ts` / `.scss`) is newer than the last
 * regen-tag timestamp, the byte-stable visual coverage is silently
 * invalid — the next intentional UI change would not be caught.
 *
 * Caught 2026-05-12 by an opus-code-crawler audit: the editorial-sweep
 * arc (~12dcdc3..0b34a80 + theme refactor) touched 27 component
 * templates without regenerating the byte-stable sandbox snapshots.
 * Coverage erosion was invisible because no gate flagged it.
 *
 * Design: SINGLE regen-tag file at
 * `e2e-tests/visual/sandbox-snapshots.spec.ts-snapshots/.last-regen.txt`.
 * Whenever `npm run test:visual:update` runs, the wrapper script
 * rewrites that file to the current ISO timestamp. The gate then
 * compares the freshest source mtime against the tag mtime.
 *
 * Why a single tag (not per-baseline mtime)? Playwright with
 * `--update-snapshots` does NOT rewrite byte-identical baselines, so
 * the mtime of an individual PNG only changes when the rendered pixels
 * differ. A source edit that happens to render byte-identically (CSS
 * with no visible effect, dead branch, etc.) would still flag with a
 * per-baseline gate. The tag flips on every regen run regardless.
 *
 * Algorithm:
 *   1. Read tag mtime (missing tag = treat as epoch 0; fails closed).
 *   2. Walk every `*.fixture.ts` in `src/app/sandbox/fixtures/`.
 *   3. Parse `.component` imports + resolve sibling {html,ts,scss}.
 *   4. The freshest source across all those files is the threshold.
 *   5. If freshest-source > tag mtime → STALE; suggest regen command.
 *
 * Resolution:
 *   npm run test:visual:update      (regenerates baselines + bumps tag)
 *
 * Hooked into pre-commit + npm run check:full.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = join(REPO_ROOT, 'src/app/sandbox/fixtures');
const SNAPSHOT_DIR = join(REPO_ROOT, 'e2e-tests/visual/sandbox-snapshots.spec.ts-snapshots');
const REGEN_TAG = join(SNAPSHOT_DIR, '.last-regen.txt');
const SOURCE_EXTS = ['.html', '.ts', '.scss'];

function collectFixtureFiles() {
  const files = [];
  for (const entry of readdirSync(FIXTURES_DIR)) {
    if (!entry.endsWith('.fixture.ts')) continue;
    files.push(join(FIXTURES_DIR, entry));
  }
  return files;
}

function resolveSourcesForFixture(fixturePath, fixtureText) {
  const sources = new Set();
  sources.add(fixturePath);
  for (const m of fixtureText.matchAll(/from\s+'([^']+\.component)'/g)) {
    const componentBase = resolve(dirname(fixturePath), m[1]);
    for (const ext of SOURCE_EXTS) {
      const candidate = `${componentBase}${ext}`;
      if (existsSync(candidate)) sources.add(candidate);
    }
  }
  return [...sources];
}

// A timestamp in the future is not evidence of a newer source; it is evidence of a clock that moved.
// This machine's has jumped about a month forward and back more than once, and each time it left files
// dated ahead of anything a regeneration could ever produce - so the gate reported every baseline stale
// and no amount of regenerating could clear it. Those files are counted, named and skipped instead.
const SKEW_TOLERANCE_MS = 60_000;

function freshestSourceFile() {
  let freshest = { path: null, mtimeMs: 0 };
  const fromTheFuture = [];
  const now = Date.now();
  for (const fixturePath of collectFixtureFiles()) {
    const text = readFileSync(fixturePath, 'utf8');
    for (const source of resolveSourcesForFixture(fixturePath, text)) {
      const m = statSync(source).mtimeMs;
      if (m > now + SKEW_TOLERANCE_MS) {
        fromTheFuture.push(source);
        continue;
      }
      if (m > freshest.mtimeMs) {
        freshest = { path: source, mtimeMs: m };
      }
    }
  }
  return { ...freshest, fromTheFuture };
}

const tagExists = existsSync(REGEN_TAG);
const tagMtime = tagExists ? statSync(REGEN_TAG).mtimeMs : 0;
const freshest = freshestSourceFile();
if (freshest.fromTheFuture.length) {
  console.warn(
    `check:visual-baseline-freshness: ${freshest.fromTheFuture.length} source(s) are dated in the future ` +
      `and were ignored — this machine's clock has moved. First: ${freshest.fromTheFuture[0]}`,
  );
}

if (freshest.mtimeMs <= tagMtime) {
  const tagAgeMs = Date.now() - tagMtime;
  console.log(
    `Visual baseline freshness: tag ${humanize(tagAgeMs)} ago, no sources newer ✓`,
  );
  process.exit(0);
}

const deltaMs = freshest.mtimeMs - tagMtime;
const relSource = relative(REPO_ROOT, freshest.path);

if (!tagExists) {
  console.error(
    `Visual baseline freshness FAILED — regen tag missing.\n\n` +
      `   Expected: ${relative(REPO_ROOT, REGEN_TAG)}\n` +
      `   This means the sandbox snapshots have never been regenerated\n` +
      `   under the G10 protocol. Run:\n\n` +
      `       npm run test:visual:update\n\n` +
      `   which will refresh baselines AND write the tag.`,
  );
  process.exit(1);
}

console.error(
  `Visual baseline freshness FAILED — sources newer than last regen.\n\n` +
    `   Last regen: ${new Date(tagMtime).toISOString()}\n` +
    `   Freshest source: ${relSource}\n` +
    `       (newer by ${humanize(deltaMs)})\n\n` +
    `Fix:\n` +
    `   npm run test:visual:update\n\n` +
    `That command regenerates the byte-stable sandbox baselines AND\n` +
    `updates the regen tag so this gate passes. Commit both.`,
);
process.exit(1);

function humanize(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
