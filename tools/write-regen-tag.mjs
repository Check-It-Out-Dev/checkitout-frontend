#!/usr/bin/env node
/**
 * Stamps the G5 regen tag after a successful `test:visual:update` run, and records WHAT the
 * baselines were generated from.
 *
 * This used to be an inline `node -e "require('node:fs').writeFileSync(...)"`
 * chained inside the npm script, but npm-on-Windows shell quoting silently
 * swallowed the write — the tag froze at its 2026-05-13 stamp while
 * baselines kept regenerating, so the freshness gate (G5) failed every
 * commit that touched a fixture-linked source, with a fix-suggestion that
 * could never work. A real script file has no quoting layer to lose.
 *
 * Two artifacts, because a timestamp answers the wrong question:
 *   .last-regen.txt      when the baselines were regenerated. For humans.
 *   .source-digests.json the content hash of every source they depend on. For the gate.
 *
 * `--adopt` writes only the digests, leaving the timestamp alone. It says "the current sources are
 * the ones the recorded regeneration was made from" — use it when that is demonstrably true and no
 * regeneration happened, never to quiet a gate you have not checked.
 */
import { writeFileSync } from 'node:fs';
import { DIGEST_FILE, REGEN_TAG, digestMap, resolveWatchedSources } from './lib/visual-sources.mjs';

const adopt = process.argv.includes('--adopt');

const sources = resolveWatchedSources();
const stampedAt = new Date().toISOString();

if (!adopt) {
  writeFileSync(REGEN_TAG, stampedAt + '\n');
  console.log(`[write-regen-tag] stamped ${REGEN_TAG}`);
}

writeFileSync(
  DIGEST_FILE,
  JSON.stringify({ stampedAt: adopt ? `adopted ${stampedAt}` : stampedAt, sources: digestMap(sources) }, null, 1) + '\n'
);
console.log(`[write-regen-tag] recorded ${sources.length} source digests${adopt ? ' (adopted, timestamp untouched)' : ''}`);
