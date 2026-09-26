#!/usr/bin/env node
/**
 * Hard gate (G11): the i18n JSON cache-buster must match the translation
 * content actually shipped.
 *
 * Why: `assets/i18n/{en,pl}.json` are copied verbatim (no filename hash)
 * and served long-cached — the standalone SSR server (`server.ts`) sends
 * `maxAge: '1y'`, and prod CDN/nginx policies cache aggressively too. An
 * unversioned URL therefore pins returning browsers to YEAR-STALE
 * translations after a deploy that changes them. Caught 2026-09-02: after
 * `seo.site_title` changed, SSR rendered the new value while the hydrated
 * client kept titling pages with the old one (cached pl.json/en.json).
 *
 * Fix pattern (same as the icon-subset font buster): a `?v=<hash>` query
 * derived from the translation content, carried by BOTH consumers of the
 * URL so they stay one request:
 *   1. `src/app/core/i18n/i18n-version.ts` — generated constant the
 *      HttpTranslocoLoader appends to its fetch URL.
 *   2. `src/index.html` — the `<link rel="preload" ... pl.json?v=...>`;
 *      a preload without the SAME query never matches the loader's
 *      request, so the preload would be wasted AND double-download.
 *
 * Modes:
 *   node tools/i18n-cache-buster.mjs           # stamp both files
 *   node tools/i18n-cache-buster.mjs --check   # gate: fail if stale
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N_FILES = ['src/assets/i18n/en.json', 'src/assets/i18n/pl.json'];
const VERSION_TS = join(REPO_ROOT, 'src/app/core/i18n/i18n-version.ts');
const INDEX_HTML = join(REPO_ROOT, 'src/index.html');

const VERSION_RE = /I18N_VERSION = '([a-f0-9]+)'/;
const PRELOAD_RE = /href="assets\/i18n\/pl\.json(?:\?v=([a-f0-9]+))?"/;

/**
 * The hash is over CONTENT, so it must not depend on how the checkout wrote
 * the line endings. Hashing raw bytes made the stamp platform-specific: a
 * Windows clone with `core.autocrlf=true` produces a different digest from the
 * same commit checked out on a Linux runner, so a stamp made on one fails the
 * gate on the other. Found 2026-09-17, when a wholesale re-checkout flipped
 * this working tree to CRLF and the gate reported a stale stamp for files git
 * itself considered unmodified. Normalise, then hash.
 */
function contentHash() {
  const h = createHash('sha256');
  for (const f of I18N_FILES) {
    h.update(readFileSync(join(REPO_ROOT, f), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex').slice(0, 12);
}

const want = contentHash();
const versionSrc = readFileSync(VERSION_TS, 'utf8');
const indexSrc = readFileSync(INDEX_HTML, 'utf8');
const haveTs = versionSrc.match(VERSION_RE)?.[1];
const havePreload = indexSrc.match(PRELOAD_RE)?.[1];

if (process.argv.includes('--check')) {
  let failed = false;
  if (haveTs !== want) {
    console.error('check:i18n-cache-buster FAILED — i18n-version.ts is stale.');
    console.error(`   carries '${haveTs ?? '(none)'}' but the i18n JSONs hash to '${want}'.`);
    failed = true;
  }
  if (havePreload !== want) {
    console.error('check:i18n-cache-buster FAILED — the index.html pl.json preload is stale.');
    console.error(`   carries ?v=${havePreload ?? '(none)'} but the i18n JSONs hash to '${want}'.`);
    failed = true;
  }
  if (failed) {
    console.error('\nFix: node tools/i18n-cache-buster.mjs   (then commit the stamps with the JSONs)');
    process.exit(1);
  }
  console.log(`check:i18n-cache-buster OK — translations hash to ?v=${want} (i18n-version.ts + preload).`);
  process.exit(0);
}

if (haveTs !== want) {
  writeFileSync(VERSION_TS, versionSrc.replace(VERSION_RE, `I18N_VERSION = '${want}'`));
  console.log(`Stamped I18N_VERSION '${want}' in i18n-version.ts (commit it with the JSONs).`);
} else {
  console.log(`i18n-version.ts already fresh at '${want}'.`);
}
if (havePreload !== want) {
  writeFileSync(INDEX_HTML, indexSrc.replace(PRELOAD_RE, `href="assets/i18n/pl.json?v=${want}"`));
  console.log(`Stamped pl.json preload ?v=${want} in index.html (commit it too).`);
} else {
  console.log(`index.html preload already fresh at ?v=${want}.`);
}
