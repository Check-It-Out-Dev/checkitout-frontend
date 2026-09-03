/**
 * FE-only: Stage 5b trace-equivalence flow. Compares legacy:4200 ↔
 * greenfield:4201 API-call traces for the same user action. The BE-
 * side coverage of campaign-detail reads lives in the corresponding
 * ported Cucumber spec.
 *
 * Stage 5b — third flow.
 *
 * Influencer navigates directly to a campaign detail page
 * `/collaborations/:id` for a real seeded campaign. Validates trace
 * equivalence on a *resource-by-id* read flow — exercises path
 * canonicalization (UUID/numeric ID segments → `:id`) and ensures both
 * apps fetch the same shape of campaign detail.
 *
 * The campaign ID is discovered before recording starts (a separate
 * pre-flight request that doesn't appear in the captured trace) so the
 * spec doesn't bake a hard-coded ID that breaks on every seed-data refresh.
 *
 * Servers required:
 *   - BE on https://localhost:8080
 *   - legacy FE on https://localhost:4200
 *   - greenfield FE on http://localhost:4201
 *
 * Run: `npm run test:integration -- --grep opportunity-detail`
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
const BE_URL = process.env['BE_URL'] ?? 'https://localhost:8080';

const ACTOR = ACTORS['influencer1']!;

interface CapturedFlow {
  readonly trace: Trace;
}

test.describe('@integration opportunity-detail — legacy ≡ greenfield', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  test('influencer navigating to /collaborations/:id produces equivalent traces', async ({
    browser,
    request,
  }) => {
    // Pre-flight (out-of-trace): obtain a real campaign ID. We use the
    // test-level `request` fixture instead of `page.request` so the call
    // doesn't appear in either captured trace.
    const session = await request.post(`${BE_URL}/api/test/auth/mock-session`, {
      data: { ...ACTOR, partial: false },
      ignoreHTTPSErrors: true,
    });
    if (!session.ok()) {
      throw new Error(`Pre-flight mock-session failed: ${session.status()}`);
    }
    // Mock-session auth is cookie-based (MockSessionResponse carries no
    // token) — the request fixture's cookie jar now holds the session, so
    // the list call below authenticates without an Authorization header.
    const list = await request.get(
      `${BE_URL}/api/partnership-opportunity/paged?page=0&size=1&active=true`,
      {
        ignoreHTTPSErrors: true,
      },
    );
    if (!list.ok()) {
      throw new Error(`Pre-flight list failed: ${list.status()}`);
    }
    const listBody = (await list.json()) as {
      content?: Array<{ id?: string | number }>;
    };
    const firstId = listBody.content?.[0]?.id;
    if (firstId == null) {
      throw new Error('Pre-flight: no active opportunities in seed data');
    }

    const legacy = await captureFlow(browser, LEGACY_URL, String(firstId));
    const greenfield = await captureFlow(browser, GREENFIELD_URL, String(firstId));

    const legacyCanonical = canonicalizeTrace(legacy.trace);
    const greenfieldCanonical = canonicalizeTrace(greenfield.trace);

    const result = diff(legacyCanonical, greenfieldCanonical, {
      mode: 'set',
      ignorePaths: [...FIXTURE_PATHS_TO_IGNORE],
      // Inherit the boot-time drift class from auth-login. Same shell mount
      // on both apps fetches the same set of legacy-only calls.
      expectedAdded: [
        ...BOOT_TIME_GREENFIELD_ONLY,
        // Apply-guard pre-check (task #19, 1c2bd0c): the greenfield detail
        // page queries the influencer's own applications to disable the
        // Apply CTA when they already applied — legacy lets the click hit
        // the BE and surfaces the error after the fact. Deliberate UX
        // improvement, not drift. Triage:
        // docs/parity-review/2026-09-02/opportunity-detail-apply-guard-trace.md
        { method: 'GET', path: '/api/applied-opportunity/paged' },
      ],
      expectedRemoved: [...BOOT_TIME_LEGACY_ONLY],
    });

    if (!result.equivalent) {
      const reportDir = path.resolve(__dirname, '../../../test-results/integration');
      fs.mkdirSync(reportDir, { recursive: true });
      const flow = 'opportunity-detail';
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

async function captureFlow(
  browser: Browser,
  origin: string,
  campaignId: string,
): Promise<CapturedFlow> {
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

    await page.goto(`${origin}/collaborations/${campaignId}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);

    const trace = await recorder.stop();
    return { trace };
  } finally {
    await context.close();
  }
}
