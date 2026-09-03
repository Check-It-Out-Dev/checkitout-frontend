import { expect, test, type APIRequestContext } from '@playwright/test';
import { BE_URL } from '../_actor';

/**
 * T8 — Port of `src/test/resources/features/security-unauthenticated-
 * access.feature`. The BE feature has 14 Scenario Outline blocks, each
 * with an Examples table. Total: ~102 endpoint × method combinations.
 *
 * Single data-driven spec: each (method, path) tuple gets one Playwright
 * test that asserts an unauthenticated request returns 401 (or 451 for
 * consent-cookie-gated endpoints when the BE enforces consent first).
 *
 * Why port BE security tests at FE level: catches BE filter-chain
 * regressions where the FE's contract expectations don't match BE's
 * actual enforcement. If a previously-protected endpoint silently
 * becomes public, this spec flags it on the next CI run.
 *
 * Run: `npm run test:integration -- --grep security-unauth`
 */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type EndpointCheck = readonly [Method, string];

// ----- User management (17) -----
const USER: ReadonlyArray<EndpointCheck> = [
  ['GET', '/users/me'],
  ['GET', '/users/1'],
  ['GET', '/users/paged'],
  ['GET', '/users/user/test-firebase-uid'],
  ['GET', '/users/accounts/status'],
  ['GET', '/users/type'],
  ['GET', '/users/me/deletion-eligibility'],
  ['GET', '/users/1/deletion-eligibility'],
  ['GET', '/users/influencers/1/public-profile'],
  ['GET', '/users/companies/1/public-profile'],
  ['GET', '/users/paged/public-profile'],
  ['POST', '/users'],
  ['PUT', '/users/1'],
  ['PATCH', '/users/1'],
  ['PATCH', '/users/1/premium'],
  ['DELETE', '/users/1'],
  ['DELETE', '/users/delete-permanently/1'],
];

// ----- User preferences (5) -----
const USER_PREFS: ReadonlyArray<EndpointCheck> = [
  ['GET', '/user-preferences/me'],
  ['PUT', '/user-preferences/me'],
  ['PATCH', '/user-preferences/me'],
  ['GET', '/user-preferences/user/1'],
  ['PATCH', '/user-preferences/user/1'],
];

// ----- Partnership opportunity (6) -----
const PARTNERSHIP: ReadonlyArray<EndpointCheck> = [
  ['GET', '/partnership-opportunity/1'],
  ['GET', '/partnership-opportunity/paged'],
  ['GET', '/partnership-opportunity/compensation/type'],
  ['POST', '/partnership-opportunity'],
  ['PUT', '/partnership-opportunity/1'],
  ['PATCH', '/partnership-opportunity/1'],
];

// ----- Applied opportunity (11) -----
const APPLIED_OPP: ReadonlyArray<EndpointCheck> = [
  ['GET', '/applied-opportunity/1'],
  ['GET', '/applied-opportunity/paged'],
  ['GET', '/applied-opportunity/statistics'],
  ['GET', '/applied-opportunity/1/payment-contact'],
  ['GET', '/applied-opportunity/1/status-history'],
  ['GET', '/applied-opportunity/1/status-history/paged'],
  ['POST', '/applied-opportunity'],
  ['PUT', '/applied-opportunity/1/company-rating'],
  ['PUT', '/applied-opportunity/1/influencer-rating'],
  ['PATCH', '/applied-opportunity/rate/update/1'],
  ['PATCH', '/applied-opportunity/status/update/1'],
];

// ----- Applied opportunity content (8) -----
const CONTENT: ReadonlyArray<EndpointCheck> = [
  ['GET', '/applied-opportunity/content/1'],
  ['GET', '/applied-opportunity/content/applied-opportunity/1'],
  ['GET', '/applied-opportunity/content/pending-approval'],
  ['POST', '/applied-opportunity/content'],
  ['PUT', '/applied-opportunity/content/1'],
  ['PATCH', '/applied-opportunity/content/1/approve'],
  ['PATCH', '/applied-opportunity/content/1/reject'],
  ['DELETE', '/applied-opportunity/content/1'],
];

