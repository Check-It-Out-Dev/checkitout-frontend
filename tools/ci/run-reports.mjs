#!/usr/bin/env node
/**
 * Runs the published-report tier (`e2e-tests/published-reports`) against the quality dashboard.
 *
 * The dashboard is the page the three Pages sites serve, and it is generated markup driven by a
 * run's own data rather than something anyone hand-writes. That makes it exactly the kind of page
 * that regresses in a state nobody looked at: a red run renders tiles a green run never shows, and
 * the flaky list only exists when something flaked. The fixtures under `tools/ci/pages/fixtures`
 * put all of those branches on screen at once, which is why the tier drives `?data=fixtures`
 * rather than live data.
 *
 * Playwright's own `webServer` block serves the application for every other tier, so this script
 * owns the dashboard's server instead of adding a second entry there. It reuses one already
 * listening on the port (the usual case while working on the page) and otherwise starts one and
 * stops it when the tests finish.
 *
 *   npm run test:reports
 *   REPORTS_BASE_URL=https://check-it-out-dev.github.io/checkitout-frontend npm run test:reports
 */
import { spawn, spawnSync } from 'node:child_process';

const PORT = Number(process.env['REPORTS_PORT'] ?? 4302);
const URL = `https://localhost:${PORT}/index.html`;
const log = (m) => console.log(`\x1b[36m[reports] ${m}\x1b[0m`);

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

let server = null;

// An explicit base URL means the caller is pointing the tier at a real published site, so there is
// nothing to serve.
if (!process.env['REPORTS_BASE_URL']) {
  if (probe(URL) === 200) {
    log(`reusing the server already listening on ${PORT}`);
  } else {
    log(`serving tools/ci/pages on ${PORT}`);
    server = spawn('node', ['tools/lh-static-server.mjs', String(PORT), 'tools/ci/pages'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    if (!(await waitFor(URL, 30))) {
      console.error(`[reports] the server never answered on ${URL}`);
      server?.kill();
      process.exit(1);
    }
  }
}

const run = spawnSync(
  'npx',
  ['playwright', 'test', '--project=reports', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: true,
    // The config's webServer block boots `ng serve` for the tiers that test the application. This
    // tier tests a static page it serves itself, so the documented opt-out keeps a second server --
    // and three minutes of Angular build -- out of a twelve-second run.
    env: { ...process.env, PW_EXTERNAL_SERVER: '1' },
  },
);

if (server) {
  // The server is a detached child on Windows when spawned through a shell, so a plain kill leaves
  // it holding the port and the next run silently measures the previous one's files.
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
}

process.exit(run.status ?? 1);
