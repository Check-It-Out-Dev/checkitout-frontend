#!/usr/bin/env node
/**
 * The pre-commit hook and `check:static` must run the same set of checks.
 *
 * They are two hand-maintained lists of the same thing, and on 2026-09-10 they disagreed by exactly
 * one entry: `check:i18n-cache-buster` was in `check:static` and not in the hook. Nothing ran it at
 * commit time, so the stamped translation hash drifted away from the translation files and only
 * `check:full` -- which nobody runs per commit -- could see it. A stale hash serves yesterday's
 * translations from cache to anyone whose browser still holds them.
 *
 * This does not merge the two lists. The hook keeps its per-check comments, which are the only place
 * some of these rules are explained, and comments do not survive being collapsed into one command.
 * It just makes the two lists unable to drift apart quietly.
 */
import { readFileSync } from 'node:fs';

/** `npm run check:x` as an executed command, not as prose inside a comment. */
function executedChecks(text) {
  const found = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    for (const m of line.matchAll(/npm run (check:[a-z0-9-]+)/g)) found.add(m[1]);
  }
  return found;
}

const hook = executedChecks(readFileSync('.husky/pre-commit', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const staticChecks = executedChecks(pkg.scripts['check:static'] ?? '');

// `check:static` is an aggregate; the hook may name it or its members, never both halfway.
hook.delete('check:static');

const missingFromHook = [...staticChecks].filter((c) => !hook.has(c)).sort();
const missingFromStatic = [...hook].filter((c) => !staticChecks.has(c)).sort();

if (missingFromHook.length === 0 && missingFromStatic.length === 0) {
  console.log(`check:gate-parity OK — the hook and check:static run the same ${staticChecks.size} checks.`);
  process.exit(0);
}

if (missingFromHook.length) {
  console.error(`check:gate-parity FAILED — in check:static but NOT run by .husky/pre-commit: ${missingFromHook.join(', ')}`);
  console.error('  A check nobody runs at commit time is a check that drifts. Add it to the hook.');
}
if (missingFromStatic.length) {
  console.error(`check:gate-parity FAILED — run by .husky/pre-commit but NOT in check:static: ${missingFromStatic.join(', ')}`);
  console.error('  CI runs check:static; a check only the hook knows about does not gate a pull request.');
}
process.exit(1);
