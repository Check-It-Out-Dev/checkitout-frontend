/**
 * Stage 5b — first integration flow.
 *
 * Validates the trace-equivalence machinery end-to-end: drives the same
 * login flow against legacy :4200 and greenfield :4201, captures network
 * traces from each, canonicalizes, and asserts equivalence.
 *
 * **This is the simplest possible flow** — proves the recorder + canonicalize
 * + diff pipeline works against a real BE before harder flows go in. Other
 * flow specs follow the same shape (boot → auth → drive → record → diff).
 *
 * Servers required:
 *   - BE on https://localhost:8080 (test profile, mock-session active)
 *   - legacy FE on http://localhost:4200
 *   - greenfield FE on https://localhost:4201
 *
 * Run: `npm run test:integration -- --grep auth-login`
 */

import path from 'node:path';
import fs from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
import { ACTORS } from '../../_framework/actor';
import { authenticate } from '../../_framework/auth';
import {
  BOOT_TIME_GREENFIELD_ONLY,
  BOOT_TIME_LEGACY_ONLY,
  canonicalizeTrace,
  diff,
  FIXTURE_PATHS_TO_IGNORE,
  renderDiffMarkdown,
  TraceRecorder,
  type Trace,
} from '../_trace';

const LEGACY_URL = process.env['LEGACY_URL'] ?? 'https://localhost:4200';
const GREENFIELD_URL = process.env['GREENFIELD_URL'] ?? 'https://localhost:4201';

const ACTOR = ACTORS['company1']!;

interface CapturedFlow {
  readonly trace: Trace;
}

test.describe('@integration auth-login — legacy ≡ greenfield', () => {
  // Integration trace-equivalence is browser-agnostic — comparing legacy
  // vs greenfield on the same engine. Running 4× across the visual-parity
  // device matrix would just expose browser-specific noise. Restrict to
  // chromium-desktop. (Visual parity, by contrast, NEEDS cross-browser.)
  //
  // Trace canonicalization is timing-sensitive: when the full suite runs
  // in fullyParallel mode, other tests hitting :4200/:4201 can perturb
  // call ordering enough to fail the set-mode diff. Retries absorb that
  // flakiness — the test passes 3/3 in isolation. Real fix (lower
  // priority) would be to make canonicalize tolerant of call-count
  // variance under load.
  test.describe.configure({ retries: 2 });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  test('login round-trip via mock-session produces equivalent traces', async ({ browser }) => {
    const legacy = await captureLogin(browser, LEGACY_URL);
    const greenfield = await captureLogin(browser, GREENFIELD_URL);

    const legacyCanonical = canonicalizeTrace(legacy.trace);
    const greenfieldCanonical = canonicalizeTrace(greenfield.trace);

    const result = diff(legacyCanonical, greenfieldCanonical, {
      // Both apps may have unrelated calls during page boot (telemetry,
      // health-checks). For this landing-after-login flow we use set-mode
      // so call ordering noise doesn't fail on cosmetic differences.
      mode: 'set',
      ignorePaths: [...FIXTURE_PATHS_TO_IGNORE],
      // Boot-time drift class — common across all authenticated flows.
      // Source of truth: docs/parity-review/2026-05-09/auth-login-trace.md.
      expectedRemoved: [...BOOT_TIME_LEGACY_ONLY],
      // greenfield-only: the shell's profile-completeness primary-address probe.
      expectedAdded: [...BOOT_TIME_GREENFIELD_ONLY],
    });

    if (!result.equivalent) {
      const reportPath = path.resolve(
        __dirname,
        '../../../test-results/integration',
        'auth-login-diff.md',
      );
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, renderDiffMarkdown(result));
      // Also dump the raw canonical traces for forensic debugging.
      fs.writeFileSync(
        reportPath.replace('-diff.md', '-legacy.canonical.json'),
        JSON.stringify(legacyCanonical, null, 2),
      );
      fs.writeFileSync(
        reportPath.replace('-diff.md', '-greenfield.canonical.json'),
        JSON.stringify(greenfieldCanonical, null, 2),
      );
    }

    expect(result.equivalent, renderDiffMarkdown(result)).toBe(true);
  });
});

/**
 * Drives the login flow against an FE origin and returns the captured trace.
 * Steps:
 *   1. Open a fresh BrowserContext
 *   2. Hit `${origin}/api/test/auth/mock-session` (proxied → BE) to obtain
 *      session + session_sig HttpOnly cookies on the BrowserContext.
 *   3. Start recording.
 *   4. Navigate to a route that requires auth (`/collaborations/list`) —
 *      exercises the auth guard + the first authenticated read. Cookies
 *      are sent automatically via withCredentials: true on the OpenAPI
 *      client config.
 *   5. Stop recording, return trace.
 *
 * Both legacy and greenfield are cookie-only — no localStorage seeding.
 * See memory `feedback_no_client_token_storage`.
 */
async function captureLogin(browser: Browser, origin: string): Promise<CapturedFlow> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Greenfield is hard-pinned to Polish at boot (app.config defaultLang:'pl',
    // iter-107) and sends Accept-Language:pl regardless of browser locale.
    // Pin the browser locale to pl-PL so legacy (which derives its language
    // from navigator.language) also sends pl — the trace then compares API
    // structure under one locale instead of failing on the intended
    // en-vs-pl default difference + its localized response fields.
    locale: 'pl-PL',
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    await authenticate(context, page, ACTOR, origin);

    const recorder = new TraceRecorder(context);
    await recorder.start();

    await page.goto(`${origin}/collaborations/list`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);

    const trace = await recorder.stop();
    return { trace };
  } finally {
    await context.close();
  }
}
