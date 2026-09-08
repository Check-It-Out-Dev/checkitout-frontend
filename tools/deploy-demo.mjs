#!/usr/bin/env node
/**
 * Ships the built demo to the VPS the way it has been shipped by hand.
 *
 * Production is `dist/check-it-out-fe-greenfield/browser` behind nginx on the
 * demo VPS (`deployment/vps/check-it-out.pl.conf`, host alias `gvps`). The
 * recipe that has worked since 2026-09-04: build, stream the directory over
 * ssh into `<webroot>.new`, set ownership and modes, move the old webroot to a
 * dated `.bak-` and the new one into place — one rename, so a visitor never
 * sees a half-copied site — then read the served shell through the edge with
 * a cache-busting query and compare its `main-*.js` hash with the one just
 * built. Cloudflare never caches the shell (`no-cache`, DYNAMIC) and hashed
 * assets carry new names, so no purge is needed.
 *
 * `serve-demo.mjs` is this environment's local twin: same directory, same
 * headers, no VPS. Check there first.
 *
 *   npm run deploy:demo                      build if stale, ship, verify
 *   npm run deploy:demo -- --dry-run         print what would run, touch nothing
 *   npm run deploy:demo -- --build           build regardless
 *   npm run deploy:demo -- --prune-backups 3 keep the three newest .bak- dirs
 *   npm run deploy:demo -- --host gvps --root /var/www/check-it-out.pl
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ROOT, SHELL, buildDemo, buildReason, bundleName } from './demo-build.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 || args[i + 1]?.startsWith('--') ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
const HOST = flag('host', 'gvps');
const WEBROOT = flag('root', '/var/www/check-it-out.pl');
const DOMAINS = flag('domains', 'checkitout.app,check-it-out.pl').split(',');
const KEEP = has('prune-backups') ? Number(flag('prune-backups', '3')) : null;
const log = (m) => console.log(`\x1b[36m[deploy] ${m}\x1b[0m`);
const fail = (m) => {
  console.error(`[deploy] ${m}`);
  process.exit(1);
};

// 1. the build — the same freshness rule the local server and the perf runner use
if (has('no-build')) {
  if (!existsSync(SHELL)) fail(`no build at ${ROOT} — run \`npm run build:demo\` first`);
} else {
  const reason = buildReason({ force: has('build') });
  if (reason) {
    log(`build:demo — ${reason}`);
    if (!buildDemo()) fail('build failed');
  }
}
const bundle = bundleName();
if (!bundle) fail(`no main-*.js referenced by ${SHELL}`);
log(`bundle ${bundle} from ${ROOT}`);

// 2. what the VPS runs, as one script on the far side of `tar | ssh`
const prune =
  KEEP === null
    ? `echo "backups on disk: $(ls -d ${WEBROOT}.bak-* 2>/dev/null | wc -l)"`
    : `ls -dt ${WEBROOT}.bak-* 2>/dev/null | tail -n +${KEEP + 1} | xargs -r sudo rm -rf; echo "backups kept: $(ls -d ${WEBROOT}.bak-* 2>/dev/null | wc -l)"`;
const remote = [
  'set -e',
  `N=${WEBROOT}.new; ROOT=${WEBROOT}`,
  'sudo rm -rf "$N"',
  'sudo install -d -o ubuntu -g www-data -m 755 "$N"',
  'sudo tar xzf - -C "$N" --no-same-owner',
  'sudo chown -R ubuntu:www-data "$N"',
  'sudo chmod -R u=rwX,g=rX,o=rX "$N"',
  'sudo mv "$ROOT" "$ROOT.bak-$(date +%Y%m%d-%H%M%S)"',
  'sudo mv "$N" "$ROOT"',
  `echo "swapped in: $(grep -o 'main-[A-Z0-9]*[.]js' "$ROOT/index.html" | head -1)"`,
  prune,
].join('\n');

if (has('dry-run')) {
  log(`would stream ${ROOT} to ${HOST} and run:`);
  console.log(remote.replace(/^/gm, '    '));
  log(`would then expect ${DOMAINS.join(' and ')} to serve ${bundle}`);
  process.exit(0);
}

// 3. tar | ssh — spawned directly, no shell on either side of the pipe, so the
//    remote script arrives as one argument whatever the local platform quotes
log(`streaming to ${HOST}:${WEBROOT} …`);
const tar = spawn('tar', ['czf', '-', '.'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
const ssh = spawn('ssh', ['-o', 'BatchMode=yes', HOST, remote], {
  stdio: ['pipe', 'inherit', 'inherit'],
});
tar.stdout.pipe(ssh.stdin);
const code = await new Promise((resolve) => ssh.on('close', resolve));
if (code !== 0)
  fail(`ssh exited with ${code} — the old webroot is still in place if the swap did not run`);

// 4. through the edge, cache-busting: the shell must reference the bundle just built
let mismatch = false;
for (const domain of DOMAINS) {
  const html = await (await fetch(`https://${domain}/?v=${Date.now()}`)).text();
  const served = html.match(/main-[A-Z0-9]+\.js/)?.[0] ?? '(no bundle in the shell)';
  const ok = served === bundle;
  mismatch ||= !ok;
  log(`${domain} serves ${served} ${ok ? '— matches' : '— MISMATCH, expected ' + bundle}`);
}
process.exit(mismatch ? 1 : 0);