// ----- Upload (8) -----
const UPLOAD: ReadonlyArray<EndpointCheck> = [
  ['POST', '/upload/signed-url'],
  ['POST', '/upload/confirm/test-upload-id'],
  ['GET', '/upload/limits'],
  ['GET', '/upload/health'],
  ['GET', '/upload/stats'],
  ['DELETE', '/files/delete'],
  ['DELETE', '/files/batch-delete'],
  ['DELETE', '/files/folder'],
];

// ----- Admin (12) -----
const ADMIN: ReadonlyArray<EndpointCheck> = [
  ['POST', '/admin/user-claims/test-uid'],
  ['GET', '/admin/geoip/metrics'],
  ['GET', '/admin/geoip/lookup/8.8.8.8'],
  ['GET', '/admin/geoip/my-location'],
  ['POST', '/admin/geoip/update-database'],
  ['POST', '/admin/geoip/clean-cache'],
  ['GET', '/admin/uploads/stats/system'],
  ['GET', '/admin/uploads/user/1'],
  ['POST', '/admin/uploads/cleanup/orphaned'],
  ['GET', '/admin/consent/definitions'],
  ['POST', '/admin/consent/definitions'],
  ['GET', '/admin/consent/users/1'],
];

// ----- Consent (3) -----
const CONSENT: ReadonlyArray<EndpointCheck> = [
  ['GET', '/consent/my'],
  ['POST', '/consent/my'],
  ['GET', '/consent/my/history/TERMS_OF_SERVICE'],
];

// ----- Address (10) -----
const ADDRESS: ReadonlyArray<EndpointCheck> = [
  ['GET', '/address/1'],
  ['GET', '/address/types'],
  ['GET', '/address/user/1'],
  ['GET', '/address/user/1/primary'],
  ['GET', '/address/search'],
  ['POST', '/address'],
  ['POST', '/address/user/1'],
  ['POST', '/address/1/primary'],
  ['PUT', '/address/1'],
  ['DELETE', '/address/1'],
];

// ----- 2FA (6) -----
const TWO_FACTOR: ReadonlyArray<EndpointCheck> = [
  ['GET', '/twofactor/status'],
  ['POST', '/twofactor/setup'],
  ['POST', '/twofactor/verify-setup'],
  ['POST', '/twofactor/verify'],
  ['POST', '/twofactor/disable'],
  ['POST', '/twofactor/backup-codes'],
];

// ----- Auth refresh (1) -----
const AUTH_REFRESH: ReadonlyArray<EndpointCheck> = [['POST', '/auth/refresh-session']];

// ----- Social connection (6) -----
const SOCIAL: ReadonlyArray<EndpointCheck> = [
  ['POST', '/user-social-connection'],
  ['GET', '/user-social-connection/1'],
  ['GET', '/user-social-connection/paged'],
  ['PUT', '/user-social-connection/1'],
  ['PATCH', '/user-social-connection/1'],
  ['DELETE', '/user-social-connection/1'],
];

// ----- Reference data (4) -----
const REFERENCE: ReadonlyArray<EndpointCheck> = [
  ['POST', '/city'],
  ['PUT', '/city/1'],
  ['PATCH', '/city/1'],
  ['DELETE', '/city/1'],
];

// ----- Active cooperation (5) -----
const ACTIVE_COOP: ReadonlyArray<EndpointCheck> = [
  ['GET', '/activecoop/rate'],
  ['GET', '/activecoop/accept'],
  ['GET', '/activecoop/inprogress'],
  ['PUT', '/activecoop/1/company-rating'],
  ['PUT', '/activecoop/1/influencer-rating'],
];

interface Group {
  readonly name: string;
  readonly endpoints: ReadonlyArray<EndpointCheck>;
}

