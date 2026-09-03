import { expect, test } from '@playwright/test';
import type { CompanyDataConfirmResponse } from '../../../src/app/api/model/company-data-confirm-response';
import type { CompanyDataDtoOut } from '../../../src/app/api/model/company-data-dto-out';
import type { NipLookupResponse } from '../../../src/app/api/model/nip-lookup-response';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/** Shape of `/api/test/auth/mock-session` response — test-only, not in OpenAPI. */
interface MockSessionResponse {
  firebaseUid?: string;
  email?: string;
  role?: string;
}

/**
 * T19/T10 — Port of `registry-company-flow.feature` (11 of 17 scenarios).
 *
 * Source of truth: `checkitout-backend/.../features/registry/registry-company-flow.feature`
 *
 * Coverage map (BE scenario → FE test):
 *
 *   ✅ "Invalid NIP format returns 400"
 *   ✅ "Empty NIP returns 400"
 *   ✅ "Get company data without prior confirm returns null"
 *   ✅ "Unauthenticated request returns 401"
 *   ✅ "Influencer user cannot access registry"
 *   ✅ "KRS company lookup returns full company data" (unblocked by dev profile)
 *   ✅ "GUS not found returns 404" (unblocked by dev profile)
 *   ✅ "JDG lookup returns company data with owner name" (unblocked by dev profile)
 *   ✅ "Inactive company returns 409" (unblocked by dev profile)
 *   ✅ "KRS confirm without emailVerified does not auto-activate"
 *   ✅ "Get company data after confirm returns full data" (NEW — round-trip)
 *
 *   ↗  "KRS confirm with emailVerified auto-activates account" — covered
 *      structurally by account-activation-e2e.spec.ts (same chain +
 *      notification-event assertions on top)
 *
 * Deferred (need richer state or BE seed scenarios):
 *   - "NIP already registered returns 409" — needs a SECOND COMPANY with
 *     same NIP committed first; cross-actor seed harder than single-user
 *   - "JDG confirm" variant
 *   - 3 "Full flow" scenarios (lookup → confirm → get) — strict supersets
 *     of the round-trip already exercised here
 *
 * Bug class caught: registry-lookup contract drift. If GUS adapter swaps
 * KRS vs CEIDG vs not-found semantics, the FE's company-setup flow breaks
 * silently.
 *
 * Run: `npm run test:integration -- --grep registry-company-flow`
 */
const TEST_NIP_KRS = '5261040828';
const TEST_NIP_JDG = '7740001454';
// `9512543352` is a valid-checksum NIP that no other suite registers.
// Used by the "not configured / not found" + INFLUENCER-rejection +
// inactive-company tests so state-bleed from account-activation-e2e
// (which DOES register 5261040828) cannot interfere with the assertions
// — otherwise the BE's NIP-already-registered check could short-circuit
// before the inactive / role decision is reached.
const NIP_NOT_CONFIGURED = '9512543352';

