/**
 * pm2 ecosystem config for the local full-stack dev topology.
 *
 * Bring up the whole stack with:
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs           # tail everything
 *   pm2 status         # at-a-glance health
 *   pm2 stop all
 *
 * Three pm2-managed processes (BE + legacy FE + greenfield FE) plus the
 * docker-managed Postgres + Redis = 5 services in the dev topology.
 *
 * Prerequisite (NOT managed by pm2):
 *   docker compose -f ../checkitout-backend/docker-compose-dev-redis.yml up -d
 *
 * Paths assume:
 *   <parent>/checkitout-backend/   (backend)
 *   <parent>/checkItOut-fe/        (legacy frontend, private - optional)
 *   <parent>/checkitout-frontend/  (this repo)
 *
 * Override REPO_ROOT env var if you check out elsewhere.
 */

const path = require('path');
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const BE = path.resolve(REPO_ROOT, 'checkitout-backend');
const LEGACY = path.resolve(REPO_ROOT, 'checkItOut-fe');
const GREENFIELD = path.resolve(REPO_ROOT, 'checkitout-frontend');
const LOG_DIR = path.resolve(
  process.env.HOME || process.env.USERPROFILE,
  '.checkitout-dev/logs',
);

// On Windows, pm2's `script: 'npm'` resolves to npm.cmd and tries to
// run it through Node, which chokes on the BAT comment syntax (`:: ...`).
// Workaround: invoke `ng serve` (FE) and `mvnw.cmd` (BE) directly through
// `cmd.exe /c` so Windows treats the .cmd as a batch script.
const cmdExe = 'cmd.exe';

// Angular 22's dev server calls tls.getCACertificates (Node >= 22.22 / 24.15;
// .nvmrc pins 24.15.0). The global portable node is v23.3.0, which lacks the
// API — the serve builds, then dies unbound. Prepend the pinned runtime for
// the greenfield app only; legacy (Angular 17) and the BE shim are fine on
// the global node.
const NODE24 = path.resolve(
  process.env.USERPROFILE || process.env.HOME,
  'portable',
  'node-v24.15.0-win-x64',
);

module.exports = {
  apps: [
    {
      name: 'be',
      cwd: BE,
      // Node shim (see scripts/start-be.js) — pm2's cmd.exe arg assembly
      // mangles quoted/bare mvnw invocations on Windows; the shim spawns
      // the Maven wrapper itself. Profiles: e2e registers the test-auth
      // endpoint the parity/integration Playwright tiers authenticate
      // through; dev AFTER e2e keeps the real local datasource; ssl is
      // mandatory (both FE proxies target https://localhost:8080).
      script: path.resolve(__dirname, 'scripts', 'start-be.js'),
      env: { SPRING_PROFILES_ACTIVE: 'e2e,dev,ssl' },
      windowsHide: true,
      // BE startup ~30s; pm2 default 1500ms restart-delay would thrash it.
      max_restarts: 5,
      restart_delay: 5000,
      out_file: path.join(LOG_DIR, 'be.out.log'),
      error_file: path.join(LOG_DIR, 'be.err.log'),
    },
    {
      name: 'legacy-fe',
      cwd: LEGACY,
      script: cmdExe,
      args: '/c npx ng serve',
      windowsHide: true,
      max_restarts: 5,
      restart_delay: 3000,
      out_file: path.join(LOG_DIR, 'legacy.out.log'),
      error_file: path.join(LOG_DIR, 'legacy.err.log'),
    },
    {
      name: 'greenfield-fe',
      cwd: GREENFIELD,
      script: cmdExe,
      // Greenfield's `start` script is `ng serve` — port + proxy come from
      // angular.json so no extra args needed.
      args: '/c npx ng serve',
      env: { PATH: `${NODE24};${process.env.PATH}` },
      windowsHide: true,
      max_restarts: 5,
      restart_delay: 3000,
      out_file: path.join(LOG_DIR, 'greenfield.out.log'),
      error_file: path.join(LOG_DIR, 'greenfield.err.log'),
    },
  ],
};
