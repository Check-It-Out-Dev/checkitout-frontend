#!/usr/bin/env node
// Run the visual tier inside the pinned Playwright container, so one rasteriser produces and compares
// every baseline (docs/ci/ADR-visual-baselines.md).
//
// Text and anti-aliasing are rasterised differently on Windows and on Linux, so a baseline captured on the
// dev box can never be compared on a CI runner. The decision was one truth, not two sets: the container is
// it, locally through Docker and in CI through the same image tag.
//
//   node tools/visual-docker.mjs                 compare against the committed baselines
//   node tools/visual-docker.mjs --update        regenerate them, then stamp the freshness tag
//   node tools/visual-docker.mjs -- <args>       anything after -- goes to `playwright test`
//
// The repository is bind-mounted; node_modules comes from a named volume so the host's Windows binaries
// are never seen inside the container and the container's Linux install is never seen on the host. The
// volume survives between runs, so only the first run pays for `npm ci`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const update = argv.includes('--update');
const passThrough = argv.includes('--') ? argv.slice(argv.indexOf('--') + 1) : [];

// The image tag must follow the repository's Playwright version, or the container's browser build differs
// from the one the tests were written against and every baseline is noise.
const pinned = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8')).devDependencies[
  '@playwright/test'
].replace(/^[^0-9]*/, '');
const image = `mcr.microsoft.com/playwright:v${pinned}-noble`;

const dockerfile = resolve(repo, 'deploy/k8s/tests/Dockerfile.playwright');
if (existsSync(dockerfile)) {
  const pinnedThere = readFileSync(dockerfile, 'utf8').match(/ARG PW_VERSION=([\d.]+)/);
  if (pinnedThere && pinnedThere[1] !== pinned) {
    console.error(
      `visual-docker: package.json pins Playwright ${pinned} but ${dockerfile} pins ${pinnedThere[1]}.\n` +
        'One rasteriser means one version. Line them up before regenerating anything.',
    );
    process.exit(2);
  }
}

const inner = [
  'set -e',
  'cd /w',
  // The Playwright image ships Node 24.14, and Angular 22's CLI refuses anything below 24.15.0 - it
  // exits 3 before serving, and Playwright only reports "Process from config.webServer was not able to
  // start". The repository's own .nvmrc is the version to have; the tarball drops straight over
  // /usr/local and costs a few seconds.
  'want=$(tr -d "\r\n" < .nvmrc)',
  'have=$(node -p "process.versions.node")',
  'if [ "$have" != "$want" ]; then',
  '  echo "visual-docker: image has Node $have, this app needs $want; installing"',
  '  curl -fsSL "https://nodejs.org/dist/v$want/node-v$want-linux-x64.tar.gz" | tar -xz -C /usr/local --strip-components=1',
  '  node -v',
  'fi',
  // The volume is empty on the first run and stale whenever package-lock.json moves on.
  '[ -x node_modules/.bin/playwright ] && [ package-lock.json -ot node_modules/.package-lock.json ] || npm ci --prefer-offline --no-audit --loglevel=error',
  [
    'npx playwright test e2e-tests/visual',
    '--project=chromium-desktop',
    '--project=mobile-chrome',
    update ? '--update-snapshots' : '',
    ...passThrough,
  ]
    .filter(Boolean)
    .join(' '),
].join('\n');

console.log(`visual-docker: ${image}${update ? ' (regenerating baselines)' : ''}`);
const run = spawnSync(
  'docker',
  [
    'run', '--rm', '--ipc=host',
    '-v', `${repo}:/w`,
    '-v', 'checkitout-visual-node-modules:/w/node_modules',
    '-w', '/w',
    '-e', 'CI=1',
    '-e', 'HOME=/root',
    image,
    'bash', '-lc', inner,
  ],
  { stdio: 'inherit' },
);

if (run.status !== 0) process.exit(run.status ?? 1);

if (update) {
  const tag = spawnSync(process.execPath, [resolve(repo, 'tools/write-regen-tag.mjs')], { stdio: 'inherit' });
  process.exit(tag.status ?? 0);
}