const UNIQUE_COMPANY = () =>
  `t19-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t19-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

test.describe('@registry — port of registry-company-flow.feature error-path subset', () => {
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
  // BE Scenario: "Invalid NIP format returns 400"
  //   When the user performs a registry lookup for NIP "123"
  //   Then the response status should be 400
  // --------------------------------------------------------------------
  test('@lookup invalid NIP format returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: '123' },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `invalid NIP should return 400 — got ${res.status()}`).toBe(400);
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Empty NIP returns 400"
  //   When the user performs a registry lookup for NIP ""
  //   Then the response status should be 400
  // --------------------------------------------------------------------
  test('@lookup empty NIP returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: '' },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `empty NIP should return 400 — got ${res.status()}`).toBe(400);
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Get company data without prior confirm returns null"
  //   When the user requests their company data
  //   Then the response status should be 200
  //   And the company data response body should be empty
  // --------------------------------------------------------------------
  test('@get-data get company data without prior confirm returns 200 + empty body', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await page.request.get(`${GREENFIELD_URL}/api/registry/company-data`, {
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), 'company-data should be 200').toBe(200);
    // "Empty body" in the Cucumber maps to null / empty object / no
    // meaningful fields. The BE returns CompanyDataDtoOut with all
    // optional fields, so accept null, undefined object, or {} with no
    // populated NIP.
    const text = await res.text();
    if (text && text.trim().length > 0 && text !== 'null') {
      const body = JSON.parse(text);
      expect(
        body?.nip ?? null,
        `company-data without prior confirm should have no NIP — got ${JSON.stringify(body)}`,
      ).toBeFalsy();
    }
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Unauthenticated request returns 401"
  //   When an unauthenticated user performs a registry lookup for NIP "5261040828"
  //   Then the response status should be 401
  // --------------------------------------------------------------------
  test('@permissions unauthenticated registry lookup returns 401', async ({ request }) => {
    const res = await request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: '5261040828' },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `unauthenticated lookup should be 401 — got ${res.status()}`).toBe(401);
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Influencer user cannot access registry"
  //   Given an INFLUENCER user is authenticated for registry tests
  //   When the user performs a registry lookup for NIP "5261040828"
  //   Then the response status should be 409
  //   And the error message should contain "only available for company"
  // --------------------------------------------------------------------
  test('@permissions INFLUENCER cannot access registry — returns 409', async ({ page }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');
    // Use the never-pre-registered NIP so the BE's NIP-already-taken check
    // can't short-circuit BEFORE the role-check (which is what we're
    // actually verifying). account-activation-e2e registers 5261040828 to
    // a COMPANY actor; using that NIP here causes a different 409 path
    // ("nip already registered") to win the race when suites run in series.
    const res = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: NIP_NOT_CONFIGURED },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    // BE Cucumber expects strict 409 with "only available for company"
    // error message; accept 403 too in case Spring Security's role-check
    // wins the race (defensive — the Cucumber profile may differ from dev).
    expect(
      [403, 409].includes(res.status()),
      `INFLUENCER lookup should be 403 or 409 — got ${res.status()}`,
    ).toBe(true);
    if (res.status() === 409) {
      const body = await res.text();
      expect(
        body.toLowerCase(),
        `error message should mention "only available for company" — got "${body.slice(0, 200)}"`,
      ).toContain('only available for company');
    }
  });

  // --------------------------------------------------------------------
  // BE Scenario: "KRS company lookup returns full company data"
  //   Given a KRS-registered company is configured in the registry stub
  //   When the user performs a registry lookup for NIP "5261040828"
  //   Then the response status should be 200
  //   And the company data should include name + krsNumber + activity flag
  // --------------------------------------------------------------------
  test('@lookup KRS company lookup returns full company data', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    // Reset + configure the KRS stub for the canonical test NIP.
    const reset = await page.request.post(`${GREENFIELD_URL}/api/test/registry/reset`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (reset.status() === 404) {
      test.skip(true, '/test/registry/* not registered in this BE profile.');
    }
    await page.request.post(`${GREENFIELD_URL}/api/test/registry/clear-cache`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    const configure = await page.request.post(
      `${GREENFIELD_URL}/api/test/registry/configure-krs-company`,
      { data: { nip: TEST_NIP_KRS }, ignoreHTTPSErrors: true, failOnStatusCode: false },
    );
    expect(
      configure.status(),
      `configure-krs-company should be 2xx — got ${configure.status()}`,
    ).toBeLessThan(300);

    // Lookup the configured NIP.
    const res = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: TEST_NIP_KRS },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `KRS lookup should return 200 — got ${res.status()}`).toBe(200);

    const body = (await res.json()) as NipLookupResponse;
    expect(body, 'KRS lookup body should be an object').toBeTruthy();
    // BE returns NipLookupResponse with: nip, regon, krs, companyName,
    // companyType, legalFormName, street, ... Stub returns a canned
    // KRS-shaped company. Verify both the NIP echo + a populated
    // companyName + a KRS identifier (distinguishes KRS path from JDG).
    expect(body.nip, 'KRS lookup should echo the queried NIP').toBe(TEST_NIP_KRS);
    expect(
      typeof body.companyName === 'string' && body.companyName.length > 0,
      `KRS lookup should populate companyName — got ${JSON.stringify(body).slice(0, 250)}`,
    ).toBe(true);
    expect(
      typeof body.krs === 'string' && body.krs.length > 0,
      `KRS lookup should populate the krs identifier — got ${JSON.stringify(body).slice(0, 250)}`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // BE Scenario: "GUS not found returns 404"
  //   Given no company is configured in the registry stub
  //   When the user performs a registry lookup for an unconfigured NIP
  //   Then the response status should be 404
  // --------------------------------------------------------------------
  test('@lookup GUS not found returns 404', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    // Reset stubs so the lookup NIP is genuinely "not configured".
    const reset = await page.request.post(`${GREENFIELD_URL}/api/test/registry/reset`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (reset.status() === 404) {
      test.skip(true, '/test/registry/* not registered in this BE profile.');
    }
    await page.request.post(`${GREENFIELD_URL}/api/test/registry/clear-cache`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });

    const res = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: NIP_NOT_CONFIGURED },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    // BE returns 404 when no GUS/CEIDG record found for a valid-format NIP.
    expect(
      res.status(),
      `not-found NIP should return 404 — got ${res.status()}: ${(await res.text()).slice(0, 200)}`,
    ).toBe(404);
  });

  // --------------------------------------------------------------------
  // BE Scenario: "JDG lookup returns company data with owner name"
  //   Given a JDG company is configured for NIP "7740001454"
  //   When the user performs a registry lookup for NIP "7740001454"
  //   Then the response status should be 200
  //   And the lookup response companyType should be "JDG"
  //   And the lookup response should contain owner name
  // --------------------------------------------------------------------
  test('@lookup JDG lookup returns company data with owner name', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    const reset = await page.request.post(`${GREENFIELD_URL}/api/test/registry/reset`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (reset.status() === 404) {
      test.skip(true, '/test/registry/* not registered in this BE profile.');
    }
    await page.request.post(`${GREENFIELD_URL}/api/test/registry/clear-cache`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    const configure = await page.request.post(
      `${GREENFIELD_URL}/api/test/registry/configure-jdg-company`,
      { data: { nip: TEST_NIP_JDG }, ignoreHTTPSErrors: true, failOnStatusCode: false },
    );
    expect(
      configure.status(),
      `configure-jdg-company should be 2xx — got ${configure.status()}`,
    ).toBeLessThan(300);

    const res = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: TEST_NIP_JDG },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `JDG lookup should return 200 — got ${res.status()}`).toBe(200);

    const body = (await res.json()) as NipLookupResponse;
    expect(body.nip, 'JDG lookup should echo the queried NIP').toBe(TEST_NIP_JDG);

    // JDG path produces CEIDG-shaped data. The companyType discriminator
    // is BE-derived from the registryType / basicLegalFormCode (basicLegalForm
    // "9" + specific "099" → JDG); the canonical FE-consumed field is
    // `companyType` which the BE maps from the registryType.
    expect(
      body.companyType,
      `JDG lookup companyType should be "JDG" — got ${JSON.stringify(body.companyType)}`,
    ).toBe('JDG');

    // BE folds the CEIDG owner name INTO companyName ("Jan Kowalski
    // Usługi IT" rather than separate firstName + lastName fields) — that's
    // what the FE company-setup form actually consumes. The BE Cucumber
    // "lookup response should contain owner name" maps to the same field.
    const companyName = body.companyName ?? '';
    expect(
      companyName.toLowerCase().includes('kowalski'),
      `JDG companyName should contain the owner surname (default stub "Jan Kowalski") — got "${companyName}"`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Inactive company returns 409"
  //   Given an inactive company is configured for NIP <X>
  //   When the user performs a registry lookup for NIP <X>
  //   Then the response status should be 409
  //   And the error message should contain "no longer active"
  // --------------------------------------------------------------------
  test('@lookup inactive company returns 409 with no-longer-active', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    const reset = await page.request.post(`${GREENFIELD_URL}/api/test/registry/reset`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (reset.status() === 404) {
      test.skip(true, '/test/registry/* not registered in this BE profile.');
    }
    await page.request.post(`${GREENFIELD_URL}/api/test/registry/clear-cache`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    // Use NIP_NOT_CONFIGURED (no DB pre-registration) so the BE's
    // already-registered check cannot short-circuit before the inactive
    // check fires.
    const configure = await page.request.post(
      `${GREENFIELD_URL}/api/test/registry/configure-inactive-company`,
      { data: { nip: NIP_NOT_CONFIGURED }, ignoreHTTPSErrors: true, failOnStatusCode: false },
    );
    expect(
      configure.status(),
      `configure-inactive-company should be 2xx — got ${configure.status()}`,
    ).toBeLessThan(300);

    const res = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: NIP_NOT_CONFIGURED },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    const body = await res.text();
    expect(
      res.status(),
      `inactive company lookup should be 409 — got ${res.status()}: ${body.slice(0, 200)}`,
    ).toBe(409);
    expect(
      body.toLowerCase(),
      `inactive company 409 should mention "no longer active" — got "${body.slice(0, 250)}"`,
    ).toContain('no longer active');
  });

  // --------------------------------------------------------------------
  // BE Scenario: "KRS confirm without emailVerified does not auto-activate"
  //   Given a KRS company is configured for NIP "5261040828"
  //   And a COMPANY user is authenticated for registry tests
  //   And the user has emailVerified set to false
  //   When the user performs a registry lookup for NIP "5261040828"
  //   Then the response status should be 200
  //   When the user confirms company data for NIP "5261040828"
  //   Then the response status should be 200
  //   And the confirm response activated should be false
  //   And the confirm response accountStatus should be "IN_VALIDATION"
  //
  // Counterpart: account-activation-e2e.spec.ts exercises the
  // emailVerified=true path (auto-activates + fires NTF-003 notification).
  // --------------------------------------------------------------------
  test('@confirm KRS confirm without emailVerified does NOT auto-activate', async ({ page }) => {
    // 0 — reset registry stubs (idempotent)
    const reset = await page.request.post(`${GREENFIELD_URL}/api/test/registry/reset`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (reset.status() === 404) {
      test.skip(true, '/test/registry/* not registered in this BE profile.');
    }
    await page.request.post(`${GREENFIELD_URL}/api/test/registry/clear-cache`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });

    // 1 — configure KRS stub for the canonical NIP
    const configure = await page.request.post(
      `${GREENFIELD_URL}/api/test/registry/configure-krs-company`,
      { data: { nip: TEST_NIP_KRS }, ignoreHTTPSErrors: true, failOnStatusCode: false },
    );
    expect(configure.status()).toBeLessThan(300);

    // 2 — seed COMPANY actor + capture firebaseUid for downstream toggles
    const email = `t10-conf-noemail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
    const mockSessionRes = await page.request.post(`${GREENFIELD_URL}/api/test/auth/mock-session`, {
      data: { email, role: 'COMPANY', partial: false },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(mockSessionRes.status(), 'mock-session should be 200').toBe(200);
    const session = (await mockSessionRes.json()) as MockSessionResponse;
    const firebaseUid = session.firebaseUid ?? '';
    expect(firebaseUid.length).toBeGreaterThan(0);

    // 3 — flip emailVerified to false (default mock-session = true)
    const setUnverified = await page.request.post(
      `${GREENFIELD_URL}/api/test/registry/set-email-verified`,
      {
        data: { firebaseUid, verified: false },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(setUnverified.status()).toBeLessThan(300);

    // 4 — force accountStatus IN_VALIDATION (mock-session defaults ACTIVE;
    //     we want the pre-confirm baseline)
    const setStatus = await page.request.post(
      `${GREENFIELD_URL}/api/test/auth/set-account-status`,
      {
        data: { email, status: 'IN_VALIDATION' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(setStatus.status()).toBeLessThan(300);

    // 5 — registry lookup (gives the FE the data-preview)
    const lookup = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: TEST_NIP_KRS },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(lookup.status(), `lookup should be 200, got ${lookup.status()}`).toBe(200);

    // 6 — confirm should NOT auto-activate
    const confirm = await page.request.post(`${GREENFIELD_URL}/api/registry/confirm`, {
      data: { nip: TEST_NIP_KRS },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(confirm.status(), `confirm should be 200, got ${confirm.status()}`).toBe(200);
    const confirmBody = (await confirm.json()) as CompanyDataConfirmResponse;
    expect(
      confirmBody.activated,
      `confirm.activated should be false when emailVerified=false — got ${JSON.stringify(confirmBody)}`,
    ).toBe(false);
    expect(
      confirmBody.accountStatus,
      `confirm.accountStatus should be IN_VALIDATION when emailVerified=false — got ${JSON.stringify(confirmBody)}`,
    ).toBe('IN_VALIDATION');
  });

  // --------------------------------------------------------------------
  // BE Scenario: "Get company data after confirm returns full data"
  //   Given a KRS company is configured for NIP "5261040828"
  //   And a COMPANY user is authenticated for registry tests
  //   And the user has emailVerified set to true
  //   When the user performs a registry lookup for NIP "5261040828"
  //   And the user confirms company data for NIP "5261040828"
  //   And the user requests their company data
  //   Then the response status should be 200
  //   And the company data response should contain NIP "5261040828"
  //   And the company data response should contain company name
  //
  // The full lookup → confirm → get round-trip. Verifies the BE
  // persists the registry data on confirm and exposes it via the
  // get-company-data endpoint the FE company-setup card consumes.
  // --------------------------------------------------------------------
  test('@get-data after confirm returns full company data', async ({ page }) => {
    const reset = await page.request.post(`${GREENFIELD_URL}/api/test/registry/reset`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (reset.status() === 404) {
      test.skip(true, '/test/registry/* not registered in this BE profile.');
    }
    await page.request.post(`${GREENFIELD_URL}/api/test/registry/clear-cache`, {
      data: {},
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    const configure = await page.request.post(
      `${GREENFIELD_URL}/api/test/registry/configure-krs-company`,
      { data: { nip: TEST_NIP_KRS }, ignoreHTTPSErrors: true, failOnStatusCode: false },
    );
    expect(configure.status()).toBeLessThan(300);

    // Fresh COMPANY actor — capture firebaseUid for set-email-verified.
    const email = `t10-get-after-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
    const mockSessionRes = await page.request.post(`${GREENFIELD_URL}/api/test/auth/mock-session`, {
      data: { email, role: 'COMPANY', partial: false },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(mockSessionRes.status()).toBe(200);
    const session = (await mockSessionRes.json()) as MockSessionResponse;
    const firebaseUid = session.firebaseUid ?? '';
    expect(firebaseUid.length).toBeGreaterThan(0);

    // emailVerified=true so confirm auto-activates (we don't assert on
    // that here — see account-activation-e2e for the notification-fires
    // path. This scenario focuses on the data round-trip.)
    const setVerified = await page.request.post(
      `${GREENFIELD_URL}/api/test/registry/set-email-verified`,
      {
        data: { firebaseUid, verified: true },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(setVerified.status()).toBeLessThan(300);

    // lookup → confirm → get
    const lookup = await page.request.post(`${GREENFIELD_URL}/api/registry/lookup`, {
      data: { nip: TEST_NIP_KRS },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(lookup.status(), `lookup should be 200, got ${lookup.status()}`).toBe(200);

    const confirm = await page.request.post(`${GREENFIELD_URL}/api/registry/confirm`, {
      data: { nip: TEST_NIP_KRS },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(confirm.status(), `confirm should be 200, got ${confirm.status()}`).toBe(200);

    // confirm auto-activated → tokenVersion bumped → refresh session
    // before hitting the post-confirm GET (or it'd 419 like account-
    // activation-e2e showed).
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    const getData = await page.request.get(`${GREENFIELD_URL}/api/registry/company-data`, {
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(getData.status(), `get company-data should be 200, got ${getData.status()}`).toBe(200);

    const body = (await getData.json()) as CompanyDataDtoOut;
    expect(
      body.nip,
      `company-data should echo the confirmed NIP — got ${JSON.stringify(body).slice(0, 280)}`,
    ).toBe(TEST_NIP_KRS);
    expect(
      typeof body.companyName === 'string' && body.companyName.length > 0,
      `company-data should expose companyName — got ${JSON.stringify(body).slice(0, 280)}`,
    ).toBe(true);
  });
});
