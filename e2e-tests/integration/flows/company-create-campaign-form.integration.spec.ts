/**
 * FE-only: Stage 5b trace-equivalence flow. Compares legacy:4200 ↔
 * greenfield:4201 API-call traces for the same user action — verifies
 * the FE rewrite emits the same request surface as legacy. No BE
 * Cucumber counterpart because the BE doesn't care which client made
 * the calls; the BE side is asserted indirectly via the standard
 * integration ports (partnership-create.spec.ts etc.).
 *
 * Stage 5b — fourth flow.
 *
 * Company logs in, navigates to `/collaborations/create` (campaign creation
 * form). Validates trace equivalence on a *form-load* read flow — exercises
 * dropdown-population calls (cities, content types, compensation types,
 * currencies, etc.) that legacy fires when the form mounts.
 *
 * No mutation — the form is just rendered. The Submit button is not
 * clicked. This isolates the form-init API surface from the create POST,
 * which lands as a separate flow once BE state-reset infrastructure is in.
 *
 * Servers required:
 *   - BE on https://localhost:8080
 *   - legacy FE on https://localhost:4200
 *   - greenfield FE on http://localhost:4201
 *
 * Run: `npm run test:integration -- --grep company-create-campaign-form`
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

test.describe('@integration company-create-campaign-form — legacy ≡ greenfield', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  test('company landing on /collaborations/create produces equivalent traces', async ({
    browser,
  }) => {
    const legacy = await captureFlow(browser, LEGACY_URL);
    const greenfield = await captureFlow(browser, GREENFIELD_URL);

    const legacyCanonical = canonicalizeTrace(legacy.trace);
    const greenfieldCanonical = canonicalizeTrace(greenfield.trace);

    const result = diff(legacyCanonical, greenfieldCanonical, {
      mode: 'set',
      ignorePaths: [...FIXTURE_PATHS_TO_IGNORE],
      // Boot-time drift + page-specific drifts. Since #35a (bc2a63e) the
      // greenfield form owns the full DtoIn surface, so it fires the same
      // four dictionary fetches legacy does — the old "deferred to v1.1"
      // expectedRemoved entries for them are gone. Two page-specific removals
      // remain legitimately legacy-only: the form's city is free-text (no
      // /address/user/:id prefetch) and compensation types are a closed enum
      // in the FE (no /compensation/type fetch). Triage:
      // docs/parity-review/2026-05-09/company-create-campaign-form-trace.md
      // + docs/parity-review/2026-09-02/create-form-dictionaries-trace.md
      expectedAdded: [...BOOT_TIME_GREENFIELD_ONLY],
      expectedRemoved: [
        ...BOOT_TIME_LEGACY_ONLY,
        // Page-specific dictionary fetches legacy makes and greenfield doesn't:
        { method: 'GET', path: '/api/address/user/:id' },
        { method: 'GET', path: '/api/partnership-opportunity/compensation/type' },
      ],
      // Same call, deliberately different paging shape: greenfield fetches
      // each dictionary WHOLE (size=100, page omitted); legacy sends no
      // params and takes the server default of 20, which silently truncates
      // the 56-row service-type dictionary to 20. Divergence-for-correctness
      // — we do not replicate a legacy truncation bug. Currency is NOT
      // listed: legacy already used size=100 there, so greenfield matches it
      // byte-for-byte. Triage:
      // docs/parity-review/2026-09-02/create-form-dictionaries-trace.md
      expectedChanged: [
        { method: 'GET', path: '/api/platform/paged' },
        { method: 'GET', path: '/api/content-type/paged' },
        { method: 'GET', path: '/api/service-type/paged' },
      ],
    });

    if (!result.equivalent) {
      const reportDir = path.resolve(__dirname, '../../../test-results/integration');
      fs.mkdirSync(reportDir, { recursive: true });
      const flow = 'company-create-campaign-form';
      fs.writeFileSync(path.join(reportDir, `${flow}-diff.md`), renderDiffMarkdown(result));
      fs.writeFileSync(
        path.join(reportDir, `${flow}-legacy.canonical.json`),
        JSON.stringify(legacyCanonical, null, 2),
      );
      fs.writeFileSync(
        path.join(reportDir, `${flow}-greenfield.canonical.json`),
        JSON.stringify(greenfieldCanonical, null, 2),
      );
    }

    expect(result.equivalent, renderDiffMarkdown(result)).toBe(true);
  });
});

async function captureFlow(browser: Browser, origin: string): Promise<CapturedFlow> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // pl-PL so legacy matches greenfield's pinned Polish default (see
    // auth-login) — compares API structure, not the intended locale difference.
    locale: 'pl-PL',
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    await authenticate(context, page, ACTOR, origin);

    const recorder = new TraceRecorder(context);
    await recorder.start();

    await page.goto(`${origin}/collaborations/create`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);

    const trace = await recorder.stop();
    return { trace };
  } finally {
    await context.close();
  }
}
