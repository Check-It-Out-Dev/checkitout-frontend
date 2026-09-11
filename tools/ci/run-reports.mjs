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
 * Nothing here is looked up on PATH. `node` is `process.execPath`, the interpreter already
 * running, which is also how this repository's Node pin stays honest -- `node` on PATH is a
 * different version on at least one machine here. Playwright is the local binary rather than
 * `npx playwright`, because `npx <name>` installs from the public registry when the local bin is
 * missing, and this estate has already had a dropped devDependency run stryker@1.0.1 from 2019 on
 * a runner. And the readiness probe is an https request rather than `curl`, which removes an
 * external tool from the tier's requirements as well as from its PATH surface.
 *
 *   npm run test:reports
 *   REPORTS_BASE_URL=https://check-it-out-dev.github.io/checkitout-frontend npm run test:reports
 */
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:https';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env['REPORTS_PORT'] ?? 4302);
const URL = `https://localhost:${PORT}/index.html`;
const log = (m) => console.log(`\x1b[36m[reports] ${m}\x1b[0m`);

/** The Playwright the lockfile installed, never whatever `npx` would fetch. */
function localBin(name) {
  const bin = join('node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
  if (!existsSync(bin)) {
    console.error(
      `[reports] ${bin} is missing. Run npm ci -- this tier will not install Playwright for you.`,
    );
    process.exit(1);
  }
  return bin;
}

/**
 * Ask the local server for a status code. `rejectUnauthorized: false` because the certificate is
 * the repository's own development one and the host is localhost; it is the same thing `curl -k`
 * was doing, with the trust decision visible.
 */
function probe(url) {
  return new Promise((resolve) => {
    const req = request(url, { rejectUnauthorized: false, timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

async function waitFor(url, seconds) {
  for (let i = 0; i < seconds; i++) {
    if ((await probe(url)) === 200) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

let server = null;

// An explicit base URL means the caller is pointing the tier at a real published site, so there is
// nothing to serve.
if (!process.env['REPORTS_BASE_URL']) {
  if ((await probe(URL)) === 200) {
    log(`reusing the server already listening on ${PORT}`);
  } else {
    log(`serving tools/ci/pages on ${PORT}`);
    server = spawn(
      process.execPath,
      ['tools/lh-static-server.mjs', String(PORT), 'tools/ci/pages'],
      { stdio: 'ignore' },
    );
    if (!(await waitFor(URL, 30))) {
      console.error(`[reports] the server never answered on ${URL}`);
      server?.kill();
      process.exit(1);
    }
  }
}

const run = spawnSync(
  localBin('playwright'),
  ['test', '--project=reports', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    // `.bin/playwright.cmd` is a batch file, which Windows can only start through a shell. The
    // path is ours either way, so nothing is resolved from PATH.
    shell: process.platform === 'win32',
    // The config's webServer block boots `ng serve` for the tiers that test the application. This
    // tier tests a static page it serves itself, so the documented opt-out keeps a second server --
    // and three minutes of Angular build -- out of a twelve-second run.
    env: { ...process.env, PW_EXTERNAL_SERVER: '1' },
  },
);

if (server) {
  // Spawned without a shell now, so the child is ours to kill directly on every platform: the
  // detached-grandchild problem that needed taskkill was the shell in between.
  server.kill('SIGTERM');
}

process.exit(run.status ?? 1);
