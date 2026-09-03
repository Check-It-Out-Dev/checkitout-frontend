#!/usr/bin/env node
/**
 * Stamps the G5 regen tag after a successful `test:visual:update` run.
 *
 * This used to be an inline `node -e "require('node:fs').writeFileSync(...)"`
 * chained inside the npm script, but npm-on-Windows shell quoting silently
 * swallowed the write — the tag froze at its 2026-05-13 stamp while
 * baselines kept regenerating, so the freshness gate (G5) failed every
 * commit that touched a fixture-linked source, with a fix-suggestion that
 * could never work. A real script file has no quoting layer to lose.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = join(
  REPO_ROOT,
  'e2e-tests/visual/sandbox-snapshots.spec.ts-snapshots/.last-regen.txt',
);

writeFileSync(TAG, new Date().toISOString() + '\n');
console.log(`[write-regen-tag] stamped ${TAG}`);
