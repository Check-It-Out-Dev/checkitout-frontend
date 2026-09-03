import { expect, test } from '@playwright/test';
import { BE_URL, GREENFIELD_URL } from '../_actor';

/**
 * T9a + T18 — Port of consent-module.feature + consent-lifecycle.feature.
 *
 * Source of truth: `checkitout-backend/.../features/consent/consent-module.feature`
 * (12 scenarios) + `consent-lifecycle.feature` (deeper state-machine stuff).
 *
 * Coverage map (BE scenario → FE test):
 *
 *   ✅ Scenario "Get current legal documents" (T9a)
 *   ✅ Scenario "Record anonymous cookie banner consent" (T9a — UI cookie banner)
 *   ✅ Scenario "Prepare consent cookies for Terms of Service" (T18)
 *   ✅ Scenario "Prepare consent cookies for Privacy Policy" (T18)
 *   ✅ Scenario "Registration fails with 400 when consent cookies are missing" (T18)
 *
 * Deferred (need BE state setup / admin actor / full Firebase login):
 *   - "Missing consents error precedes email-already-used error" — needs DB seed user
 *   - "Full registration with all consent cookies succeeds" — needs admin verify step
 *   - "Anonymous cookie consent record gets linked to user after registration" — needs admin
 *   - "Blocked user gets 403 on POST" — needs BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS state
 *   - "Blocked user CAN browse" — same blocker
 *   - "Blocked user can access users me endpoint" — same
 *   - "Blocked user accepts updated terms and gets unblocked" — same
 *   - "User with all consents accepted sees accepted status" — needs registered user state
 *   - "Admin can view consent records for a user" — needs admin
 *
 * Run: `npm run test:integration -- --grep consent`
 */

