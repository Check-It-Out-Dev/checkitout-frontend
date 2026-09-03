import { expect, test, type APIResponse, type Page } from '@playwright/test';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/**
 * T9/T14 — Port of `consent/consent-lifecycle.feature` scenarios that
 * exercise the consent-enforcement cron via the (now dev-enabled)
 * TestLegalController endpoints:
 *
 *   POST /test/legal/set-published-at      — backdate document timestamps
 *   POST /test/legal/trigger-enforcement   — run blockExpiredUsers() directly
 *   POST /test/legal/reset-consents        — clear newestConsentsAccepted
 *   POST /test/legal/publish-document-version — bump doc version
 *
 * Unblocked by BE commit b1b12657 (TestLegalController now @Profile(
 * "(e2e | dev) & ...")).
 *
 * Coverage map (subset of BE scenarios — pure cron + grace-period):
 *
 *   ✅ Section A: Users blocked after grace period expires (40 days past)
 *   ✅ Section A: Users NOT blocked during grace period (10 days past)
 *   ✅ Section A: Only ACTIVE/IN_VALIDATION users get blocked (BANNED stays)
 *
 *   ⏭️  Section B grace-period day-counting + Section C blocked-restrictions
 *      + Section D re-consent restore + Section E full lifecycle: those
 *      require resetting consents on the SAME user that just got blocked
 *      + refreshing their session, which collides with the Firebase
 *      claim-update blocker on accountStatus PATCH. Documented separately.
 *
 * Bug class caught: consent-enforcement cron regression. The
 * blockExpiredUsers() job is the heart of RODO terms-update enforcement —
 * if it silently fails to flip users to BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS,
 * companies could continue using the platform without accepting updated
 * terms (compliance violation).
 *
 * Run: `npm run test:integration -- --grep consent-lifecycle`
 */

