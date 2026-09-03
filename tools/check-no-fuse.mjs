#!/usr/bin/env node
/**
 * Hard gate: this repo MUST never reference the Fuse commercial template.
 * Running this script greps `src/` for any `@fuse` import / reference.
 * Exit 0 = clean. Exit 1 = Fuse leak detected (fail the build).
 *
 * Hooked into pre-commit (husky) + every loop iteration. The Fuse
 * template is commercially licensed; zero `@fuse` is what allows the
 * MIT release — and was the whole reason for the rewrite.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor to the script's location, not process.cwd(). Pre-commit runs
// from repo root but a contributor invoking the script from a subdir
// would otherwise walk a non-existent path and silently report clean.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(REPO_ROOT, 'src');
// Only flag actual import statements / module specifiers — references to the
// string "@fuse" inside comments (e.g. "do NOT import @fuse/*") are legitimate
// documentation and should NOT trip the gate.
const PATTERNS = [
  /from\s+['"]@fuse\//,            // ES import: from '@fuse/...'
  /import\s*\(\s*['"]@fuse\//,     // dynamic import('@fuse/...')
  /require\s*\(\s*['"]@fuse\//,    // require('@fuse/...')
  /['"]@fuse\/[^'"]+['"]/,         // any quoted module specifier
];
const SKIP = new Set(['node_modules', 'dist', '.angular', '.git']);

async function walk(dir) {
  const entries = await readdir(dir);
  const found = [];
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) {
      found.push(...(await walk(full)));
    } else if (/\.(ts|html|scss|css|json)$/.test(entry)) {
      const text = await readFile(full, 'utf8');
      for (const pat of PATTERNS) {
        if (pat.test(text)) {
          found.push({ file: relative(REPO_ROOT, full), match: text.match(pat)[0] });
          break;
        }
      }
    }
  }
  return found;
}

const hits = await walk(ROOT);
if (hits.length === 0) {
  console.log('Fuse-free check: 0 references — clean ✓');
  process.exit(0);
}
console.error(`Fuse-free check FAILED — ${hits.length} match(es):`);
for (const { file, match } of hits) console.error(`  ${file}: ${match}`);
console.error('\nThe greenfield FE must NEVER import @fuse/* — that template');
console.error('has a commercial license incompatible with open-source release.');
console.error('See the "no legacy UI" gate (G1) in README.md → Gates.');
process.exit(1);
