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
  testIgnore: '**/*.unit.spec.ts',
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
  webServer: {
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
