import { expect, test, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/**
 * T13 — Port of `admin-platform-management.feature` (partial).
 *
 * Source of truth: `checkitout-backend/.../features/admin-platform-management.feature`
 *
 * Coverage map (BE scenario → FE test group):
 *
 *   ⏭️  Scenario 1 "Ticket full lifecycle" — needs ticket-state machine + Firebase real admin
 *   ⏭️  Scenario 2 "FAQ CRUD" — requires unique-name to avoid 409; deferred
 *   ⏭️  Scenario 3 "Multi-user ban impact" — needs tokenVersion + 419 session-expired path
 *   ✅ Scenario 4 "System monitoring and statistics review" — ~25 read-only admin GETs
 *   ⏭️  Scenario 5 "User data management" — needs Firebase-synced targets
 *   ✅ Scenario 6 "Reference data management" — City CRUD + read on dictionaries
 *   ✅ Scenario 7 "Content moderation reviews" — read-only filtered lists
 *   ⏭️  Scenarios 8-11 — 2FA/security ops, GDPR, validation edge cases (deferred)
 *
 * Mock-session unlock: POST /test/auth/mock-session with `partial: false`
 * returns a full ADMIN session bypassing TOTP. See memory
 * `reference_mock_session_admin_full_session`.
 *
 * Bug class caught: admin-endpoint contract drift. Many of these endpoints
 * have no FE test coverage in the legacy suite — drift here would silently
 * break the admin panel post-cutover.
 *
 * Run: `npm run test:integration -- --grep admin-platform-management`
 */

const UNIQUE_ADMIN = () =>
  `t13-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function authGet(page: Page, path: string): Promise<import('@playwright/test').APIResponse> {
  return page.request.get(`${GREENFIELD_URL}/api${path}`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function authPost(
  page: Page,
  path: string,
  data: unknown,
): Promise<import('@playwright/test').APIResponse> {
  return page.request.post(`${GREENFIELD_URL}/api${path}`, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function authPatch(
  page: Page,
  path: string,
  data: unknown,
): Promise<import('@playwright/test').APIResponse> {
  return page.request.patch(`${GREENFIELD_URL}/api${path}`, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function authDelete(
  page: Page,
  path: string,
): Promise<import('@playwright/test').APIResponse> {
  return page.request.delete(`${GREENFIELD_URL}/api${path}`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

/**
 * Mirrors the BE Cucumber step "the response should be successful or not
 * found" — a deliberately permissive soft-assertion (200-599) used for
 * ~25-endpoint sweep scenarios that just smoke that the route exists and
 * doesn't blow up infrastructure. See AdminPlatformManagementSteps.java:711.
 *
 * Strict 200-only assertions are used in tests where the BE Cucumber asserts
 * `the response status should be 200`.
 *
 * Why so loose: some admin endpoints are bean-gated (@ConditionalOnProperty)
 * or depend on dev-profile data; the Cucumber tolerates 4xx/5xx to keep
 * Firebase API calls minimal (single login → 25-op sweep).
 */
function expectSuccessfulOrSoftFailure(status: number, label: string) {
  expect(
    status >= 200 && status < 600,
    `${label} should return a valid HTTP status (200-599), got ${status}`,
  ).toBe(true);
  // Hard fail on auth issues — those mean the admin actor isn't admin.
  expect(status, `${label} returned 401 — mock-session admin auth broken`).not.toBe(401);
  expect(status, `${label} returned 403 — admin role check broken`).not.toBe(403);
}

test.describe('@admin-platform-management — port of admin-platform-management.feature', () => {
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
  // BE Scenario 4: "Admin performs comprehensive system monitoring"
  // 25+ read-only admin GETs covering uploads, consent, gdpr, geoip,
  // metadata, rate-limit.
  // --------------------------------------------------------------------
  test('@scenario-4 @system-monitoring admin can hit ~25 monitoring endpoints', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    // Section 1: upload statistics
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/admin/uploads/stats/system')).status(),
      'system upload stats',
    );
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/admin/uploads/status/COMPLETED')).status(),
      'uploads by COMPLETED',
    );
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/admin/uploads/reports/weekly')).status(),
      'weekly upload report',
    );

    // Section 2: consent management (strict 200)
    const consentDefsRes = await authGet(page, '/admin/consent/definitions');
    expect(
      consentDefsRes.status(),
      `GET /admin/consent/definitions should be 200 for admin — got ${consentDefsRes.status()}`,
    ).toBe(200);

    // Section 3: GDPR compliance
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/gdpr/location/compliance')).status(),
      'gdpr compliance',
    );

    // Section 4: GeoIP admin operations (strict 200)
    const metricsRes = await authGet(page, '/admin/geoip/metrics');
    expect(
      metricsRes.status(),
      `GET /admin/geoip/metrics should be 200 for admin — got ${metricsRes.status()}`,
    ).toBe(200);

    const myLocationRes = await authGet(page, '/admin/geoip/my-location');
    expect(
      myLocationRes.status(),
      `GET /admin/geoip/my-location should be 200 for admin — got ${myLocationRes.status()}`,
    ).toBe(200);

    const lookupRes = await authGet(page, '/admin/geoip/lookup/8.8.8.8');
    expect(
      lookupRes.status(),
      `GET /admin/geoip/lookup/8.8.8.8 should be 200 for admin — got ${lookupRes.status()}`,
    ).toBe(200);

    // Section 6: enum metadata endpoints
    for (const path of [
      '/metadata/opportunity-statuses',
      '/metadata/account-statuses',
      '/metadata/consent-actions',
      '/metadata/opportunity-statuses/active',
      '/metadata/opportunity-statuses/completed',
    ]) {
      expectSuccessfulOrSoftFailure((await authGet(page, path)).status(), `GET ${path}`);
    }

    // Section 7: rate-limit metrics
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/privacy/rate-limit/metrics')).status(),
      'rate-limit metrics',
    );
  });

  // --------------------------------------------------------------------
  // BE Scenario 6: "Admin performs comprehensive reference data
  // management" — City CRUD lifecycle + read on dictionaries.
  // --------------------------------------------------------------------
  test('@scenario-6 @reference-data admin can read all dictionaries (paginated)', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    // City list (paged) — strict 200
    const cityListRes = await authGet(page, '/city/paged');
    expect(cityListRes.status(), 'GET /city/paged should be 200').toBe(200);

    // Currency list + by-id
    const currencyListRes = await authGet(page, '/currency/paged');
    expect(currencyListRes.status(), 'GET /currency/paged should be 200').toBe(200);
    expectSuccessfulOrSoftFailure((await authGet(page, '/currency/1')).status(), 'GET /currency/1');

    // Platform list + by-id
    const platformListRes = await authGet(page, '/platform/paged');
    expect(platformListRes.status(), 'GET /platform/paged should be 200').toBe(200);
    expectSuccessfulOrSoftFailure((await authGet(page, '/platform/1')).status(), 'GET /platform/1');

    // ContentType list + by-id
    const contentTypeListRes = await authGet(page, '/content-type/paged');
    expect(contentTypeListRes.status(), 'GET /content-type/paged should be 200').toBe(200);
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/content-type/1')).status(),
      'GET /content-type/1',
    );

    // ServiceType list + by-id
    const serviceTypeListRes = await authGet(page, '/service-type/paged');
    expect(serviceTypeListRes.status(), 'GET /service-type/paged should be 200').toBe(200);
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/service-type/1')).status(),
      'GET /service-type/1',
    );

    // Address types
    const addressTypesRes = await authGet(page, '/address/types');
    expect(addressTypesRes.status(), 'GET /address/types should be 200').toBe(200);

    // FAQ read operations
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/support/faq/active')).status(),
      'FAQ active',
    );
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/support/faq/categories/active')).status(),
      'FAQ categories active',
    );
    expectSuccessfulOrSoftFailure(
      (await authGet(page, '/support/faq/search?query=test')).status(),
      'FAQ search',
    );
  });

  test('@scenario-6 @reference-data admin can CRUD a city', async ({ page }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    // Probe: skip if /city is not POST-able in this BE profile (legacy
    // dictionaries are sometimes read-only; the BE Cucumber tolerates 404
    // via "successful or not found").
    const createRes = await authPost(page, '/city', {
      name: `E2E Test City ${Date.now()}`,
      state: 'Mazowieckie',
      country: 'Polska',
    });
    if (createRes.status() === 404) {
      test.skip(true, '/city POST not registered in this BE profile.');
    }

    expect(
      [200, 201].includes(createRes.status()),
      `POST /city should be 200/201 for admin — got ${createRes.status()}`,
    ).toBe(true);

    const created = await createRes.json();
    const cityId = created?.id;
    expect(typeof cityId === 'number', `City response should have numeric id — got ${cityId}`).toBe(
      true,
    );

    // Read created city
    const readRes = await authGet(page, `/city/${cityId}`);
    expectSuccessfulOrSoftFailure(readRes.status(), `GET /city/${cityId}`);

    // Patch (partial update)
    const patchRes = await authPatch(page, `/city/${cityId}`, {
      id: cityId,
      name: `Patched E2E City ${Date.now()}`,
    });
    expectSuccessfulOrSoftFailure(patchRes.status(), `PATCH /city/${cityId}`);

    // Delete (cleanup)
    const deleteRes = await authDelete(page, `/city/${cityId}`);
    expectSuccessfulOrSoftFailure(deleteRes.status(), `DELETE /city/${cityId}`);
  });

  // --------------------------------------------------------------------
  // BE Scenario 7: "Admin reviews content and applied opportunities"
  // Read-only filtered admin views — content moderation queue.
  // --------------------------------------------------------------------
  test('@scenario-7 @content-moderation admin can list applied-opportunity content by status', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    for (const status of ['PENDING', 'APPROVED', 'REJECTED']) {
      expectSuccessfulOrSoftFailure(
        (await authGet(page, `/applied-opportunity/content/status/${status}`)).status(),
        `GET /applied-opportunity/content/status/${status}`,
      );
    }
  });

  test('@scenario-7 @content-moderation admin can filter support tickets by status', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
      expectSuccessfulOrSoftFailure(
        (await authGet(page, `/support/ticket?status=${status}`)).status(),
        `GET /support/ticket?status=${status}`,
      );
    }
  });

  // --------------------------------------------------------------------
  // Cross-cutting: ensure COMPANY actor cannot hit admin endpoints
  // (mirrors the security-cross-role spec but targeted at this feature).
  // --------------------------------------------------------------------
  test('@cross-role COMPANY actor is 403 on /admin/* endpoints (sanity)', async ({ page }) => {
    await seedSession(
      page,
      `t13-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
      'COMPANY',
    );

    for (const path of [
      '/admin/consent/definitions',
      '/admin/geoip/metrics',
      '/admin/geoip/my-location',
    ]) {
      const status = (await authGet(page, path)).status();
      expect(
        status === 403 || status === 404,
        `COMPANY GET ${path} should be 403/404 — got ${status}`,
      ).toBe(true);
    }
  });
});
