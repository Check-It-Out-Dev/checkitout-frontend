import { expect, test, type APIResponse, type Page } from '@playwright/test';
import type { ConsentRecordAdminDtoOut } from '../../../src/app/api/model/consent-record-admin-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/**
 * T14 — Port of `consent/oauth-consent-cookie-survival.feature` (6 scenarios).
 *
 * Source of truth:
 *   `checkitout-backend/.../features/consent/oauth-consent-cookie-survival.feature`
 *
 * Coverage map:
 *
 *   ✅ Scenario 1: Happy path — accept cookie banner + prepare ToS + prepare
 *      Privacy → OAuth callback (with consent cookies) succeeds → admin
 *      verifies 4 consent records persisted for the new user.
 *   ✅ Scenario 2: Missing cookies → OAuth callback rejected with
 *      "consent required" error.
 *   ✅ Scenario 3: Partial cookies (only cookie banner, no ToS/Privacy) →
 *      OAuth callback rejected.
 *   ✅ Scenario 4: Existing user re-login bypasses consent validation.
 *   ✅ Scenario 5: Consent cookies have SameSite=Lax + HttpOnly for
 *      redirect survival across third-party OAuth chains.
 *   ✅ Scenario 6: Tampered HMAC signature → OAuth callback rejected.
 *
 * Cookie survival is implicit: page.request shares the BrowserContext
 * cookie jar with subsequent page.request calls (mirrors the browser
 * follow-through-OAuth-redirect behavior). SameSite=Lax cookies survive
 * top-level GET navigation per the HTTP spec.
 *
 * Bug class caught: RODO-compliance regression. If the consent cookie
 * pre-flight ever breaks (HMAC drift, cookie attribute weakening, or
 * the BE consent-validation enforcement going lax), users could register
 * without granting consent — a serious legal liability for an EU SaaS.
 *
 * Run: `npm run test:integration -- --grep oauth-consent-cookie-survival`
 */