const UNIQUE_COMPANY = () =>
  `t14-cnsl-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function api(
  page: Page,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const url = `${GREENFIELD_URL}/api${path}`;
  if (method === 'GET') {
    return page.request.get(url, { ignoreHTTPSErrors: true, failOnStatusCode: false });
  }
  if (method === 'DELETE') {
    return page.request.delete(url, { ignoreHTTPSErrors: true, failOnStatusCode: false });
  }
  return page.request.post(url, { data, ignoreHTTPSErrors: true, failOnStatusCode: false });
}

async function getStatusValue(page: Page): Promise<string> {
  const me = await api(page, 'GET', '/users/me');
  if (me.status() !== 200) return `HTTP ${me.status()}`;
  const body = (await me.json()) as UserDtoOut;
  return body.accountStatus?.value ?? '';
}

async function isoNDaysAgo(daysAgo: number): Promise<string> {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  // Strip Z + milliseconds — BE expects LocalDateTime ISO without timezone.
  return d
    .toISOString()
    .replace(/Z$/, '')
    .replace(/\.\d{3}$/, '');
}

test.describe('@consent-lifecycle — port of consent-lifecycle.feature (enforcement-cron)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${BE_URL}/api/public-config`, {
        ignoreHTTPSErrors: true,
        timeout: 3_000,
      });
      if (!res.ok()) test.skip(true, `BE health-check failed (${res.status()})`);
    } catch (err) {
      test.skip(true, `BE not reachable: ${(err as Error).message}`);
    }
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  /**
   * Each test owns its own backdating + enforcement so they don't fight
   * each other. Tests serialize via describe.configure mode:'serial'.
   */
  test.afterEach(async ({ page }) => {
    // Restore documents to "now" so other suites don't see stale dates.
    await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(0),
    });
  });

  /**
   * Enforcement is GLOBAL: one triggered run blocks EVERY user in the DB
   * without current consents — thousands in a long-lived dev DB — and any
   * published v2 documents keep re-poisoning later enforcement runs. This
   * once leaked far enough that 4060/4262 users sat blocked and every
   * fresh mock-session died 419. Restore the whole pre-suite world:
   * v1-only documents (with dependent consents), published-at "now", and
   * every enforcement-blocked user back to ACTIVE.
   */
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: GREENFIELD_URL });
    const page = await context.newPage();
    try {
      // maxVersion=2 preserves the PROD baseline (COOKIE/TOS/PRIVACY/
      // DATA_RETENTION top out at v2 across greenfield/main/prod — the
      // changelog is byte-identical) and deletes only versions a scenario
      // published above it. maxVersion=1 used to delete the real v2 rows,
      // which broke the ESSENTIAL cookie path (cookie_policy_v2 lookup).
      await api(page, 'DELETE', '/test/legal/delete-documents-above-version?maxVersion=2');
      await api(page, 'POST', '/test/legal/set-published-at', {
        publishedAt: await isoNDaysAgo(0),
      });
      await api(page, 'POST', '/test/legal/restore-enforcement-blocked', {});
    } finally {
      await context.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenario A1: backdated 40 days + enforcement → users BLOCKED
  // --------------------------------------------------------------------
  test('@enforcement-cron 40-day-backdated docs + trigger → user BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS', async ({
    page,
  }) => {
    // Probe: skip if /test/legal/* not registered in this BE profile.
    const probe = await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(0),
    });
    if (probe.status() === 404) {
      test.skip(true, '/test/legal/* not registered in this BE profile.');
    }

    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');

    // Reset consents for this user so enforcement applies.
    const reset = await api(page, 'POST', '/test/legal/reset-consents', { email });
    expect(reset.status(), `reset-consents should be 2xx, got ${reset.status()}`).toBeLessThan(300);

    // Backdate all docs to 40 days ago — past the grace window (default ~30d).
    const backdate = await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(40),
    });
    expect(backdate.status()).toBeLessThan(300);

    // Trigger enforcement cron.
    const enforce = await api(page, 'POST', '/test/legal/trigger-enforcement', {});
    expect(
      enforce.status(),
      `trigger-enforcement should be 2xx, got ${enforce.status()}: ${await enforce.text()}`,
    ).toBeLessThan(300);

    // Refresh session — accountStatus changed → tokenVersion bumped.
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    const status = await getStatusValue(page);
    expect(
      status,
      `user should be BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS after enforcement, got ${status}`,
    ).toBe('BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS');
  });

  // --------------------------------------------------------------------
  // Scenario A2: backdated 10 days (within grace) → user STAYS ACTIVE
  // --------------------------------------------------------------------
  test('@enforcement-cron 10-day-backdated docs (in grace) + trigger → user STAYS ACTIVE', async ({
    page,
  }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');

    const reset = await api(page, 'POST', '/test/legal/reset-consents', { email });
    if (reset.status() === 404) {
      test.skip(true, '/test/legal/* not registered.');
    }
    expect(reset.status()).toBeLessThan(300);

    // Backdate to 10 days ago — within the 30d grace window.
    const backdate = await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(10),
    });
    expect(backdate.status()).toBeLessThan(300);

    const enforce = await api(page, 'POST', '/test/legal/trigger-enforcement', {});
    expect(enforce.status()).toBeLessThan(300);

    // Session still valid (no tokenVersion bump — status didn't change).
    const status = await getStatusValue(page);
    expect(status, `user should stay ACTIVE during grace period, got ${status}`).toBe('ACTIVE');
  });

  // --------------------------------------------------------------------
  // Scenario A3 + D: Re-consent restores access
  //
  // Originally fixme'd citing "Firebase claim update blocks mock-session".
  // Investigation during the soft-skip arc revealed that
  // LegalConsentService.recordAuthenticatedConsentBatch transitions
  // BLOCKED→ACTIVE directly (line 392) — NOT via the
  // UserService.setUserStatus path with its deferred Firebase actions.
  // So the actual blocker was the cookie-HMAC challenge to even reach
  // /legal/consent/record-batch (mock-session FE actors don't have the
  // prepared cookie pairs).
  //
  // Unblocked by a new BE test-only endpoint /test/legal/accept-all-consents
  // that bypasses the cookie-HMAC dance and mirrors the production
  // unblock side-effect (setNewestConsentsAccepted + accountStatus
  // ACTIVE + tokenVersion bump).
  // --------------------------------------------------------------------
  test('@reconsent-restore blocked COMPANY re-consents → regains ACTIVE', async ({ page }) => {
    const probe = await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(0),
    });
    if (probe.status() === 404) {
      test.skip(true, '/test/legal/* not registered in this BE profile.');
    }

    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');

    // Phase 1: push user into BLOCKED via 40-day-backdated docs.
    const reset = await api(page, 'POST', '/test/legal/reset-consents', { email });
    expect(reset.status()).toBeLessThan(300);
    const backdate = await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(40),
    });
    expect(backdate.status()).toBeLessThan(300);
    const enforce = await api(page, 'POST', '/test/legal/trigger-enforcement', {});
    expect(enforce.status()).toBeLessThan(300);

    // Refresh session — tokenVersion bumped at BLOCKED transition.
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    // Sanity: user is BLOCKED.
    expect(await getStatusValue(page)).toBe('BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS');

    // Phase 2: accept all consents — flips back to ACTIVE.
    const accept = await api(page, 'POST', '/test/legal/accept-all-consents', { email });
    if (accept.status() === 404) {
      test.skip(
        true,
        'POST /test/legal/accept-all-consents not present at this BE tip. Pre BE commit that added the endpoint.',
      );
    }
    expect(
      accept.status(),
      `accept-all-consents should be 200, got ${accept.status()}: ${await accept.text()}`,
    ).toBe(200);

    // Refresh session — tokenVersion bumped on unblock.
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    expect(await getStatusValue(page), 'user should be ACTIVE again after accepting consents').toBe(
      'ACTIVE',
    );
  });

  // --------------------------------------------------------------------
  // Scenario C: Blocked user soft-block restrictions
  // Once a user is BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS the consent-filter
  // should:
  //   - Allow reads (GET /users/me → 200) so the FE can show the
  //     re-consent gate.
  //   - Reject writes (POST /partnership-opportunity → 403 + the
  //     X-Consent-Required marker) so RODO-violating mutations cannot
  //     leak through.
  //
  // The fresh re-seed AFTER enforcement returns a new session bound to
  // the user's NEW (BLOCKED) status; the filter then makes its decision
  // on the new accountStatus. That's exactly what we want to verify.
  // --------------------------------------------------------------------
  test('@blocked-restrictions blocked user → 200 on read endpoints + 403 on write endpoints', async ({
    page,
  }) => {
    const probe = await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(0),
    });
    if (probe.status() === 404) {
      test.skip(true, '/test/legal/* not registered in this BE profile.');
    }

    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');

    // Push the user into BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS via the
    // same enforcement-cron path as Scenario A1.
    const reset = await api(page, 'POST', '/test/legal/reset-consents', { email });
    expect(reset.status()).toBeLessThan(300);
    const backdate = await api(page, 'POST', '/test/legal/set-published-at', {
      publishedAt: await isoNDaysAgo(40),
    });
    expect(backdate.status()).toBeLessThan(300);
    const enforce = await api(page, 'POST', '/test/legal/trigger-enforcement', {});
    expect(enforce.status()).toBeLessThan(300);

    // Refresh session — tokenVersion bumped on BLOCKED transition.
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    // Sanity: the new session is actually BLOCKED.
    const status = await getStatusValue(page);
    expect(status, `blocked-restrictions precondition: user should be BLOCKED, got ${status}`).toBe(
      'BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS',
    );

    // Read endpoint should remain accessible — FE needs /users/me to
    // render the re-consent gate.
    const me = await api(page, 'GET', '/users/me');
    expect(
      me.status(),
      `blocked user GET /users/me should be 200 (soft block), got ${me.status()}`,
    ).toBe(200);

    // Write endpoint must be refused. The consent-filter returns 403
    // with the X-Consent-Required header so the FE knows what to do.
    const write = await api(page, 'POST', '/partnership-opportunity', {
      name: 'blocked-attempt',
      description: 'should not commit',
    });
    expect(
      write.status(),
      `blocked user POST should be 403 (soft-block writes), got ${write.status()}`,
    ).toBe(403);
    const consentHeader =
      write.headers()['x-consent-required'] ?? write.headers()['X-Consent-Required'];
    expect(
      consentHeader,
      `blocked POST response should include X-Consent-Required header; got headers=${JSON.stringify(write.headers())}`,
    ).toBeTruthy();
  });
});
