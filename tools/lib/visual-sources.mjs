/**
 * The set of sources the byte-stable sandbox baselines actually depend on, and a content digest of
 * it. Shared by the G5 gate and by the script that stamps the regen tag, so the two can never
 * disagree about what "the sources" means.
 *
 * Resolution: every `*.fixture.ts` under `src/app/sandbox/fixtures/`, plus the sibling
 * {html,ts,scss} of every `.component` it imports. That is the same walk the gate has always done.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES_DIR = join(REPO_ROOT, 'src/app/sandbox/fixtures');
export const SNAPSHOT_DIR = join(REPO_ROOT, 'e2e-tests/visual/sandbox-snapshots.spec.ts-snapshots');
export const REGEN_TAG = join(SNAPSHOT_DIR, '.last-regen.txt');
export const DIGEST_FILE = join(SNAPSHOT_DIR, '.source-digests.json');

const SOURCE_EXTS = ['.html', '.ts', '.scss'];

/** Repo-relative, forward-slashed, sorted — so the digest file is stable across machines. */
export function resolveWatchedSources() {
  const out = new Set();
  for (const entry of readdirSync(FIXTURES_DIR)) {
    if (!entry.endsWith('.fixture.ts')) continue;
    const fixturePath = join(FIXTURES_DIR, entry);
    out.add(fixturePath);
    const text = readFileSync(fixturePath, 'utf8');
    for (const m of text.matchAll(/from\s+'([^']+\.component)'/g)) {
      const base = resolve(dirname(fixturePath), m[1]);
      for (const ext of SOURCE_EXTS) {
        const candidate = `${base}${ext}`;
        if (existsSync(candidate)) out.add(candidate);
      }
    }
  }
  return [...out].map((p) => relative(REPO_ROOT, p).split('\\').join('/')).sort();
}

/**
 * Hash of the file's content with line endings normalised. A checkout on Windows rewrites LF to
 * CRLF; the pixels a component renders do not depend on which, so neither should this.
 */
export function hashFile(relPath) {
  const text = readFileSync(join(REPO_ROOT, relPath), 'utf8').split('\r\n').join('\n');
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function digestMap(sources = resolveWatchedSources()) {
  const map = {};
  for (const s of sources) map[s] = hashFile(s);
  return map;
}

export function readDigestFile() {
  if (!existsSync(DIGEST_FILE)) return null;
  try {
    const parsed = JSON.parse(readFileSync(DIGEST_FILE, 'utf8'));
    return parsed && typeof parsed.sources === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