const GROUPS: ReadonlyArray<Group> = [
  { name: 'user', endpoints: USER },
  { name: 'user-preferences', endpoints: USER_PREFS },
  { name: 'partnership', endpoints: PARTNERSHIP },
  { name: 'applied-opportunity', endpoints: APPLIED_OPP },
  { name: 'applied-opportunity-content', endpoints: CONTENT },
  { name: 'upload', endpoints: UPLOAD },
  { name: 'admin', endpoints: ADMIN },
  { name: 'consent', endpoints: CONSENT },
  { name: 'address', endpoints: ADDRESS },
  { name: '2fa', endpoints: TWO_FACTOR },
  { name: 'auth-refresh', endpoints: AUTH_REFRESH },
  { name: 'social-connection', endpoints: SOCIAL },
  { name: 'reference-data', endpoints: REFERENCE },
  { name: 'active-cooperation', endpoints: ACTIVE_COOP },
];

/**
 * Build a body for write methods so the BE actually exercises auth
 * before content validation. POST/PUT/PATCH with empty body might
 * 400 on validation before hitting the auth filter — we want 401.
 *
 * Note: the BE's filter chain runs auth FIRST in all observed
 * endpoints (the @WebMvcTest setups show this ordering), so an empty
 * `{}` body is fine. Including it for explicitness.
 */
function buildOptions(): { data?: unknown; ignoreHTTPSErrors: boolean; failOnStatusCode: boolean } {
  return {
    data: {},
    ignoreHTTPSErrors: true,
    // Don't throw on non-2xx — we WANT to assert the status code.
    failOnStatusCode: false,
  };
}

async function assertUnauthed(
  request: APIRequestContext,
  method: Method,
  path: string,
): Promise<void> {
  const url = `${BE_URL}/api${path}`;
  const opts = buildOptions();
  let status: number;
  switch (method) {
    case 'GET':
      status = (await request.get(url, opts)).status();
      break;
    case 'POST':
      status = (await request.post(url, opts)).status();
      break;
    case 'PUT':
      status = (await request.put(url, opts)).status();
      break;
    case 'PATCH':
      status = (await request.patch(url, opts)).status();
      break;
    case 'DELETE':
      status = (await request.delete(url, opts)).status();
      break;
  }
  // Accept 401 (canonical) or 403 (some filter configurations return
  // forbidden for missing-credentials rather than unauthorized). Either
  // is "guard works"; what we're catching is a leak that returns 2xx
  // or 404 (which would mean the endpoint doesn't exist or isn't
  // protected at all).
  expect(
    [401, 403],
    `${method} ${path} unauthed should be 401/403 — got ${status} (potential auth bypass)`,
  ).toContain(status);
}

test.describe('@security-suite @401-unauthenticated — port of security-unauthenticated-access.feature', () => {
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

  for (const group of GROUPS) {
    test(`${group.name} endpoints reject unauthenticated requests`, async ({ request }) => {
      const failures: Array<{ path: string; method: Method; got: number }> = [];
      for (const [method, path] of group.endpoints) {
        const url = `${BE_URL}/api${path}`;
        const opts = buildOptions();
        let resp: import('@playwright/test').APIResponse;
        switch (method) {
          case 'GET':
            resp = await request.get(url, opts);
            break;
          case 'POST':
            resp = await request.post(url, opts);
            break;
          case 'PUT':
            resp = await request.put(url, opts);
            break;
          case 'PATCH':
            resp = await request.patch(url, opts);
            break;
          case 'DELETE':
            resp = await request.delete(url, opts);
            break;
        }
        const status = resp.status();
        if (status !== 401 && status !== 403) {
          failures.push({ path, method, got: status });
        }
      }
      expect(
        failures,
        `${group.name}: endpoints that didn't reject unauth (potential leak): ${JSON.stringify(failures, null, 2)}`,
      ).toHaveLength(0);
    });
  }

  // Sanity test — assertUnauthed helper used by one canonical endpoint
  // so the helper itself doesn't bitrot. Catch logic regressions early.
  test('helper sanity: /users/me unauthed is rejected', async ({ request }) => {
    await assertUnauthed(request, 'GET', '/users/me');
  });
});
