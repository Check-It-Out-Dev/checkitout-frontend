#!/usr/bin/env node
/**
 * F0e companion — Greenfield-actual capture script.
 *
 * Mirrors `capture-legacy-baseline.mjs` but against the greenfield FE
 * (`GREENFIELD_URL`, default http://localhost:4201). Used by the Stage 5a
 * AI screenshot review: produces fresh greenfield actuals on disk so the
 * recipe in `reference_ai_screenshot_review_recipe.md` can read pairs of
 * (legacy baseline, greenfield actual) for semantic diffing.
 *
 * Why standalone (not via parity.spec.ts):
 *   - Diverged routes flag `expectedDiverged: true` and the spec catches
 *     their failures, so Playwright never persists the actual PNG to
 *     test-results. AI review needs the PNG on disk regardless of pass/fail.
 *   - We don't need the diff artifact — we just need the screenshot.
 *
 * Output: `e2e-tests/visual-parity/greenfield-actuals/<id>-<project>.png`
 *
 * Usage (needs --experimental-strip-types for the manifest .ts import):
 *   node --experimental-strip-types tools/capture-greenfield-actual.mjs
 *   node --experimental-strip-types tools/capture-greenfield-actual.mjs --project=chromium-desktop
 *   node --experimental-strip-types tools/capture-greenfield-actual.mjs --project=mobile-chrome
 *   node --experimental-strip-types tools/capture-greenfield-actual.mjs --project=mobile-safari
 *   node --experimental-strip-types tools/capture-greenfield-actual.mjs --project=tablet-safari
 *   node --experimental-strip-types tools/capture-greenfield-actual.mjs --route=landing,auth-sign-in
 *
 * Auth: F2 mock-session pattern. Cookie + localStorage seed via
 * `addInitScript`. See memory `reference_mock_session_token_pattern.md`.
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, webkit, devices } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const GREENFIELD_URL = process.env.GREENFIELD_URL ?? 'http://localhost:4201';

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

const OUTPUT_DIR = resolve(ROOT, 'e2e-tests/visual-parity/greenfield-actuals');

const ACTOR_PROFILES = {
  company1: { email: 'company1@e2e.test', role: 'COMPANY' },
  influencer1: { email: 'influencer1@e2e.test', role: 'INFLUENCER' },
  admin1: { email: 'admin1@e2e.test', role: 'ADMIN' },
};

function parseArgs(argv) {
  const args = { project: null, routes: null };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--project=')) args.project = a.split('=')[1];
    else if (a.startsWith('--route=')) args.routes = a.split('=')[1].split(',');
  }
  return args;
}

async function loadManifest() {
  // Node 23+ supports `--experimental-strip-types` (default-on for simple
  // .ts files). The manifest is plain enums + a const array — no fancy TS
  // syntax — so direct dynamic import works.
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
      `Failed to import parity-manifest.ts (need Node 22+ with type-stripping). Original error: ${err.message}`,
    );
  }
}

async function authenticate(page, actor) {
  if (!actor) return;
  const profile = ACTOR_PROFILES[actor];
  if (!profile) throw new Error(`Unknown actor: ${actor}`);
  const res = await page.request.post(`${GREENFIELD_URL}/api/test/auth/mock-session`, {
    data: { email: profile.email, role: profile.role, partial: false },
    ignoreHTTPSErrors: true,
  });
  if (!res.ok()) {
    throw new Error(
      `mock-session failed for ${actor}: ${res.status()} ${await res.text()}`,
    );
  }
  const body = await res.json();
  if (!body.token) {
    throw new Error(
      `mock-session for ${actor} did not return a token — BE older than F2 fix?`,
    );
  }
  await page.addInitScript((token) => {
    localStorage.setItem('cio.idToken', token);
  }, body.token);
}

async function captureRoute(browser, projectName, project, route) {
  const outFile = join(OUTPUT_DIR, `${route.id}-${projectName}.png`);

  const context = await browser.newContext(project.contextOptions);
  const page = await context.newPage();
  try {
    await authenticate(page, route.actor);
    const url = `${GREENFIELD_URL}${route.path}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    if (route.waitFor) await page.waitForSelector(route.waitFor, { timeout: 15_000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);
    const buf = await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      scale: 'css',
    });
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, buf);
    console.log(`  [ok]   ${route.id} → ${outFile}`);
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

  console.log(`Capturing ${routes.length} greenfield actuals × ${projects.length} project(s):`);
  console.log(`  greenfield: ${GREENFIELD_URL}`);
  for (const p of projects) {
    const v = PROJECTS[p];
    console.log(`  project:    ${p} (${v.width}×${v.height}${v.isMobile ? ', mobile' : ''})`);
  }
  console.log(`  output:     ${OUTPUT_DIR}`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const summary = { captured: 0, failed: 0, results: [] };
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
        const result = await captureRoute(browser, projectName, project, r);
        summary.results.push({ ...result, project: projectName });
        summary[result.status === 'captured' ? 'captured' : 'failed'] += 1;
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  console.log(`\nDone. captured=${summary.captured}, failed=${summary.failed}`);
  if (summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
