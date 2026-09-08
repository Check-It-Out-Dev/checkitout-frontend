/**
 * The built demo, and whether it is still the one the sources describe.
 *
 * Three tools serve or ship `dist/check-it-out-fe-greenfield/browser`: the
 * static server that plays nginx locally (`serve-demo.mjs`), the perf runner
 * that measures against it (`run-perf.mjs`) and the deploy that puts it on the
 * VPS (`deploy-demo.mjs`). Each used to decide on its own whether the build was
 * current, and one of them once decided wrong: a server left running served
 * the bundle from before two fixes, which were then reported as not working.
 * One rule now, in one place: the build is stale when anything under `src/` or
 * `public/` is newer than the shell it produced.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve('dist/check-it-out-fe-greenfield/browser');
export const SHELL = join(ROOT, 'index.html');

/** Newest mtime under a directory, skipping the noise. */
export function newest(dir, skip = /node_modules|\.angular|dist/) {
  let latest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.test(entry.name)) continue;
    const full = join(dir, entry.name);
    const t = entry.isDirectory() ? newest(full, skip) : statSync(full).mtimeMs;
    if (t > latest) latest = t;
  }
  return latest;
}

/** Is the built demo missing, or older than the sources it was built from? */
export function stale() {
  if (!existsSync(SHELL)) return true;
  const built = statSync(SHELL).mtimeMs;
  return ['src', 'public'].some((d) => existsSync(d) && newest(resolve(d)) > built);
}

/** Why a build is due right now, or null when the one on disk is current. */
export function buildReason({ force = false } = {}) {
  if (force) return 'asked for';
  if (!existsSync(SHELL)) return 'no build on disk';
  if (stale()) return 'older than src/';
  return null;
}

/** `npm run build:demo`, inheriting the terminal; true when a shell came out. */
export function buildDemo() {
  const built = spawnSync('npm', ['run', 'build:demo'], { stdio: 'inherit', shell: true });
  return built.status === 0 && existsSync(SHELL);
}

/** The hashed main bundle the shell references — the build's identity. */
export function bundleName() {
  return readFileSync(SHELL, 'utf8').match(/main-[A-Z0-9]+\.js/)?.[0] ?? null;
}