test.describe('@consent — port of consent-module.feature (subset)', () => {
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

  // -------- Public endpoint: GET /api/legal/current --------
  test('@public-api current legal documents endpoint returns 3 expected types', async ({
    request,
  }) => {
    const res = await request.get(`${BE_URL}/api/legal/current`, { ignoreHTTPSErrors: true });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // The endpoint returns either an array of LegalDocumentDtoOut OR an
    // envelope { documents: [...] } — accept both shapes.
    const docs: Array<{ documentType?: string; type?: string; documentName?: string }> =
      Array.isArray(body) ? body : (body.documents ?? []);

    // Each document carries `documentType` (the canonical enum); fallback
    // to `type` if codegen used a different field name.
    const types = docs.map((d) => d.documentType ?? d.type);
    expect(
      types,
      `legal/current should expose 3 document types — got ${JSON.stringify(types)}`,
    ).toEqual(expect.arrayContaining(['COOKIE_POLICY', 'TERMS_OF_SERVICE', 'PRIVACY_POLICY']));
  });

  // -------- Cookie-banner accept flow --------
  test('@cookie-banner anon user sees banner on first visit + accepting it dismisses it', async ({
    page,
  }) => {
    // Fresh BrowserContext per test (Playwright default) — banner state
    // is empty. Visiting landing should render the banner.
    await page.goto(`${GREENFIELD_URL}/`, { waitUntil: 'networkidle' });

    // Some routes render the banner conditionally (only when consent
    // isn't recorded). The data-testid is fixed: 'cookie-banner'.
    const banner = page.getByTestId('cookie-banner');

    // Wait briefly — the banner mounts after ConsentService probes.
    await expect(banner, 'cookie banner should appear on first anon visit').toBeVisible({
      timeout: 3_000,
    });

    // Click "Accept all" — the wrapper calls ConsentService.acceptAll()
    // which POSTs to /api/legal/consent and sets the consent cookies.
    const acceptAllResponse = page.waitForResponse(
      (resp) => /\/api\/legal\/anonymous-consent\b/.test(resp.url()),
      { timeout: 5_000 },
    );

    await page.getByTestId('cookie-banner-accept-all').click();
    const accepted = await acceptAllResponse.catch(() => null);

    // BE may set cookies + return 200, OR the FE may locally cache
    // consent and skip the network call entirely. Either way: banner
    // should be dismissed within 2s.
    await expect(banner, 'banner should dismiss after accept').not.toBeVisible({ timeout: 2_000 });

    // If the network call DID fire, it must be <400.
    if (accepted) {
      expect(accepted.status(), 'anonymous-consent POST should succeed').toBeLessThan(400);
    }
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Prepare consent cookies for Terms of Service"
  //
  //   When I prepare consent for document type "TERMS_OF_SERVICE" version 1
  //   Then the response status should be 200
  //   And the response should set cookie "consent_terms_of_service"
  //   And the response should set cookie "consent_terms_of_service_sig"
  // --------------------------------------------------------------------
  test('@consent-prepare prepare consent cookies for Terms of Service', async ({ request }) => {
    const res = await request.post(`${BE_URL}/api/legal/consent/prepare`, {
      // Proof bundle is required since the consent-hardening pass —
      // LegalConsentService reads proof.timestamp unconditionally (a
      // bare {documentType, version} payload 500s with an NPE).
      data: {
        documentType: 'TERMS_OF_SERVICE',
        version: 1,
        documentHash: 'integration-tos-hash',
        proof: {
          eventTrusted: true,
          timestamp: Date.now(),
          screenX: 10,
          screenY: 20,
          checkboxId: 'integration-consent-checkbox',
          documentHash: 'integration-tos-hash',
        },
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), 'prepare ToS consent should return 200').toBe(200);

    // Inspect Set-Cookie headers — there can be many; merge them.
    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    const cookieNames = setCookie.map((h) => h.value.split('=')[0]?.trim()).filter(Boolean);
    expect(cookieNames, 'response should set consent_terms_of_service cookie').toContain(
      'consent_terms_of_service',
    );
    expect(cookieNames, 'response should set consent_terms_of_service_sig cookie').toContain(
      'consent_terms_of_service_sig',
    );
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Prepare consent cookies for Privacy Policy"
  //
  //   When I prepare consent for document type "PRIVACY_POLICY" version 1
  //   Then the response status should be 200
  //   And the response should set cookie "consent_privacy_policy"
  //   And the response should set cookie "consent_privacy_policy_sig"
  // --------------------------------------------------------------------
  test('@consent-prepare prepare consent cookies for Privacy Policy', async ({ request }) => {
    const res = await request.post(`${BE_URL}/api/legal/consent/prepare`, {
      data: {
        documentType: 'PRIVACY_POLICY',
        version: 1,
        documentHash: 'integration-pp-hash',
        proof: {
          eventTrusted: true,
          timestamp: Date.now(),
          screenX: 10,
          screenY: 20,
          checkboxId: 'integration-consent-checkbox',
          documentHash: 'integration-pp-hash',
        },
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), 'prepare Privacy consent should return 200').toBe(200);

    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    const cookieNames = setCookie.map((h) => h.value.split('=')[0]?.trim()).filter(Boolean);
    expect(cookieNames, 'response should set consent_privacy_policy cookie').toContain(
      'consent_privacy_policy',
    );
    expect(cookieNames, 'response should set consent_privacy_policy_sig cookie').toContain(
      'consent_privacy_policy_sig',
    );
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Registration fails with 400 when consent cookies are missing"
  //
  //   When I attempt to register without consent cookies
  //     | email    | consent-test-nocons@e2e.test |
  //     | password | TestPassword123!             |
  //     | userType | COMPANY                      |
  //   Then the response status should be 400
  //
  // The BE validates HMAC consent cookies BEFORE user creation (fail-fast)
  // per AuthController#registerUser docstring. No cookies → 400 with the
  // missing-consents error key.
  // --------------------------------------------------------------------
  test('@registration-validation register without consent cookies returns 400', async ({
    request,
  }) => {
    const email = `t18-noconsent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
    const res = await request.post(`${BE_URL}/api/auth/register`, {
      data: { email, password: 'TestPassword123!', userType: 'COMPANY' },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(
      res.status(),
      `register without consent cookies should return 400 — got ${res.status()}`,
    ).toBe(400);
  });
});
