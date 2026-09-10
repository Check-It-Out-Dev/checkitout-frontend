#!/usr/bin/env node
/**
 * Hard gate (G5): the sandbox-snapshot baselines must correspond to the component sources whose UI
 * they capture. If a `*.component.html` (or `.ts` / `.scss`) has changed since the last regen, the
 * byte-stable visual coverage is silently invalid — the next intentional UI change would not be
 * caught.
 *
 * Caught 2026-05-12 by an opus-code-crawler audit: the editorial-sweep arc (~12dcdc3..0b34a80 +
 * theme refactor) touched 27 component templates without regenerating the byte-stable sandbox
 * snapshots. Coverage erosion was invisible because no gate flagged it.
 *
 * The gate asks about CONTENT, not mtime. It used to ask about mtime, and mtime answers a question
 * nobody is asking:
 *   - a fresh CI checkout stamps every file with the checkout time, so the gate was meaningless
 *     there and only ever really ran on one machine;
 *   - this box's clock has jumped about a month forward and back more than once, leaving files
 *     dated ahead of anything a regeneration could produce;
 *   - and any tool that rewrites the tree in place bumps 131 mtimes without changing a byte.
 *     Stryker does exactly that (see stryker.conf.json for why it has to), so after the mutation
 *     tier landed, every commit that followed a mutation run was blocked by a gate reporting a
 *     staleness that did not exist.
 * Content hashes are immune to all three, and they can name the file that actually changed instead
 * of the one that happens to be freshest.
 *
 * Design: `npm run test:visual:update` regenerates the baselines and then writes two files -
 * `.last-regen.txt` (when, for humans) and `.source-digests.json` (the hash of every watched
 * source, for this gate). Per-baseline mtimes remain useless for the purpose: Playwright with
 * `--update-snapshots` does not rewrite a byte-identical PNG, so a source edit that happens to
 * render identically would never show up in one.
 *
 * Resolution:
 *   npm run test:visual:update      (regenerates baselines + records digests)
 *
 * Hooked into pre-commit + npm run check:full.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DIGEST_FILE,
  REGEN_TAG,
  REPO_ROOT,
  hashFile,
  readDigestFile,
  resolveWatchedSources,
} from './lib/visual-sources.mjs';

const sources = resolveWatchedSources();
const recorded = readDigestFile();
const tagExists = existsSync(REGEN_TAG);
const tagMtime = tagExists ? statSync(REGEN_TAG).mtimeMs : 0;

if (!tagExists) {
  console.error(
    `Visual baseline freshness FAILED — regen tag missing.\n\n` +
      `   Expected: ${relative(REPO_ROOT, REGEN_TAG)}\n` +
      `   This means the sandbox snapshots have never been regenerated\n` +
      `   under the G10 protocol. Run:\n\n` +
      `       npm run test:visual:update\n\n` +
      `   which will refresh baselines AND write the tag.`
  );
  process.exit(1);
}

if (recorded) {
  const changed = [];
  const added = [];
  for (const s of sources) {
    const was = recorded.sources[s];
    if (was === undefined) added.push(s);
    else if (was !== hashFile(s)) changed.push(s);
  }

  if (!changed.length && !added.length) {
    console.log(
      `Visual baseline freshness: ${sources.length} sources unchanged since the regen of ` +
        `${readFileSync(REGEN_TAG, 'utf8').trim()} ✓`
    );
    process.exit(0);
  }

  const name = (list, label) =>
    list.length ? `\n   ${list.length} ${label}:\n${list.slice(0, 10).map((f) => `       ${f}`).join('\n')}` +
      (list.length > 10 ? `\n       … and ${list.length - 10} more` : '') : '';

  console.error(
    `Visual baseline freshness FAILED — sources changed since the last regen.\n` +
      `\n   Last regen: ${readFileSync(REGEN_TAG, 'utf8').trim()}` +
      name(changed, 'changed') +
      name(added, 'new, with no recorded digest') +
      `\n\nFix:\n` +
      `   npm run test:visual:update\n\n` +
      `That command regenerates the byte-stable sandbox baselines AND\n` +
      `records the source digests so this gate passes. Commit both.`
  );
  process.exit(1);
}

// ── Fallback: a regen tag written before digests existed. ────────────────────────────────────────
// Keep the old mtime comparison so an un-migrated checkout still gets *some* signal, but say
// plainly that it is the weaker test.
console.warn(
  `check:visual-baseline-freshness: no ${relative(REPO_ROOT, DIGEST_FILE)} yet — falling back to ` +
    `mtime, which cannot tell an edit from a touch. The next test:visual:update records digests.`
);

const SKEW_TOLERANCE_MS = 60_000;
const now = Date.now();
let freshest = { path: null, mtimeMs: 0 };
const fromTheFuture = [];
for (const s of sources) {
  const m = statSync(join(REPO_ROOT, s)).mtimeMs;
  if (m > now + SKEW_TOLERANCE_MS) {
    fromTheFuture.push(s);
    continue;
  }
  if (m > freshest.mtimeMs) freshest = { path: s, mtimeMs: m };
}
if (fromTheFuture.length) {
  console.warn(
    `check:visual-baseline-freshness: ${fromTheFuture.length} source(s) are dated in the future ` +
      `and were ignored — this machine's clock has moved. First: ${fromTheFuture[0]}`
  );
}

if (freshest.mtimeMs <= tagMtime) {
  console.log(`Visual baseline freshness: tag ${humanize(Date.now() - tagMtime)} ago, no sources newer ✓`);
  process.exit(0);
}

console.error(
  `Visual baseline freshness FAILED — sources newer than last regen.\n\n` +
    `   Last regen: ${new Date(tagMtime).toISOString()}\n` +
    `   Freshest source: ${freshest.path}\n` +
    `       (newer by ${humanize(freshest.mtimeMs - tagMtime)})\n\n` +
    `Fix:\n` +
    `   npm run test:visual:update\n\n` +
    `That command regenerates the byte-stable sandbox baselines AND\n` +
    `updates the regen tag so this gate passes. Commit both.`
);
process.exit(1);

function humanize(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