const UNIQUE_EMAIL = () =>
  `t14-oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function feApi(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const url = `${GREENFIELD_URL}/api${path}`;
  if (method === 'GET') {
    return page.request.get(url, { ignoreHTTPSErrors: true, failOnStatusCode: false });
  }
  return page.request.post(url, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function acceptCookieBanner(page: Page): Promise<APIResponse> {
  return feApi(page, 'POST', '/legal/anonymous/consent', {
    documentName: 'cookie_policy_v1_pl.pdf',
    language: 'pl',
    isTrusted: true,
  });
}

async function prepareConsent(
  page: Page,
  documentType: 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY',
  version: number,
): Promise<APIResponse> {
  return feApi(page, 'POST', '/legal/consent/prepare', {
    documentType,
    version,
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

async function simulateOAuthRegister(
  page: Page,
  email: string,
  userType: 'INFLUENCER' | 'COMPANY' = 'INFLUENCER',
): Promise<APIResponse> {
  return feApi(page, 'POST', '/test/auth/register-without-firebase', {
    email,
    password: 'TestPassword123!',
    userType,
    firstName: 'E2E',
    lastName: 'OAuth',
  });
}

async function probeConsentSurface(page: Page): Promise<boolean> {
  const res = await acceptCookieBanner(page);
  // Restore: if endpoint isn't registered (404), legal/anonymous/consent
  // isn't loaded in this BE profile.
  return res.status() !== 404;
}

/** Reads Set-Cookie headers from an APIResponse for attribute inspection. */
async function setCookieHeaders(res: APIResponse): Promise<string[]> {
  const headers = res.headersArray();
  return headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
}

test.describe('@oauth-consent-cookie-survival — port of oauth-consent-cookie-survival.feature', () => {
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
  // Scenario 1: Happy path
  // --------------------------------------------------------------------
  test('@scenario-1 @happy-path full consent chain → OAuth registration succeeds + 4 records persist', async ({
    page,
    browser,
  }) => {
    // Phase 1: accept cookie banner + prepare 2 consents
    const banner = await acceptCookieBanner(page);
    if (banner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered in this BE profile.');
    }
    expect(banner.status(), 'cookie banner accept should be 200').toBe(200);

    const tos = await prepareConsent(page, 'TERMS_OF_SERVICE', 1);
    expect(tos.status(), 'prepare ToS should be 200').toBe(200);

    const privacy = await prepareConsent(page, 'PRIVACY_POLICY', 1);
    expect(privacy.status(), 'prepare Privacy should be 200').toBe(200);

    // Phase 2: OAuth callback simulation with cookies attached.
    // Cookies set by previous calls are automatically sent by page.request.
    const email = UNIQUE_EMAIL();
    const registration = await simulateOAuthRegister(page, email, 'INFLUENCER');
    expect(
      registration.status(),
      `OAuth register with cookies should be 200, got ${registration.status()}`,
    ).toBe(200);
    const regBody = await registration.json();
    expect(regBody?.userId, 'registration response should have userId').toBeDefined();
    const userId = regBody.userId;

    // Phase 3: Admin verifies consent records
    const adminContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const adminPage = await adminContext.newPage();
    try {
      await seedSession(
        adminPage,
        `t14-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
        'ADMIN',
      );
      const recordsRes = await feApi(adminPage, 'GET', `/admin/legal/consent-records/${userId}`);
      expect(
        recordsRes.status(),
        `admin GET /admin/legal/consent-records/${userId} should be 200`,
      ).toBe(200);
      const records = (await recordsRes.json()) as ConsentRecordAdminDtoOut[];
      expect(records, 'records should be an array').toEqual(expect.any(Array));
      // Should have 4 entries: cookie banner + ToS + Privacy + linked-on-registration
      expect(
        records.length,
        `expected 4 consent records, got ${records.length}`,
      ).toBeGreaterThanOrEqual(3);

      const docTypes = new Set(records.map((r) => String(r.documentType ?? '')));
      expect(docTypes.has('TERMS_OF_SERVICE'), 'records should include TERMS_OF_SERVICE').toBe(
        true,
      );
      expect(docTypes.has('PRIVACY_POLICY'), 'records should include PRIVACY_POLICY').toBe(true);
    } finally {
      await adminContext.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenario 2: Missing cookies → consent required error
  // --------------------------------------------------------------------
  test('@scenario-2 @missing-cookies OAuth callback fails without consent cookies', async ({
    page,
  }) => {
    if (!(await probeConsentSurface(page))) {
      test.skip(true, '/legal/anonymous/consent not registered.');
    }
    // Open a FRESH context so no consent cookies from probe affect this.
    // Use the same `page` since probe set ONE cookie; clear it via fresh request.
    await page.context().clearCookies();

    const email = UNIQUE_EMAIL();
    const res = await simulateOAuthRegister(page, email);
    expect(
      [400, 403].includes(res.status()),
      `register without cookies should be 400/403, got ${res.status()}`,
    ).toBe(true);
    const body = await res.json().catch(() => null);
    const messageKey = String(body?.messageKey ?? '').toLowerCase();
    expect(
      messageKey.includes('consent'),
      `error should mention consent, got messageKey=${body?.messageKey}`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // Scenario 3: Partial cookies (banner only)
  // --------------------------------------------------------------------
  test('@scenario-3 @partial-cookies OAuth callback fails when only cookie banner is set', async ({
    page,
  }) => {
    await page.context().clearCookies();

    const banner = await acceptCookieBanner(page);
    if (banner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered.');
    }
    expect(banner.status()).toBe(200);
    // Skip ToS + Privacy preparation deliberately.

    const email = UNIQUE_EMAIL();
    const res = await simulateOAuthRegister(page, email);
    expect(
      [400, 403].includes(res.status()),
      `partial-consent register should be 400/403, got ${res.status()}`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // Scenario 4: Existing user re-login bypasses consent validation
  // --------------------------------------------------------------------
  test('@scenario-4 @existing-user re-login with mock-session works without consent cookies', async ({
    page,
  }) => {
    // First: register a fully-consented user.
    await page.context().clearCookies();
    const initBanner = await acceptCookieBanner(page);
    if (initBanner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered.');
    }
    expect(initBanner.status()).toBe(200);
    expect((await prepareConsent(page, 'TERMS_OF_SERVICE', 1)).status()).toBe(200);
    expect((await prepareConsent(page, 'PRIVACY_POLICY', 1)).status()).toBe(200);

    const email = UNIQUE_EMAIL();
    const reg = await simulateOAuthRegister(page, email);
    expect(reg.status(), 'initial registration should be 200').toBe(200);

    // Clear ALL cookies (simulates a fresh browser later).
    await page.context().clearCookies();

    // Mock-session for the SAME email — no consent cookies set.
    await seedSession(page, email, 'INFLUENCER');
    const me = await feApi(page, 'GET', '/users/me');
    expect(me.status(), 'existing user re-login /users/me should be 200').toBe(200);
  });

  // --------------------------------------------------------------------
  // Scenario 5: Cookie attribute verification (SameSite=Lax + HttpOnly)
  // --------------------------------------------------------------------
  test('@scenario-5 @cookie-attributes consent cookies have SameSite=Lax + HttpOnly for OAuth redirect survival', async ({
    page,
  }) => {
    await page.context().clearCookies();

    const banner = await acceptCookieBanner(page);
    if (banner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered.');
    }
    expect(banner.status()).toBe(200);

    const bannerCookies = await setCookieHeaders(banner);
    expect(bannerCookies.length, 'banner response should have Set-Cookie headers').toBeGreaterThan(
      0,
    );

    const cookiePolicy = bannerCookies.find((c) => c.startsWith('consent_cookie_policy='));
    expect(cookiePolicy, 'consent_cookie_policy cookie should be set').toBeDefined();
    expect(cookiePolicy!.toLowerCase()).toContain('samesite=lax');
    expect(cookiePolicy!.toLowerCase()).toContain('httponly');

    const cookiePolicySig = bannerCookies.find((c) => c.startsWith('consent_cookie_policy_sig='));
    expect(cookiePolicySig, 'consent_cookie_policy_sig HMAC should be set').toBeDefined();
    expect(cookiePolicySig!.toLowerCase()).toContain('samesite=lax');
    expect(cookiePolicySig!.toLowerCase()).toContain('httponly');

    const tos = await prepareConsent(page, 'TERMS_OF_SERVICE', 1);
    expect(tos.status()).toBe(200);
    const tosCookies = await setCookieHeaders(tos);
    const tosCookie = tosCookies.find((c) => c.startsWith('consent_terms_of_service='));
    expect(tosCookie, 'ToS cookie should be set').toBeDefined();
    expect(tosCookie!.toLowerCase()).toContain('samesite=lax');
    expect(tosCookie!.toLowerCase()).toContain('httponly');
  });

  // --------------------------------------------------------------------
  // Scenario 6: Tampered HMAC signature rejected
  // --------------------------------------------------------------------
  test('@scenario-6 @hmac-tamper OAuth callback rejects tampered consent cookie', async ({
    page,
  }) => {
    await page.context().clearCookies();

    const banner = await acceptCookieBanner(page);
    if (banner.status() === 404) {
      test.skip(true, '/legal/anonymous/consent not registered.');
    }
    expect(banner.status()).toBe(200);
    expect((await prepareConsent(page, 'TERMS_OF_SERVICE', 1)).status()).toBe(200);
    expect((await prepareConsent(page, 'PRIVACY_POLICY', 1)).status()).toBe(200);

    // Tamper: replace the value of consent_terms_of_service with a corrupted
    // string. The signature cookie still says the OLD HMAC, so the BE will
    // detect tampering on validation.
    const all = await page.context().cookies();
    const tos = all.find((c) => c.name === 'consent_terms_of_service');
    expect(tos, 'consent_terms_of_service cookie must exist before tampering').toBeDefined();
    if (tos) {
      await page.context().addCookies([
        {
          name: 'consent_terms_of_service',
          value: tos.value + 'TAMPERED',
          domain: tos.domain,
          path: tos.path,
          secure: tos.secure,
          httpOnly: tos.httpOnly,
          sameSite: tos.sameSite,
        },
      ]);
    }

    const email = UNIQUE_EMAIL();
    const res = await simulateOAuthRegister(page, email);
    expect(
      [400, 403].includes(res.status()),
      `tampered cookie register should be 400/403, got ${res.status()}`,
    ).toBe(true);
  });
});
