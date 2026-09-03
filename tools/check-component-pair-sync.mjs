#!/usr/bin/env node
/**
 * Hard gate: every entry in `e2e-tests/visual-parity/component-pairs.ts`
 * COMPONENT_PAIRS must reference a sandbox fixture that actually exists in
 * `src/app/sandbox/fixtures/*.fixture.ts`. Catches typos / renames that
 * silently break Stage 6g sweep pairings.
 *
 * Specifically:
 *   - For each ComponentPair, the slug used for the greenfield side is
 *     `sandboxId ?? id`. That slug must appear in SANDBOX_REGISTRY.
 *   - Pairs whose verdict is `expectedDiverged` and whose narrative is
 *     "no legacy peer / fundamentally diverged UX" (e.g. sign-out-in-progress)
 *     still need a greenfield sandbox to render — so the check applies
 *     uniformly.
 *
 * Does NOT cross-check legacy phantom-registry (that's a different repo,
 * `the legacy frontend`). Drift on the legacy side is caught by the Stage 6g
 * sweep itself (404 on `/__phantom/<id>` is visible).
 *
 * Hooked into npm run check:full. Add a slug to UNCLASSIFIED_OK below if
 * a sandbox fixture genuinely doesn't pair with anything legacy (purely
 * greenfield-only sandbox state).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAIRS_FILE = join(REPO_ROOT, 'e2e-tests/visual-parity/component-pairs.ts');
const FIXTURES_DIR = join(REPO_ROOT, 'src/app/sandbox/fixtures');

const idRe = /id:\s*'([a-z][a-z0-9-]+)'/g;
const labelRe = /^\s*,?\s*label:\s*'/;

function extractSandboxIds() {
  const ids = new Set();
  for (const entry of readdirSync(FIXTURES_DIR)) {
    if (!entry.endsWith('.fixture.ts')) continue;
    const text = readFileSync(join(FIXTURES_DIR, entry), 'utf8');
    let m;
    while ((m = idRe.exec(text)) !== null) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
      if (labelRe.test(after)) ids.add(m[1]);
    }
  }
  return ids;
}

// Parse component-pairs.ts entries. Each entry is an object literal in the
// COMPONENT_PAIRS const-array. Look for `id: '...'` and optionally
// `sandboxId: '...'` within the same object brace.
//
// The brace-scoped scan is simple: split on `},` at top-of-array level,
// then within each chunk extract id + sandboxId via a tight regex.
function extractPairTargets() {
  const text = readFileSync(PAIRS_FILE, 'utf8');
  // Constrain to the array body to avoid picking up the type definitions
  // above (`readonly id: string` etc.).
  const startMarker = 'export const COMPONENT_PAIRS';
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) throw new Error(`COMPONENT_PAIRS export not found in ${PAIRS_FILE}`);
  // From the `[` after the export, find the matching `];`
  const arrayStart = text.indexOf('[', startIdx);
  // Find the closing `];` — the next semicolon after the array's `]`. The
  // array is the top-level only in this file (no semicolon-terminated
  // expressions inside), so a simple search works.
  const arrayEnd = text.indexOf('];', arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) throw new Error('COMPONENT_PAIRS array bounds not found');
  const body = text.slice(arrayStart + 1, arrayEnd);

  const targets = [];
  // Brace-balanced scan for TOP-LEVEL entry objects. The previous naive
  // `/\{[^{}]*?\}/gs` regex only matched innermost brace blocks, so any
  // entry containing a nested object (`contentAssertions: {...}` — every
  // pair since iter-44) was silently skipped and the gate ran against an
  // EMPTY pair list ("0 pair(s) ... clean ✓" — vacuously green). Found in
  // the gate run that caught the vacuous pair-sync bug.
  let depth = 0;
  let entryStart = -1;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') {
      if (depth === 0) entryStart = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && entryStart !== -1) {
        const entry = body.slice(entryStart, i + 1);
        entryStart = -1;
        const idMatch = entry.match(/^\s*id:\s*'([a-z][a-z0-9-]+)'/m);
        if (!idMatch) continue;
        const sandboxMatch = entry.match(/sandboxId:\s*'([a-z][a-z0-9-]+)'/);
        targets.push({
          id: idMatch[1],
          sandboxTarget: sandboxMatch ? sandboxMatch[1] : idMatch[1],
        });
      }
    }
  }
  // Parser self-guard: an empty extraction from a non-empty registry means
  // THIS script rotted (format drift), not that the registry is clean.
  // Fail loudly instead of passing vacuously — that failure mode already
  // shipped once.
  if (targets.length === 0) {
    throw new Error(
      `extractPairTargets() found 0 entries in ${PAIRS_FILE} — parser/format drift. ` +
        'The gate must never pass against an empty pair list.',
    );
  }
  return targets;
}

// Sandbox fixtures that don't pair with anything legacy (purely
// greenfield-only states). Add a fixture id here with a reason to
// silence the "unclassified sandbox fixture" warning. Empty is fine —
// the gate only WARNS (not errors) on unclassified sandboxes today.
const UNCLASSIFIED_OK = new Set([
  // example: 'fixture-id', // reason
]);

const sandboxIds = extractSandboxIds();
const pairTargets = extractPairTargets();

// 1. Errors: ComponentPairs targeting non-existent sandbox fixtures.
const orphanPairs = pairTargets.filter((p) => !sandboxIds.has(p.sandboxTarget));

// 2. Info: sandbox fixtures with no ComponentPair entry. NOT a hard error —
// many sandbox fixtures are intentionally greenfield-only. Reported so the
// curator notices when something *should* be paired.
const classifiedSandboxIds = new Set(pairTargets.map((p) => p.sandboxTarget));
const unclassifiedSandboxes = [...sandboxIds]
  .filter((id) => !classifiedSandboxIds.has(id) && !UNCLASSIFIED_OK.has(id))
  .sort();

const ok = orphanPairs.length === 0;

if (orphanPairs.length > 0) {
  console.error('Component-pair sync FAILED — pairs reference unknown sandbox fixtures:');
  for (const p of orphanPairs) {
    console.error(`  - pair id="${p.id}" → sandboxTarget="${p.sandboxTarget}" (no matching fixture)`);
  }
  console.error('');
  console.error(
    `Fix: register the fixture in src/app/sandbox/fixtures/<feature>.fixture.ts, or correct the sandboxId override in component-pairs.ts.`,
  );
}

if (unclassifiedSandboxes.length > 0) {
  // Informational only — don't fail the gate. Most sandboxes are deliberately
  // greenfield-only (loading states, success states, error variants etc.).
  console.warn(
    `Component-pair sync: ${unclassifiedSandboxes.length} sandbox fixture(s) not in COMPONENT_PAIRS (info; not an error).`,
  );
  // Print only when explicitly verbose to avoid pre-commit noise.
  if (process.env.COMPONENT_PAIR_SYNC_VERBOSE === '1') {
    for (const id of unclassifiedSandboxes) console.warn(`  · ${id}`);
  } else {
    console.warn('  · (set COMPONENT_PAIR_SYNC_VERBOSE=1 to list)');
  }
}

if (ok) {
  console.log(
    `Component-pair sync: ${pairTargets.length} pair(s) all point at registered sandbox fixtures — clean ✓`,
  );
}

process.exit(ok ? 0 : 1);
