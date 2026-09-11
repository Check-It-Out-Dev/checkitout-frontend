#!/usr/bin/env node
/**
 * Hard gate: en.json and pl.json must have identical key sets.
 *
 * Transloco does not strictly require parity — it falls back to the
 * default lang for missing keys — but in practice this fallback masks
 * bugs (typos, missed ports). A drifted key is either a missing
 * translation (PL falls back to English silently) or a dead key on the
 * other side. Both are easy to fix at the moment they appear and hard
 * to catch later.
 *
 * Caught 2026-05-10: pl.json had \`anddWarning\` (typo) where en.json had
 * \`addWarning\`, plus one only-pl key with no en counterpart. With this
 * gate, that drift fails pre-commit immediately.
 *
 * Hooked into pre-commit + npm run check:full.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EN = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/assets/i18n/en.json'), 'utf8'));
const PL = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/assets/i18n/pl.json'), 'utf8'));

function flatten(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatten(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const enKeys = new Set(flatten(EN));
const plKeys = new Set(flatten(PL));

const onlyEn = [...enKeys].filter((k) => !plKeys.has(k));
const onlyPl = [...plKeys].filter((k) => !enKeys.has(k));

// ------------------------------------------------------------------
// Second pass: scan feature templates for raw English literals.
//
// Pattern shape: `>Title Case Text<` (after stripping HTML comments).
// Catches the recurring "added a <span>Heading</span> without
// transloco wrapping" mistake. Already-translated bindings like
// `{{ 'foo' | transloco }}` don't match because the inside doesn't
// start with a capital letter.
//
// Allowlist (terminals that legitimately stay English):
//   - "English" / "Polski" — language chooser self-labels
//   - "Check It Out" — brand name (proper noun)
//   - "Polskie" / "English" / "Polski" — language toggle visible text
//   - Common tech proper nouns we render literally (Stripe etc.)
// ------------------------------------------------------------------

const FEATURE_HTML_ROOTS = ['src/app/feature', 'src/app/shared/components', 'src/app/layout'];

const TEXT_LITERAL_RE = />\s*([A-Z][a-zA-Z]+(?:\s+[A-Za-z][a-zA-Z]+){0,5})\s*</g;

const ALLOWLIST = new Set([
  // Language chooser — self-labels stay literal (so a PL-locale user
  // can still find the English option, and vice versa).
  'English',
  'Polski',
  // Brand names + proper nouns we render literally regardless of locale.
  'Check It Out',
  'CheckItOut',
  'Stripe',
  'Firebase',
  'Instagram',
  'Google',
  'Apple',
  'Facebook',
  'LinkedIn',
  // Material icon names that contain underscores would not match the
  // regex (no spaces, but mat-icon names are lowercase anyway). Listed
  // for clarity only.
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      yield* walk(p);
    } else if (s.isFile() && entry.endsWith('.component.html')) {
      yield p;
    }
  }
}

function stripHtmlComments(text) {
  // Until it stops changing. One pass over a delimiter that can be reconstructed by its own
  // removal is not a strip: `<!--<!-- -->-->` leaves `-->` behind on the first pass, and
  // `<!--x<!--y-->` leaves `<!--x`. This checker decides which i18n keys count as present, so a
  // key hidden in a half-removed comment is a key it silently stops asking about.
  let out = text;
  for (let pass = 0; pass < 10; pass++) {
    const next = out.replace(/<!--[\s\S]*?-->/g, '');
    if (next === out) return out;
    out = next;
  }
  return out;
}

function scanHtmlForLiterals(path) {
  const text = readFileSync(path, 'utf8');
  const cleaned = stripHtmlComments(text);
  const found = [];
  for (const m of cleaned.matchAll(TEXT_LITERAL_RE)) {
    const candidate = m[1].trim();
    if (ALLOWLIST.has(candidate)) continue;
    // Filter shorter than 4 chars — single short words (OK, PL, EN) are
    // typically UI-control abbreviations, not English copy worth porting.
    if (candidate.length < 4) continue;
    // Skip values inside <code> / <pre> blocks — likely literal IDs or
    // serial-keys, not display copy. Find the enclosing tag.
    const before = cleaned.slice(0, m.index);
    const lastOpen = before.lastIndexOf('<');
    const lastClose = before.lastIndexOf('>');
    if (lastOpen > lastClose) continue; // Inside an attribute, not text
    found.push(candidate);
  }
  return found;
}

const htmlViolations = [];
for (const root of FEATURE_HTML_ROOTS) {
  const dir = resolve(REPO_ROOT, root);
  try {
    statSync(dir);
  } catch {
    continue;
  }
  for (const path of walk(dir)) {
    const hits = scanHtmlForLiterals(path);
    if (hits.length > 0) {
      htmlViolations.push({ path: relative(REPO_ROOT, path), hits });
    }
  }
}

const totalHtmlScanned = countScanned();

if (onlyEn.length === 0 && onlyPl.length === 0 && htmlViolations.length === 0) {
  console.log(
    `i18n parity check: ${enKeys.size}/${enKeys.size} keys + ${totalHtmlScanned} template(s) — clean ✓`,
  );
  process.exit(0);
}

function countScanned() {
  let n = 0;
  for (const root of FEATURE_HTML_ROOTS) {
    const dir = resolve(REPO_ROOT, root);
    try {
      statSync(dir);
    } catch {
      continue;
    }
    for (const _ of walk(dir)) n++;
  }
  return n;
}

console.error(
  `i18n parity check FAILED — en=${enKeys.size}, pl=${plKeys.size}, drift=${
    onlyEn.length + onlyPl.length
  }:`,
);
if (onlyEn.length > 0) {
  console.error(`\n  Only in en.json (${onlyEn.length}):`);
  onlyEn.slice(0, 30).forEach((k) => console.error(`    ${k}`));
  if (onlyEn.length > 30) console.error(`    ... ${onlyEn.length - 30} more`);
}
if (onlyPl.length > 0) {
  console.error(`\n  Only in pl.json (${onlyPl.length}):`);
  onlyPl.slice(0, 30).forEach((k) => console.error(`    ${k}`));
  if (onlyPl.length > 30) console.error(`    ... ${onlyPl.length - 30} more`);
}
if (onlyEn.length > 0 || onlyPl.length > 0) {
  console.error(
    '\nFix: add the missing translation to the other locale, or delete the dead key from both.',
  );
}

if (htmlViolations.length > 0) {
  console.error(
    `\n  Raw English literals in feature HTML (${htmlViolations.length} file(s)):`,
  );
  for (const v of htmlViolations) {
    console.error(`    ${v.path}`);
    for (const hit of v.hits.slice(0, 5)) console.error(`      "${hit}"`);
    if (v.hits.length > 5) console.error(`      ... ${v.hits.length - 5} more`);
  }
  console.error(
    `\n  Fix: wrap in transloco — \`{{ 'feature.section.key' | transloco }}\` — and add\n` +
      `  the matching key to en.json + pl.json. Brand-names / language self-labels\n` +
      `  (e.g. \"English\", \"Polski\", \"Check It Out\") are allowlisted in this gate.\n` +
      `  Add new allowlist entries to tools/check-i18n-parity.mjs if you have a\n` +
      `  legitimate literal that should stay un-translated.`,
  );
}
process.exit(1);
