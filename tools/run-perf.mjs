#!/usr/bin/env node
/**
 * Runs the smoothness tier (`e2e-tests/perf`) against a served DEMO build.
 *
 * The guided tours only exist in the demo configuration, and Playwright's own
 * `webServer` block serves the default one for every other tier — adding a
 * second entry there would boot a demo server for the visual runs too. So this
 * script owns that server instead: it reuses one already listening on 4300
 * (the usual case while working), otherwise starts one and stops it when the
 * tests finish.
 *
 * It serves the BUILT demo, not `ng serve`. Production is a directory of built
 * files behind nginx, so a dev build with a dev-mode renderer was never the
 * thing being measured — and the dev server also needs Node 24 for Angular 22's
 * `tls.getCACertificates`, which is how a whole live run once died before a
 * single test executed. `tools/serve-demo.mjs` has no such requirement and
 * starts in milliseconds. The build is rebuilt when anything under src/ is
 * newer than it, so the tier cannot quietly measure yesterday's bundle.
 *
 *   npm run test:perf
 *   PERF_BASE_URL=https://www.checkitout.app npm run test:perf   (live)
 */
import { spawn, spawnSync } from 'node:child_process';
import { buildDemo, stale } from './demo-build.mjs';

const PORT = 4300;
const URL = `http://localhost:${PORT}/`;
const log = (m) => console.log(`\x1b[36m[perf] ${m}\x1b[0m`);

function probe(url) {
  const r = spawnSync(
    'curl',
    ['-sk', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '4', url],
    { encoding: 'utf8', shell: true },
  );
  return parseInt((r.stdout || '').trim(), 10) || 0;
}

async function waitFor(url, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (probe(url) === 200) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const base = process.env['PERF_BASE_URL'];
let server;

/** Build the demo if the sources have moved on since the last one. */
function rebuildIfStale() {
  if (!stale()) return;
  log('the demo build is missing or older than src/ — building it');
  if (!buildDemo()) {
    log('build:demo failed');
    process.exit(1);
  }
}

if (base) {
  log(`measuring ${base} (PERF_BASE_URL)`);
} else if (probe(URL) === 200) {
  // The freshness check belongs here too, and used to sit only in the branch
  // that starts a server. A server left running from earlier work therefore
  // turned the check off: two fixes were written, tested against the bundle
  // from before them, and reported as not working. `serve-demo` reads from
  // disk per request, so rebuilding under it is enough; an `ng serve` on this
  // port rebuilds itself and this is a no-op.
  rebuildIfStale();
  log(`reusing whatever is already serving ${URL}`);
} else {
  rebuildIfStale();
  log(`serving the built demo on ${URL} …`);
  server = spawn('node', ['tools/serve-demo.mjs', '--port', String(PORT), '--no-build'], {
    shell: true,
    stdio: 'ignore',
    detached: false,
  });
  if (!(await waitFor(URL, 60))) {
    log('the demo server did not come up — is something else holding 4300?');
    server?.kill();
    process.exit(1);
  }
  log('demo server up');
}

// One worker, always: `fullyParallel: false` only serialises within a file, so
// the moment the tier grew a second spec Playwright started running them side
// by side again — and two workers sharing this machine drop frames in each
// other's measurements. Pass --workers=N after the script name to override.
const run = spawnSync(
  'npx',
  ['playwright', 'test', '--project=perf', '--workers=1', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: true,
    // PERF_TIER tells playwright.config.ts to skip its global webServer: this
    // tier already has the server it needs, and booting the default one costs
    // the whole run on a machine whose PATH Node cannot start Angular 22.
    env: { ...process.env, PERF_TIER: '1' },
  },
);

if (server?.pid) {
  log('stopping the demo server this run started');
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
}
process.exit(run.status ?? 1);
