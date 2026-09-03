#!/usr/bin/env node
/**
 * F0a — Legacy-baseline capture script.
 *
 * Walks every route in `e2e-tests/visual-parity/parity-manifest.ts` against
 * the legacy FE running at `LEGACY_URL` (default http://localhost:4200) and
 * captures full-page PNG baselines. Authenticates via the BE's
 * `/test/auth/mock-session` endpoint at `BE_URL` (default
 * https://localhost:8080).
 *
 * Output: `e2e-tests/visual-parity/parity.spec.ts-snapshots/<id>-<project>.png`
 * — placed exactly where Playwright's `toHaveScreenshot` looks for baselines,
 * so the parity spec can compare greenfield captures against them.
 *
 * Usage:
 *   node tools/capture-legacy-baseline.mjs                            # all routes × all 4 projects
 *   node tools/capture-legacy-baseline.mjs --project=chromium-desktop # desktop chromium only
 *   node tools/capture-legacy-baseline.mjs --project=mobile-chrome    # Pixel 7 chromium only
 *   node tools/capture-legacy-baseline.mjs --project=mobile-safari    # iPhone 14 webkit only
 *   node tools/capture-legacy-baseline.mjs --project=tablet-safari    # iPad Pro 11 webkit only
 *   node tools/capture-legacy-baseline.mjs --force                    # overwrite existing baselines
 *   node tools/capture-legacy-baseline.mjs --route=landing,auth-sign-in
 *   LEGACY_URL=http://localhost:4200 node tools/capture-legacy-baseline.mjs
 *
 * Idempotent by default (skips routes whose baseline already exists). Pass
 * --force to recapture.
 *
 * Prereqs:
 *   - pm2 has `legacy-fe` (port 4200) + `be` (port 8080) running
 *   - BE is on the test profile (so /test/auth/mock-session works)
 *   - `npx playwright install chromium` (and `webkit` for safari projects)
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, webkit, devices } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const LEGACY_URL = process.env.LEGACY_URL ?? 'https://localhost:4200';
const BE_URL = process.env.BE_URL ?? 'https://localhost:8080';

// Mirror playwright.config.ts projects. Default captures BOTH desktop and
// mobile so visual-parity covers responsive breakpoints from day one. Use
// --project=chromium-desktop or --project=mobile-chrome to limit.
//
// Mobile contexts inherit `devices['Pixel 7']` (touch events, mobile UA,
// isMobile=true) so the legacy app's responsive breakpoints fire the same
// way they would on a real device. Anything less and the layout reflows
// like a narrow desktop and we miss real mobile divergences.
// `locale: 'en-US'` matches what playwright.config.ts sets for the parity
// spec — without it the legacy capture picks up the system locale (PL on
// this dev machine), greenfield runs in EN, and the diff fights about
// language differences instead of layout.
const PROJECTS = {
  'chromium-desktop': {
    engine: chromium,
    contextOptions: {
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      ignoreHTTPSErrors: true,
    },
    width: 1440,
    height: 900,
    isMobile: false,
  },
  'mobile-chrome': {
    engine: chromium,
    contextOptions: { ...devices['Pixel 7'], locale: 'en-US', ignoreHTTPSErrors: true },
    width: devices['Pixel 7'].viewport.width,
    height: devices['Pixel 7'].viewport.height,
    isMobile: true,
  },
  // Webkit-backed projects — Stage 5d. Catches Safari-specific rendering vs
  // Chromium. Run `npx playwright install webkit` (~150 MB) before first use.
  'mobile-safari': {
    engine: webkit,
    contextOptions: { ...devices['iPhone 14'], locale: 'en-US', ignoreHTTPSErrors: true },
    width: devices['iPhone 14'].viewport.width,
    height: devices['iPhone 14'].viewport.height,
    isMobile: true,
  },
  'tablet-safari': {
    engine: webkit,
    contextOptions: { ...devices['iPad Pro 11'], locale: 'en-US', ignoreHTTPSErrors: true },
    width: devices['iPad Pro 11'].viewport.width,
    height: devices['iPad Pro 11'].viewport.height,
    isMobile: true,
  },
};

const BASELINE_DIR = resolve(ROOT, 'e2e-tests/visual-parity/parity.spec.ts-snapshots');

const ACTOR_PROFILES = {
  company1: { email: 'company1@e2e.test', role: 'COMPANY' },
  influencer1: { email: 'influencer1@e2e.test', role: 'INFLUENCER' },
  admin1: { email: 'admin1@e2e.test', role: 'ADMIN' },
};

function parseArgs(argv) {
  const args = { force: false, project: null, routes: null };
  for (const a of argv.slice(2)) {
    if (a === '--force') args.force = true;
    else if (a.startsWith('--project=')) args.project = a.split('=')[1];
    else if (a.startsWith('--route=')) args.routes = a.split('=')[1].split(',');
  }
  return args;
}

async function loadManifest() {
  // Node 23+ supports `--experimental-strip-types` for direct .ts imports.
  // Replaces an earlier regex parser that choked when divergedReason
  // strings contained colons (e.g. "Content-density divergence:..."). See
  // memory reference_node_strip_types_for_ts_imports.md.
  const url = pathToFileURL(
    resolve(ROOT, 'e2e-tests/visual-parity/parity-manifest.ts'),
  ).href;
  try {
    const mod = await import(url);
    if (!Array.isArray(mod.PARITY_ROUTES)) {
      throw new Error('PARITY_ROUTES export missing from parity-manifest.ts');
    }
    return mod.PARITY_ROUTES;
  } catch (err) {
    throw new Error(
      `Failed to import parity-manifest.ts (need Node 22+ with --experimental-strip-types). Original: ${err.message}`,
    );
  }
}

async function authenticate(page, actor) {
  if (!actor) return;
  const profile = ACTOR_PROFILES[actor];
  if (!profile) throw new Error(`Unknown actor: ${actor}`);
  const res = await page.request.post(`${BE_URL}/api/test/auth/mock-session`, {
    data: { email: profile.email, role: profile.role, partial: false },
    ignoreHTTPSErrors: true,
  });
  if (!res.ok()) {
    throw new Error(
      `mock-session failed for ${actor}: ${res.status()} ${await res.text()}`,
    );
  }
}

async function captureRoute(browser, projectName, project, route, force) {
  // Filename must match Playwright's default snapshot naming convention so
  // `toHaveScreenshot(<id>-<project>.png)` finds the baseline. Playwright
  // auto-appends `-<platform>` (`-win32`, `-darwin`, `-linux`) and the
  // capture script must mirror that.
  const baselineFile = join(
    BASELINE_DIR,
    `${route.id}-${projectName}-${process.platform}.png`,
  );
  if (existsSync(baselineFile) && !force) {
    console.log(`  [skip] ${route.id} (baseline exists; --force to overwrite)`);
    return { id: route.id, status: 'skipped' };
  }

  const context = await browser.newContext(project.contextOptions);
  const page = await context.newPage();
  try {
    await authenticate(page, route.actor);
    const url = `${LEGACY_URL}${route.path}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    if (route.waitFor) await page.waitForSelector(route.waitFor, { timeout: 15_000 });
    // Quiet down web fonts + animations.
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);
    // CRITICAL: `scale: 'css'` matches `toHaveScreenshot`'s default. Without it,
    // mobile baselines come out at devicePixelRatio (1082×N for Pixel 7) while
    // greenfield comparison reads CSS pixels (412×N) → every mobile diff fails
    // on dimensions before pixel comparison even starts.
    const buf = await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      scale: 'css',
    });
    mkdirSync(dirname(baselineFile), { recursive: true });
    writeFileSync(baselineFile, buf);
    console.log(`  [ok]   ${route.id} → ${baselineFile}`);
    return { id: route.id, status: 'captured', bytes: buf.length };
  } catch (err) {
    console.log(`  [fail] ${route.id}: ${err.message}`);
    return { id: route.id, status: 'failed', error: err.message };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  // No --project flag → capture every viewport so visual-parity has both
  // desktop and mobile baselines on the same run.
  const projects = args.project ? [args.project] : Object.keys(PROJECTS);
  for (const p of projects) {
    if (!PROJECTS[p]) {
      console.error(`Unknown project '${p}'. Known: ${Object.keys(PROJECTS).join(', ')}`);
      process.exit(1);
    }
  }

  let routes = await loadManifest();
  if (args.routes) {
    const set = new Set(args.routes);
    routes = routes.filter((r) => set.has(r.id));
    if (routes.length === 0) {
      console.error(`No routes matched --route=${args.routes.join(',')}`);
      process.exit(1);
    }
  }

  console.log(`Capturing ${routes.length} legacy baselines × ${projects.length} project(s):`);
  console.log(`  legacy:  ${LEGACY_URL}`);
  console.log(`  be:      ${BE_URL}`);
  for (const p of projects) {
    const v = PROJECTS[p];
    console.log(`  project: ${p} (${v.width}×${v.height}${v.isMobile ? ', mobile' : ''})`);
  }
  console.log(`  output:  ${BASELINE_DIR}`);

  mkdirSync(BASELINE_DIR, { recursive: true });

  const summary = { captured: 0, skipped: 0, failed: 0, results: [] };
  // One browser per engine — open a fresh chromium / webkit instance only
  // when a project's engine differs from the previous one. Reusing across
  // projects of the same engine (e.g. chromium-desktop + mobile-chrome)
  // saves ~5s of launch overhead per project.
  let browser;
  let currentEngine = null;
  try {
    for (const projectName of projects) {
      const project = PROJECTS[projectName];
      if (project.engine !== currentEngine) {
        if (browser) await browser.close();
        browser = await project.engine.launch();
        currentEngine = project.engine;
      }
      console.log(
        `\n[${projectName}] ${project.width}×${project.height}${project.isMobile ? ' (mobile)' : ''}`,
      );
      for (const r of routes) {
        const result = await captureRoute(browser, projectName, project, r, args.force);
        summary.results.push({ ...result, project: projectName });
        summary[
          result.status === 'captured'
            ? 'captured'
            : result.status === 'skipped'
              ? 'skipped'
              : 'failed'
        ] += 1;
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  console.log(
    `\nDone. captured=${summary.captured}, skipped=${summary.skipped}, failed=${summary.failed}`,
  );
  if (summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
