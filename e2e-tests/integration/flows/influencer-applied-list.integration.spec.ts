/**
 * FE-only: Stage 5b trace-equivalence flow. Compares legacy:4200 ↔
 * greenfield:4201 API-call traces for the same user action. BE
 * coverage of the same data flow lives in the corresponding ported
 * Cucumber spec.
 *
 * Stage 5b — second flow.
 *
 * Influencer logs in, lands on `/collaborations/registrations` (applied
 * opportunities list). Validates trace equivalence on a *different* actor
 * (influencer1 vs auth-login's company1) and a *different* page surface
 * — the first list-render flow that hits applied-opportunity endpoints.
 *
 * Servers required:
 *   - BE on https://localhost:8080 (test profile, mock-session active)
 *   - legacy FE on https://localhost:4200
 *   - greenfield FE on http://localhost:4201
 *
 * Run: `npm run test:integration -- --grep influencer-applied-list`
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

const ACTOR = ACTORS['influencer1']!;

interface CapturedFlow {
  readonly trace: Trace;
}

test.describe('@integration influencer-applied-list — legacy ≡ greenfield', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  test('influencer landing on /collaborations/registrations produces equivalent traces', async ({
    browser,
  }) => {
    const legacy = await captureFlow(browser, LEGACY_URL);
    const greenfield = await captureFlow(browser, GREENFIELD_URL);

    const legacyCanonical = canonicalizeTrace(legacy.trace);
    const greenfieldCanonical = canonicalizeTrace(greenfield.trace);

    const result = diff(legacyCanonical, greenfieldCanonical, {
      mode: 'set',
      ignorePaths: [...FIXTURE_PATHS_TO_IGNORE],
      // Boot-time drift inherited from the authenticated shell.
      // Plus 4 page-specific drifts from the bucket-strategy difference.
      // See docs/parity-review/2026-05-09/influencer-applied-list-trace.md
      // for the architectural rationale; greenfield's 1-call approach is
      // acceptable for v1.0 (median user <50 applications) but breaks at
      // scale, tracked for v1.1 SOTA refactor.
      expectedAdded: [...BOOT_TIME_GREENFIELD_ONLY],
      expectedRemoved: [
        ...BOOT_TIME_LEGACY_ONLY,
        // Page-specific (legacy's per-bucket fetch pattern):
        { method: 'GET', path: '/api/applied-opportunity/statistics' },
        { method: 'GET', path: '/api/applied-opportunity/paged' },
        { method: 'GET', path: '/api/applied-opportunity/paged' },
        { method: 'GET', path: '/api/applied-opportunity/paged' },
      ],
      expectedChanged: [
        // The single paged call greenfield makes vs legacy's first paged
        // call differs in shape (legacy filters by opportunityStatus +
        // size=6; greenfield uses size=50 sort=createdTime,desc unfiltered).
        { method: 'GET', path: '/api/applied-opportunity/paged' },
      ],
    });

    if (!result.equivalent) {
      const reportDir = path.resolve(__dirname, '../../../test-results/integration');
      fs.mkdirSync(reportDir, { recursive: true });
      const flow = 'influencer-applied-list';
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

    await page.goto(`${origin}/collaborations/registrations`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);

    const trace = await recorder.stop();
    return { trace };
  } finally {
    await context.close();
  }
}
