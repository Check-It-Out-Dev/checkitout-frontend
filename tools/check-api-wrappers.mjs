#!/usr/bin/env node
/**
 * Hard gate: feature / layout / shared code MUST NOT import directly from
 * `src/app/api/**` (the openapi-generator output). All access to the BE
 * goes through wrapper services in `src/app/core/**`, which type the
 * boundary, hide codegen-numbered method names (`create11`, `getById12`),
 * and unwrap the `requestParameters` envelope.
 *
 * Why: the generated client uses overload signatures with `Observable<any>`
 * as the implementation type. Calling generated methods directly from
 * feature code leaks `<any>` into call sites and forces `as Observable<X>`
 * casts. We caught one such leak in layout.component.ts (2026-05-10) and
 * codified the rule here so the next leak fails the build instead of
 * needing a manual sweep.
 *
 * Allowed: imports of `src/app/api/model/**` (DTO + enum types are stable
 * type aliases and have no runtime / typing footgun).
 *
 * Hooked into pre-commit + the loop iteration body.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor paths to the script's own location, not process.cwd(). This way
// the gate works the same whether pre-commit runs from the repo root, a
// contributor runs `node tools/check-api-wrappers.mjs` from a subdir, or
// an editor invokes it. Without this, a subdir cwd silently walks an
// empty tree and lies "0 violations".
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(REPO_ROOT, 'src', 'app');

const FORBIDDEN_AREAS = ['feature', 'layout', 'shared', 'pages'];
const ALLOWED_AREAS = ['core', 'api'];

const FORBIDDEN_IMPORT = /from\s+['"][^'"]*\/api\/api\/[^'"]+['"]/;
const ANY_OBSERVABLE_CAST = /as\s+Observable\s*</;
const SKIP = new Set(['node_modules', 'dist', '.angular', '.git']);

async function walk(dir, area) {
  const entries = await readdir(dir);
  const hits = [];
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) {
      hits.push(...(await walk(full, area)));
    } else if (/\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry)) {
      const text = await readFile(full, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, idx) => {
        if (FORBIDDEN_IMPORT.test(line) && !ALLOWED_AREAS.includes(area)) {
          hits.push({
            file: relative(REPO_ROOT, full),
            line: idx + 1,
            kind: 'direct-api-import',
            text: line.trim(),
          });
        }
        if (ANY_OBSERVABLE_CAST.test(line) && !ALLOWED_AREAS.includes(area)) {
          hits.push({
            file: relative(REPO_ROOT, full),
            line: idx + 1,
            kind: 'observable-any-cast',
            text: line.trim(),
          });
        }
      });
    }
  }
  return hits;
}

const allHits = [];
for (const area of FORBIDDEN_AREAS) {
  const dir = join(ROOT, area);
  try {
    await stat(dir);
  } catch {
    continue;
  }
  allHits.push(...(await walk(dir, area)));
}

if (allHits.length === 0) {
  console.log('API-wrapper check: 0 violations — clean ✓');
  process.exit(0);
}
console.error(`API-wrapper check FAILED — ${allHits.length} violation(s):\n`);
for (const hit of allHits) {
  const header =
    hit.kind === 'direct-api-import'
      ? '[direct-api-import]'
      : '[observable-any-cast]';
  console.error(`  ${header} ${hit.file}:${hit.line}`);
  console.error(`    ${hit.text}`);
}
console.error(
  '\nFeature / layout / shared code must access the BE through a wrapper in src/app/core/**.',
);
console.error('Imports of src/app/api/model/** (DTO types) are still allowed.');
console.error('See feedback memory `feedback_api_wrapper_discipline.md`.');
process.exit(1);
