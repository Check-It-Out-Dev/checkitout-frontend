import { expect, test, type APIResponse, type Page } from '@playwright/test';
import type { ConsentStatusDtoOut } from '../../../src/app/api/model/consent-status-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/** BE error response from /test/auth/register-without-firebase + most APIs. */
interface ApiErrorResponse {
  messageKey?: string;
  message?: string;
  status?: number;
}

/**
 * T9/T14 — Port of remaining consent-module.feature scenarios not yet
 * covered by:
 *   - `e2e-tests/integration/auth/consent.spec.ts` (legal docs + cookie
 *     banner + ToS/Privacy prepare + register-without-cookies-400)
 *   - `e2e-tests/integration/flows/oauth-consent-cookie-survival.spec.ts`
 *     (full registration with consent cookies + cookie attributes +
 *     HMAC tamper-detection)
 *
 * This spec adds:
 *
 *   ✅ Missing-consents error precedes email-already-used error. The
 *      order matters because we want the user to fix the consent gap
 *      first; if "email duplicate" was returned first they'd think
 *      registration was blocked for a different reason.
 *   ✅ Consent status endpoint (/legal/consent/my) for authenticated
 *      user — should return newestConsentsAccepted info.
 *
 * Tier C-E scenarios (blocked-user-can-browse, re-consent, full
 * lifecycle, grace-period days-remaining) all need either:
 *   - `/test/legal/set-published-at` test endpoint (e2e profile)
 *   - `/test/legal/reset-consents` test endpoint
 *   - Cron-job invocation via test endpoint
 *   - BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS status (set via cron OR admin
 *     PATCH which has Firebase claim blocker)
 *
 * All deferred to T1 + e2e profile.
 *
 * Run: `npm run test:integration -- --grep consent-extras`
 */

