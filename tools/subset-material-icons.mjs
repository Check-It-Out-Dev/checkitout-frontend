#!/usr/bin/env node
/**
 * Material Icons ligature subsetter + gate (iter-107 Lighthouse arc).
 *
 * The full Material Icons woff2 is 129 KB and rode the critical window of
 * every page load (preloaded OR discovered from the inlined critical CSS
 * at VeryHigh priority — both price ~0.7-1.0 s onto simulated slow-4G
 * FCP/LCP). The app uses <100 distinct glyphs, so we ship a subset
 * (~10 KB) cut from the pristine source font kept in tools/fonts-src/.
 *
 * Modes:
 *   --write  scan src/ for icon names, write the manifest, run
 *            fontTools.subset (Python) to regenerate
 *            src/assets/fonts/materialicons_v145_subset.woff2
 *   --check  scan src/ and fail (exit 1) if the manifest is stale —
 *            wired into the pre-commit chain so a newly used icon name
 *            cannot land without regenerating the subset.
 *
 * Scanner coverage (union):
 *   1. <mat-icon ...>name</mat-icon> literal inner text (html + inline
 *      templates in .ts)
 *   2. quoted literals inside <mat-icon ...>{{ ... }}</mat-icon>
 *      interpolations (ternaries like themeMode() ? 'light_mode' : ...)
 *   3. `icon: 'name'` / `icon = 'name'` / `fontIcon="name"` literals
 *   4. tools/material-icons.extra.txt — manual entries the regexes cannot
 *      see (helper-function return values like fileIcon()'s
 *      picture_as_pdf, future BE-driven names).
 *
 * Ligature subsetting: Material Icons v145 encodes name→glyph mapping in
 * the GSUB **rlig** feature (NOT liga — subsetting with liga alone
 * produces a 476-byte letters-only font with zero icons). Passing
 * --layout-features=rlig,liga,ccmp plus the names as --text lets
 * fontTools close over GSUB and keep the glyphs the ligatures resolve
 * to. a-z/0-9/_ are included so an unknown future name degrades to
 * readable text instead of tofu (and the gate catches it anyway).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const SOURCE_FONT = join(ROOT, 'tools', 'fonts-src', 'materialicons_v145_full.woff2');
const OUT_FONT = join(SRC, 'assets', 'fonts', 'materialicons_v145_subset.woff2');
const MANIFEST = join(SRC, 'assets', 'fonts', 'materialicons.subset.manifest.txt');
const EXTRA = join(ROOT, 'tools', 'material-icons.extra.txt');
const STYLES = join(SRC, 'styles.scss');
const INDEX_HTML = join(SRC, 'index.html');

// The @font-face URL carries a `?v=<hash>` cache-buster keyed to the woff2's
// content. Angular does NOT fingerprint absolute-path url()s in global styles,
// and ng serve caches the woff2, so a regenerated subset would otherwise stay
// invisible in browsers that cached the old font (icons render blank until a
// hard refresh — reported 2026-09-02). Stamping the content hash makes every
// regen bust the cache in dev AND prod. The gate (--check) fails if the stamp
// drifts from the font, so a font regen can't land without the URL update.
const FONT_URL_RE =
  /url\(\/assets\/fonts\/materialicons_v145_subset\.woff2(?:\?v=[a-f0-9]+)?\)/;
// The index.html <link rel="preload"> for the same woff2 must carry the SAME
// ?v=<hash> or the preloaded URL never matches the CSS request → a
// "preloaded but not used" console warning (caught by route-smoke) plus a
// wasted double-fetch. Stamp + gate it exactly like the styles.scss url().
const PRELOAD_URL_RE =
  /href="assets\/fonts\/materialicons_v145_subset\.woff2(?:\?v=[a-f0-9]+)?"/;

function fontHash() {
  return createHash('sha256').update(readFileSync(OUT_FONT)).digest('hex').slice(0, 12);
}

function readStamp() {
  const m = readFileSync(STYLES, 'utf8').match(/materialicons_v145_subset\.woff2\?v=([a-f0-9]+)/);
  return m ? m[1] : null;
}

function readPreloadStamp() {
  const m = readFileSync(INDEX_HTML, 'utf8').match(
    /href="assets\/fonts\/materialicons_v145_subset\.woff2\?v=([a-f0-9]+)"/,
  );
  return m ? m[1] : null;
}

function stampStyles(hash) {
  const css = readFileSync(STYLES, 'utf8');
  const next = css.replace(
    FONT_URL_RE,
    `url(/assets/fonts/materialicons_v145_subset.woff2?v=${hash})`,
  );
  if (next !== css) writeFileSync(STYLES, next);
  return next !== css;
}

function stampIndex(hash) {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const next = html.replace(
    PRELOAD_URL_RE,
    `href="assets/fonts/materialicons_v145_subset.woff2?v=${hash}"`,
  );
  if (next !== html) writeFileSync(INDEX_HTML, next);
  return next !== html;
}

const mode = process.argv.includes('--write') ? 'write' : 'check';

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (['.html', '.ts'].includes(extname(p)) && !p.endsWith('.spec.ts')) yield p;
  }
}

function scanIconNames() {
  const names = new Set();
  const NAME = /^[a-z][a-z0-9_]{1,40}$/;
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    // 1. literal inner text
    for (const m of text.matchAll(/<mat-icon[^>]*>\s*([a-z0-9_]+)\s*<\/mat-icon>/g)) {
      if (NAME.test(m[1])) names.add(m[1]);
    }
    // 2. quoted literals inside mat-icon interpolations (multiline)
    for (const m of text.matchAll(/<mat-icon[^>]*>[\s\S]*?<\/mat-icon>/g)) {
      if (!m[0].includes('{{')) continue;
      for (const q of m[0].matchAll(/'([a-z0-9_]+)'/g)) {
        if (NAME.test(q[1])) names.add(q[1]);
      }
    }
    // 3. icon-keyed literals
    for (const m of text.matchAll(/\bicon\s*[:=]\s*'([a-z0-9_]+)'/g)) {
      if (NAME.test(m[1])) names.add(m[1]);
    }
    for (const m of text.matchAll(/\bfontIcon\s*=?\s*"?'?([a-z0-9_]+)'?"?/g)) {
      if (NAME.test(m[1])) names.add(m[1]);
    }
  }
  if (existsSync(EXTRA)) {
    for (const line of readFileSync(EXTRA, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith('#') && NAME.test(t)) names.add(t);
    }
  }
  return [...names].sort();
}

const scanned = scanIconNames();

if (mode === 'check') {
  const manifest = existsSync(MANIFEST)
    ? readFileSync(MANIFEST, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
  const missing = scanned.filter((n) => !manifest.includes(n));
  if (missing.length > 0 || !existsSync(OUT_FONT)) {
    console.error('check:icon-subset FAILED — icon names used in src/ but absent from the shipped');
    console.error('Material Icons subset:', missing.join(', ') || '(subset font file missing)');
    console.error('Run: node tools/subset-material-icons.mjs --write   (then commit the regenerated');
    console.error(`font + manifest). Manifest: ${MANIFEST}`);
    process.exit(1);
  }
  const wantStamp = fontHash();
  const haveStamp = readStamp();
  if (haveStamp !== wantStamp) {
    console.error('check:icon-subset FAILED — the @font-face cache-buster in styles.scss is stale.');
    console.error(`   styles.scss carries ?v=${haveStamp ?? '(none)'} but the shipped font hashes to ${wantStamp}.`);
    console.error('   A cached browser would keep rendering the old font (blank icons). Run:');
    console.error('       node tools/subset-material-icons.mjs --write   (re-stamps the URL), then commit styles.scss.');
    process.exit(1);
  }
  const havePreload = readPreloadStamp();
  if (havePreload !== wantStamp) {
    console.error('check:icon-subset FAILED — the index.html font <link rel="preload"> cache-buster is stale.');
    console.error(`   index.html carries ?v=${havePreload ?? '(none)'} but the shipped font hashes to ${wantStamp}.`);
    console.error('   Mismatch → "preloaded but not used" console warning + a wasted double-fetch. Run:');
    console.error('       node tools/subset-material-icons.mjs --write   (re-stamps both), then commit index.html.');
    process.exit(1);
  }
  console.log(
    `check:icon-subset OK — ${scanned.length} icon names covered; cache-buster ?v=${wantStamp} fresh (styles.scss + preload).`,
  );
  process.exit(0);
}

// --write
if (!existsSync(SOURCE_FONT)) {
  console.error(`Pristine source font missing: ${SOURCE_FONT}`);
  process.exit(1);
}
writeFileSync(MANIFEST, scanned.join('\n') + '\n');
// Ligature pruning + subsetting lives in the Python helper — see its
// docstring for why plain pyftsubset cannot cut this font.
execFileSync(
  'python',
  [join(ROOT, 'tools', 'subset_material_icons.py'), SOURCE_FONT, MANIFEST, OUT_FONT],
  { stdio: 'inherit' },
);
const kb = (statSync(OUT_FONT).size / 1024).toFixed(1);
console.log(`Wrote ${OUT_FONT} (${kb} KB, ${scanned.length} icon names) + manifest.`);
const hash = fontHash();
const stamped = stampStyles(hash);
console.log(
  stamped
    ? `Stamped @font-face cache-buster ?v=${hash} in styles.scss (commit it with the font).`
    : `@font-face cache-buster already fresh at ?v=${hash}.`,
);
const stampedPreload = stampIndex(hash);
console.log(
  stampedPreload
    ? `Stamped font <link rel="preload"> cache-buster ?v=${hash} in index.html (commit it too).`
    : `index.html preload cache-buster already fresh at ?v=${hash}.`,
);
