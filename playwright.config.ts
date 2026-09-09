import * as path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// Load real-Firebase test secrets from e2e-tests/.env if present. Absent
// .env → process.env stays unchanged → real-login.ts helpers throw
// MissingCredentialsError and the depending @login-real / @admin-2fa tests
// self-skip. Mock-session tests stay green. Template at
// e2e-tests/.env.example; never commit the filled-in .env (gitignored).
loadDotenv({ path: path.resolve(__dirname, 'e2e-tests', '.env') });

// BDD (Cucumber-oracle) tier. `bddgen` compiles e2e-tests/bdd/features/*.feature
// + steps into runnable spec files under `.features-gen/` (outside e2e-tests,
// so the device projects' testDir don't double-run them). The `bdd` project
// below points its testDir at that generated dir. Run via `npm run test:bdd`
// (bddgen && playwright test --project=bdd). Chromium-only, like integration.
const bddTestDir = defineBddConfig({
  features: 'e2e-tests/bdd/features/**/*.feature',
  steps: 'e2e-tests/bdd/steps/**/*.ts',
});

/**
 * Playwright config — multiple suite types × up to four device projects.
 * Suites are filtered by directory:
 *
 * - `e2e-tests/sandbox/`        → per-component sandbox routes (chromium engines only)
 * - `e2e-tests/visual/`         → byte-stable per-component snapshots (chromium engines only — see in-spec test.skip)
 * - `e2e-tests/visual-parity/`  → legacy-vs-greenfield diff (all 4 device projects)
 * - `e2e-tests/integration/`    → trace-equivalence flows (chromium-desktop only — see in-spec test.skip)
 * - `e2e-tests/scenarios/`      → Cucumber-style multi-actor flows (vanilla Playwright + Actor framework)
 * - `e2e-tests/msw/`            → end-to-end flow with MSW intercepts
 * - `e2e-tests/smoke/`          → live BE smoke
 *
 * Device matrix: desktop chromium + Pixel 7 + iPhone 14 + iPad Pro 11.
 * Webkit needs `npx playwright install webkit` (~150 MB) on first setup.
 */
export default defineConfig({
  testDir: './e2e-tests',
  // The smoothness tier needs a served DEMO build, so it stays out of every
  // other run and is driven by `npm run test:perf` (its own project below).
  testIgnore: ['**/*.unit.spec.ts', '**/perf/**'],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['html'], ['github']] : 'list',

  use: {
    baseURL: process.env['PW_BASE_URL'] ?? 'https://localhost:4201',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  },

  // Sandbox tests run against the dev server. The webServer block boots
  // ng serve before the suite starts and tears it down after — no manual
  // setup needed when running `npm run test:sandbox`.
  //
  // The smoothness tier is the exception: it measures a DEMO build, so
  // `tools/run-perf.mjs` owns its own server on 4300 (or points at production
  // through PERF_BASE_URL) and sets PERF_TIER so this block stays out of the
  // way. Leaving it in booted a second, default-configuration `ng serve` under
  // whatever Node is on PATH — which on this box is 23.x, where Angular 22's
  // dev server dies on `tls.getCACertificates` and takes the whole run with it.
  // The tier then reports nothing at all, which is worse than reporting a
  // regression.
  //
  // PW_EXTERNAL_SERVER is the same opt-out for a server this process does not
  // own: the Kubernetes shards (deploy/k8s/tests/playwright-indexed-job.yaml)
  // point PW_BASE_URL at the frontend Service and must not boot ng serve.
  webServer: process.env['PERF_TIER'] || process.env['PW_EXTERNAL_SERVER']
    ? undefined
    : {
        command: 'npm run start -- --port=4201',
        url: 'https://localhost:4201',
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000,
        ignoreHTTPSErrors: true,
      },

  projects: [
    {
      // Cucumber-oracle tier (playwright-bdd). testDir = the bddgen output.
      // Chromium-only by construction, matching the integration tier's rule.
      name: 'bdd',
      testDir: bddTestDir,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    // Webkit-backed device projects — iPhone 14 (mobile) + iPad Pro 11 (tablet).
    // Catches Safari-specific rendering quirks vs Chromium that pixel-diff on
    // Chromium alone would miss. Stage 5d hardening for the v1.0 cutover.
    // Run `npx playwright install webkit` (~150 MB) before first use.
    //
    // Scoped to the visual-parity tier only — the one suite documented above as
    // "all 4 device projects". The functional tiers (sandbox, visual,
    // integration, scenarios, msw) are chromium-engines-only by design (they
    // assert copy/state/layout that chromium-desktop + mobile-chrome already
    // cover); letting webkit pick them up produces cross-engine interaction
    // timeouts with no added signal. `testMatch` enforces that at the project
    // boundary so no per-spec guard is needed.
    {
      // Smoothness tier — timings, layout drift and change-detection cost
      // rather than pixels. `tools/run-perf.mjs` serves the demo build for it.
      name: 'perf',
      testDir: './e2e-tests/perf',
      testIgnore: '**/*.unit.spec.ts',
      // One at a time: two workers sharing this machine drop frames in each
      // other's measurements, and a dropped frame here is supposed to mean
      // the demo dropped it.
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-safari',
      testMatch: '**/visual-parity/**/*.spec.ts',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'tablet-safari',
      testMatch: '**/visual-parity/**/*.spec.ts',
      use: { ...devices['iPad Pro 11'] },
    },
  ],
});