const UNIQUE_EMAIL = () =>
  `t14-cnsx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function api(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const url = `${GREENFIELD_URL}/api${path}`;
  if (method === 'GET') {
    return page.request.get(url, { ignoreHTTPSErrors: true, failOnStatusCode: false });
  }
  return page.request.post(url, { data, ignoreHTTPSErrors: true, failOnStatusCode: false });
}

async function acceptCookieBanner(page: Page): Promise<APIResponse> {
  return api(page, 'POST', '/legal/anonymous/consent', {
    documentName: 'cookie_policy_v1_pl.pdf',
    language: 'pl',
    isTrusted: true,
  });
}

async function prepareConsent(
  page: Page,
  documentType: 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY',
): Promise<APIResponse> {
  return api(page, 'POST', '/legal/consent/prepare', {
    documentType,
    version: 1,
    documentHash: `e2e-test-hash-${documentType}`,
    proof: {
      timestamp: Date.now(),
      eventTrusted: true,
      screenX: 100,
      screenY: 200,
      checkboxId: `consent-checkbox-${documentType.toLowerCase()}`,
    },
  });
}

test.describe('@consent-extras — remainder of consent-module.feature not covered elsewhere', () => {
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

  // --------------------------------------------------------------------
  // Consent-required error precedes email-already-used error
  // --------------------------------------------------------------------
  test('@consent-validation missing-consents error precedes email-already-used', async ({
    page,
  }) => {
    const email = UNIQUE_EMAIL();

    // First: pre-create the user so the email is taken.
    const ensureRes = await api(page, 'POST', '/test/auth/ensure-user', {
      email,
      role: 'COMPANY',
    });
    if (ensureRes.status() === 404) {
      test.skip(true, '/test/auth/ensure-user not registered in this BE profile.');
    }
    expect(ensureRes.status(), 'ensure-user setup should be 2xx').toBeLessThan(300);

    // Second: try to register the SAME email WITHOUT consent cookies.
    // Expectation: 400 with consent-required error, NOT email-duplicate
    // (consent guard fires earlier).
    await page.context().clearCookies();
    const regRes = await api(page, 'POST', '/test/auth/register-without-firebase', {
      email,
      password: 'TestPassword123!',
      userType: 'COMPANY',
      firstName: 'E2E',
      lastName: 'Test',
    });
    expect(
      regRes.status(),
      `register w/o consents on existing email should be 400 (consent guard fires first), got ${regRes.status()}`,
    ).toBe(400);
    const body = (await regRes.json().catch(() => null)) as ApiErrorResponse | null;
    const messageKey = (body?.messageKey ?? '').toLowerCase();
    // The error should mention CONSENT, not "email already used" or "duplicate".
    expect(
      messageKey.includes('consent'),
      `error should mention consent (not email duplicate), got messageKey=${body?.messageKey}`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // Consent status endpoint — authenticated user
  // --------------------------------------------------------------------
  test('@consent-status authenticated user can GET /legal/consent/my', async ({ page }) => {
    // Seed a user with all consents accepted via the full registration
    // chain (matches what oauth-consent-cookie-survival.spec already
    // exercises in @scenario-1, isolated here for status-endpoint focus).
    await page.context().clearCookies();
    const banner = await acceptCookieBanner(page);
    if (banner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered in this BE profile.');
    }
    expect(banner.status()).toBe(200);
    expect((await prepareConsent(page, 'TERMS_OF_SERVICE')).status()).toBe(200);
    expect((await prepareConsent(page, 'PRIVACY_POLICY')).status()).toBe(200);

    const email = UNIQUE_EMAIL();
    const regRes = await api(page, 'POST', '/test/auth/register-without-firebase', {
      email,
      password: 'TestPassword123!',
      userType: 'COMPANY',
      firstName: 'E2E',
      lastName: 'CnsStatus',
    });
    expect(regRes.status(), `register should be 200`).toBe(200);

    // Mock-session for the same email so we have an authenticated context
    // for the /legal/consent/my call.
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    const statusRes = await api(page, 'GET', '/legal/consent/my');
    expect(
      statusRes.status(),
      `GET /legal/consent/my should be 200, got ${statusRes.status()}`,
    ).toBe(200);
    const body = (await statusRes.json()) as ConsentStatusDtoOut;
    // newestConsentsAccepted must be present (truthy or falsy is BE state-dependent;
    // we just verify the field exists and is boolean).
    expect(
      typeof body.newestConsentsAccepted,
      `body.newestConsentsAccepted should be boolean, got ${typeof body.newestConsentsAccepted}`,
    ).toBe('boolean');
  });

  // --------------------------------------------------------------------
  // Lifecycle scenarios — most now live in consent-lifecycle.spec.ts
  // since the BE dev-profile unlock (commit b1b12657) made
  // /test/legal/* reachable in dev. The fixmes below are the ones
  // genuinely still blocked.
  // --------------------------------------------------------------------
  //
  //   ✅ @lifecycle blocked user 403 + X-Consent-Required on POST
  //      → consent-lifecycle.spec.ts `@blocked-restrictions` (covers BOTH
  //         the 403-on-write half AND the 200-on-read half of soft-block)
  //   ✅ @lifecycle consent-enforcement-cron blocks user past grace period
  //      → consent-lifecycle.spec.ts `@enforcement-cron 40-day-backdated`
  //   ✅ @lifecycle blocked user CAN browse + access /users/me (soft block)
  //      → consent-lifecycle.spec.ts `@blocked-restrictions` (same test)

  // --------------------------------------------------------------------
  // Lifecycle: blocked user re-consents and regains access.
  //
  // The original fixme assumed the BE flipped status via UserService /
  // Firebase claims — wrong. LegalConsentService.recordAuthenticatedConsentBatch
  // (lines 341-399) flips BLOCKED→ACTIVE inline, atomically, in a single
  // transaction, with no Firebase call. The only `User` mutations are
  // accountStatus + newestConsentsAccepted + tokenVersion + cache evict.
  //
  // Two variants:
  //   @shortcut uses `/test/legal/accept-all-consents` (BE state-machine
  //     only — fast regression canary).
  //   @production-path drives the full cookie+HMAC+record-batch flow that
  //     real users actually take.
  // --------------------------------------------------------------------
  test('@lifecycle @shortcut blocked user re-consents via accept-all-consents', async ({
    page,
  }) => {
    // Register a user via the consent-aware test endpoint
    await page.context().clearCookies();
    const banner = await acceptCookieBanner(page);
    if (banner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered in this BE profile.');
    }
    expect(banner.status()).toBe(200);
    expect((await prepareConsent(page, 'TERMS_OF_SERVICE')).status()).toBe(200);
    expect((await prepareConsent(page, 'PRIVACY_POLICY')).status()).toBe(200);

    const email = UNIQUE_EMAIL();
    const reg = await api(page, 'POST', '/test/auth/register-without-firebase', {
      email,
      password: 'TestPassword123!',
      userType: 'COMPANY',
      firstName: 'E2E',
      lastName: 'CnsRestoreShort',
    });
    expect(reg.status(), `register should be 200`).toBe(200);

    // Drive into BLOCKED state
    const block = await api(page, 'POST', '/test/auth/set-account-status', {
      email,
      status: 'BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS',
    });
    if (block.status() === 404) {
      test.skip(true, '/test/auth/set-account-status not registered in this BE profile.');
    }
    expect(block.status(), `set-account-status BLOCKED should be 200`).toBe(200);

    // Shortcut endpoint — mirrors the production restoration path:
    // newestConsentsAccepted=true + accountStatus=ACTIVE + tokenVersion bump
    const restore = await api(page, 'POST', '/test/legal/accept-all-consents', { email });
    if (restore.status() === 404) {
      test.skip(true, '/test/legal/accept-all-consents not registered in this BE profile.');
    }
    expect(
      restore.status(),
      `accept-all-consents should be 200, got ${restore.status()}: ${await restore.text()}`,
    ).toBe(200);

    const body = (await restore.json()) as {
      newestConsentsAccepted: boolean;
      wasBlocked: boolean;
      accountStatus: string;
    };
    expect(body.wasBlocked, 'wasBlocked should be true (user was BLOCKED before restore)').toBe(
      true,
    );
    expect(body.newestConsentsAccepted, 'newestConsentsAccepted must be true post-restore').toBe(
      true,
    );
    expect(body.accountStatus, `accountStatus must be ACTIVE post-restore`).toBe('ACTIVE');
  });

  test('@lifecycle @production-path blocked user re-consents via record-batch', async ({
    page,
  }) => {
    // Pre-register with consent cookies so newestConsentsAccepted is initially true
    await page.context().clearCookies();
    const banner = await acceptCookieBanner(page);
    if (banner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered in this BE profile.');
    }
    expect(banner.status()).toBe(200);
    expect((await prepareConsent(page, 'TERMS_OF_SERVICE')).status()).toBe(200);
    expect((await prepareConsent(page, 'PRIVACY_POLICY')).status()).toBe(200);

    const email = UNIQUE_EMAIL();
    const reg = await api(page, 'POST', '/test/auth/register-without-firebase', {
      email,
      password: 'TestPassword123!',
      userType: 'COMPANY',
      firstName: 'E2E',
      lastName: 'CnsRestoreProd',
    });
    expect(reg.status(), `register should be 200`).toBe(200);

    // Drive into BLOCKED state (flips newestConsentsAccepted=false)
    const block = await api(page, 'POST', '/test/auth/set-account-status', {
      email,
      status: 'BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS',
    });
    if (block.status() === 404) {
      test.skip(true, '/test/auth/set-account-status not registered in this BE profile.');
    }
    expect(block.status()).toBe(200);

    // Authenticate as the blocked user
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    // Seed 3 HMAC consent cookies (one per required type) via /legal/consent/prepare
    for (const type of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'] as const) {
      expect((await prepareConsent(page, type)).status()).toBe(200);
    }
    // Cookie banner doesn't need a separate prepare; the /legal/anonymous/consent
    // call above already issued the cookie_consent_* cookies which the BE accepts
    // for COOKIE_POLICY in the record-batch.

    // Production-path restoration call — exercises L391-395 directly
    const batch = await api(page, 'POST', '/legal/consent/record-batch', {
      records: [
        { documentType: 'TERMS_OF_SERVICE', action: 'RECONSENTED' },
        { documentType: 'PRIVACY_POLICY', action: 'RECONSENTED' },
        { documentType: 'COOKIE_POLICY', action: 'RECONSENTED' },
      ],
    });
    if (batch.status() === 404) {
      test.skip(true, '/legal/consent/record-batch not registered in this BE profile.');
    }
    expect(
      batch.status(),
      `record-batch should be 200, got ${batch.status()}: ${await batch.text()}`,
    ).toBe(200);

    // The successful restore bumped tokenVersion (LegalConsentService:393),
    // so the session JWT is now stale → /test/legal/user-consent-status via
    // the authenticated session returns 419. Clear cookies and query the
    // test endpoint anonymously (it's a no-auth state inspector by email).
    await page.context().clearCookies();
    const status = await api(
      page,
      'GET',
      `/test/legal/user-consent-status?email=${encodeURIComponent(email)}`,
    );
    expect(status.status(), `status query should be 200`).toBe(200);
    const sBody = (await status.json()) as {
      accountStatus: string;
      newestConsentsAccepted: boolean;
    };
    expect(sBody.accountStatus, `accountStatus must be ACTIVE post-restore`).toBe('ACTIVE');
    expect(sBody.newestConsentsAccepted, `newestConsentsAccepted must be true`).toBe(true);
  });

  // ----------------------------------------------------------------
  // Grace-period days-to-accept countdown
  // ----------------------------------------------------------------
  //
  // Ports `consent-lifecycle.feature:47-63` (Section B, @grace-period):
  //
  //   - Days remaining computed correctly within grace period (10 days-ago
  //     → daysToAcceptNewTerms ≈ 28; grace-period config is 38 days, so
  //     38 - 10 = 28).
  //   - Days remaining is 0 when grace period expired (40 days-ago → 0).
  //
  // The earlier fixme premise was wrong — `ConsentStatusDtoOut`
  // already exposes `daysToAcceptNewTerms` (see legal/dto/...DtoOut.java)
  // and the `/test/legal/set-published-at` + `/test/legal/reset-consents`
  // endpoints are already available in the dev profile (BE commit
  // b1b12657 unlocked them). All that was missing was the FE port.
  //
  // Approach: register a COMPANY user with all consents accepted,
  // globally backdate document published_at via the test endpoint, reset
  // the user's consent acceptance to false, seedSession, then GET
  // /api/legal/consent/my and read daysToAcceptNewTerms.
  //
  // Cleanup is critical: set-published-at is GLOBAL. afterEach resets it
  // to "0 days ago" so the next test starts from a clean slate.

  async function isoNDaysAgo(daysAgo: number): Promise<string> {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d
      .toISOString()
      .replace(/Z$/, '')
      .replace(/\.\d{3}$/, '');
  }

  async function registerCompanyWithConsents(page: Page): Promise<string> {
    await page.context().clearCookies();
    const banner = await acceptCookieBanner(page);
    expect(banner.status(), 'cookie banner accept should be 200').toBe(200);
    expect((await prepareConsent(page, 'TERMS_OF_SERVICE')).status()).toBe(200);
    expect((await prepareConsent(page, 'PRIVACY_POLICY')).status()).toBe(200);

    const email = UNIQUE_EMAIL();
    const regRes = await api(page, 'POST', '/test/auth/register-without-firebase', {
      email,
      password: 'TestPassword123!',
      userType: 'COMPANY',
      firstName: 'E2E',
      lastName: 'Grace',
    });
    expect(regRes.status(), `register should be 200`).toBe(200);
    return email;
  }

  test.describe('@lifecycle grace-period days-to-accept countdown', () => {
    test.describe.configure({ mode: 'serial' });

    // Cleanup: reset published_at back to "now" so subsequent tests in
    // the suite (or future runs) start from a clean slate. set-published-at
    // is GLOBAL — leaking stale backdates between tests is the
    // most-likely flake source.
    test.afterEach(async ({ page }) => {
      const reset = await api(page, 'POST', '/test/legal/set-published-at', {
        publishedAt: await isoNDaysAgo(0),
      });
      // Don't fail the test if cleanup 404s — the assertion is on the
      // test-run side, not on cleanup hygiene. Log via annotation.
      if (reset.status() !== 200) {
        test.info().annotations.push({
          type: 'cleanup-warning',
          description: `set-published-at cleanup returned ${reset.status()} — may leak to next test`,
        });
      }
    });

    test('within grace period: 10-day-ago documents → daysToAcceptNewTerms ≈ 28', async ({
      page,
    }) => {
      const email = await registerCompanyWithConsents(page);

      const backdate = await api(page, 'POST', '/test/legal/set-published-at', {
        publishedAt: await isoNDaysAgo(10),
      });
      if (backdate.status() === 404) {
        test.skip(true, '/test/legal/set-published-at not registered in this BE profile.');
      }
      expect(backdate.status(), 'set-published-at should be 200').toBe(200);

      const reset = await api(page, 'POST', '/test/legal/reset-consents', { email });
      expect(reset.status(), `reset-consents should be 2xx, got ${reset.status()}`).toBeLessThan(
        300,
      );

      await page.context().clearCookies();
      await seedSession(page, email, 'COMPANY');

      const statusRes = await api(page, 'GET', '/legal/consent/my');
      expect(
        statusRes.status(),
        `GET /legal/consent/my should be 200, got ${statusRes.status()}`,
      ).toBe(200);
      const body = (await statusRes.json()) as ConsentStatusDtoOut;

      expect(body.newestConsentsAccepted, 'newestConsentsAccepted should be false').toBe(false);
      // Grace period is 38 days (default config). 38 - 10 = 28. Allow
      // ±2 days of jitter for date arithmetic + cron-job clock skew.
      expect(
        body.daysToAcceptNewTerms,
        `daysToAcceptNewTerms should be ~28 (38 grace - 10 elapsed), got ${body.daysToAcceptNewTerms}`,
      ).toBeGreaterThanOrEqual(26);
      expect(body.daysToAcceptNewTerms).toBeLessThanOrEqual(30);
    });

    test('past grace period: 40-day-ago documents → daysToAcceptNewTerms = 0', async ({ page }) => {
      const email = await registerCompanyWithConsents(page);

      const backdate = await api(page, 'POST', '/test/legal/set-published-at', {
        publishedAt: await isoNDaysAgo(40),
      });
      if (backdate.status() === 404) {
        test.skip(true, '/test/legal/set-published-at not registered in this BE profile.');
      }
      expect(backdate.status(), 'set-published-at should be 200').toBe(200);

      const reset = await api(page, 'POST', '/test/legal/reset-consents', { email });
      expect(reset.status(), `reset-consents should be 2xx, got ${reset.status()}`).toBeLessThan(
        300,
      );

      await page.context().clearCookies();
      await seedSession(page, email, 'COMPANY');

      const statusRes = await api(page, 'GET', '/legal/consent/my');
      expect(statusRes.status(), `GET /legal/consent/my should be 200`).toBe(200);
      const body = (await statusRes.json()) as ConsentStatusDtoOut;

      expect(body.newestConsentsAccepted, 'newestConsentsAccepted should be false').toBe(false);
      // Past grace period → max(0, 38-40) = 0.
      expect(
        body.daysToAcceptNewTerms,
        `daysToAcceptNewTerms should be 0 past grace period, got ${body.daysToAcceptNewTerms}`,
      ).toBe(0);
    });
  });
});
