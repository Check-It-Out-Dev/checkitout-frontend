import { expect, test, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/**
 * T13 — Port of `admin-geoip-analysis.feature` (4 scenarios → 4 test groups).
 *
 * Source of truth: `checkitout-backend/.../features/admin-geoip-analysis.feature`
 *
 * Coverage map (BE scenario → FE test):
 *
 *   ✅ Scenario 1: ADMIN travel analysis — all tiers + risk scoring
 *      (12 sub-tests: same-city, same-country, country-jump,
 *      intercontinental impossible, risk-level classification, travel
 *      event field shape)
 *   ✅ Scenario 2: ADMIN GeoIP admin endpoints (metrics, lookup, my-location)
 *   ✅ Scenario 3: Non-admin (COMPANY + INFLUENCER) get 403
 *   ✅ Scenario 4: Input validation (invalid IP + negative minutes → 400)
 *
 * Mock-session unlock: POST /test/auth/mock-session with `partial: false`
 * returns a full ADMIN session bypassing TOTP.
 *
 * Bug class caught: GeoIP/travel-pattern algorithm regression. The
 * travel-pattern service is security-critical (drives impossible-travel
 * detection for session-fingerprinting); silent algorithm drift here
 * would weaken anti-account-takeover defenses.
 *
 * Run: `npm run test:integration -- --grep admin-geoip-analysis`
 */

const UNIQUE_ADMIN = () =>
  `t13-geoip-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_COMPANY = () =>
  `t13-geoip-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t13-geoip-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function authGet(page: Page, path: string): Promise<import('@playwright/test').APIResponse> {
  return page.request.get(`${GREENFIELD_URL}/api${path}`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function testTravel(
  page: Page,
  fromIp: string,
  toIp: string,
  minutes: number,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const url = `${GREENFIELD_URL}/api/admin/geoip/test-travel?fromIp=${encodeURIComponent(
    fromIp,
  )}&toIp=${encodeURIComponent(toIp)}&minutes=${minutes}`;
  const res = await page.request.post(url, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
  const status = res.status();
  if (!res.ok()) return { status, body: null };
  const body = (await res.json()) as Record<string, unknown>;
  return { status, body };
}

/**
 * GeoIP DB is optional in the dev BE — MaxMind GeoLite2 isn't always
 * loaded. We probe with a known-good IP at the start of each test group
 * and skip if the BE has no GeoIP data populated.
 */
async function probeGeoIpAvailability(page: Page): Promise<boolean> {
  const lookup = await authGet(page, '/admin/geoip/lookup/8.8.8.8');
  if (lookup.status() !== 200) return false;
  const body = await lookup.json().catch(() => null);
  return body !== null && typeof body === 'object' && 'country' in body;
}

test.describe('@admin-geoip-analysis — port of admin-geoip-analysis.feature', () => {
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
  // BE Scenario 1: ADMIN travel analysis — all tiers and risk scoring
  // 12 sub-tests across 4 algorithmic tiers (same-city, same-country
  // speed, international travel, risk classification + event shape).
  // --------------------------------------------------------------------
  test('@scenario-1 @travel-analysis admin can test all travel-detection tiers', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    if (!(await probeGeoIpAvailability(page))) {
      test.skip(true, 'GeoIP DB not loaded in this BE profile — skipping travel analysis suite.');
    }

    // ----- TIER 1: SAME CITY DETECTION -----
    // Same city within 50km → false + low risk
    const t1 = await testTravel(page, '8.8.8.8', '8.8.4.4', 1);
    expect(t1.status, 'travel test 8.8.8.8→8.8.4.4 1min should be 200').toBe(200);
    expect(t1.body?.['impossibleTravel'], 'same-city same-asn should NOT be impossible').toBe(
      false,
    );
    expect(Number(t1.body?.['riskScore'] ?? 999)).toBeLessThan(30);

    // Nearby IPs within 50km treated as same city
    const t2 = await testTravel(page, '74.125.224.72', '74.125.224.73', 1);
    expect(t2.status).toBe(200);
    expect(t2.body?.['impossibleTravel']).toBe(false);

    // ----- TIER 2: SAME COUNTRY SPEED CHECK -----
    // Same country travel at possible speed → allowed
    const t3 = await testTravel(page, '8.8.8.8', '74.125.224.72', 120);
    expect(t3.status).toBe(200);
    expect(t3.body?.['sameCountry']).toBe(true);
    expect(t3.body?.['impossibleTravel']).toBe(false);

    // Same country travel at impossible speed → speed > 500 km/h
    const t4 = await testTravel(page, '8.8.8.8', '13.57.0.1', 1);
    expect(t4.status).toBe(200);
    expect(t4.body?.['sameCountry']).toBe(true);
    expect(Number(t4.body?.['speedKmh'] ?? 0)).toBeGreaterThan(500);

    // ----- TIER 3: INTERNATIONAL TRAVEL -----
    // Country jump within grace period → blocked
    const t5 = await testTravel(page, '8.8.8.8', '185.51.101.1', 5);
    expect(t5.status).toBe(200);
    expect(t5.body?.['countryJump']).toBe(true);
    expect(t5.body?.['impossibleTravel']).toBe(true);
    expect(Number(t5.body?.['riskScore'] ?? 0)).toBeGreaterThanOrEqual(50);

    // International at possible speed after grace period → allowed
    const t6 = await testTravel(page, '8.8.8.8', '212.58.244.70', 1080);
    expect(t6.status).toBe(200);
    expect(t6.body?.['countryJump']).toBe(true);
    expect(t6.body?.['impossibleTravel']).toBe(false);
    expect(Number(t6.body?.['riskScore'] ?? 0)).toBeGreaterThanOrEqual(50);

    // Intercontinental impossible travel → HIGH/CRITICAL
    const t7 = await testTravel(page, '8.8.8.8', '210.173.172.1', 30);
    expect(t7.status).toBe(200);
    expect(t7.body?.['countryJump']).toBe(true);
    expect(t7.body?.['impossibleTravel']).toBe(true);
    expect(['HIGH', 'CRITICAL']).toContain(String(t7.body?.['riskLevel']));

    // ----- RISK SCORING VALIDATION -----
    const t8 = await testTravel(page, '8.8.8.8', '8.8.4.4', 60);
    expect(t8.status).toBe(200);
    expect(['MINIMAL', 'LOW']).toContain(String(t8.body?.['riskLevel']));
    expect(Number(t8.body?.['riskScore'] ?? 999)).toBeLessThan(30);

    const t9 = await testTravel(page, '8.8.8.8', '185.51.101.1', 5);
    expect(t9.status).toBe(200);
    expect(['HIGH', 'CRITICAL']).toContain(String(t9.body?.['riskLevel']));
    expect(Number(t9.body?.['riskScore'] ?? 0)).toBeGreaterThanOrEqual(80);

    const t10 = await testTravel(page, '8.8.8.8', '185.51.101.1', 2400);
    expect(t10.status).toBe(200);
    expect(Number(t10.body?.['riskScore'] ?? 0)).toBeGreaterThanOrEqual(40);
    expect(Number(t10.body?.['riskScore'] ?? 100)).toBeLessThan(80);

    // ----- TRAVEL EVENT VALIDATION -----
    const t11 = await testTravel(page, '8.8.8.8', '185.51.101.1', 30);
    expect(t11.status).toBe(200);
    const event11 = t11.body?.['travelEvent'] as Record<string, unknown> | undefined;
    expect(event11, 'travelEvent should be present').toBeDefined();
    for (const field of [
      'fromCountry',
      'toCountry',
      'distanceKm',
      'speedKmh',
      'impossible',
      'countryJump',
    ]) {
      expect(event11, `travelEvent should contain ${field}`).toHaveProperty(field);
    }

    const t12 = await testTravel(page, '8.8.8.8', '185.51.101.1', 60);
    expect(t12.status).toBe(200);
    const event12 = t12.body?.['travelEvent'] as Record<string, unknown> | undefined;
    expect(event12, 'travelEvent should contain timestamp').toHaveProperty('timestamp');
    expect(event12, 'travelEvent should contain date').toHaveProperty('date');
  });

  // --------------------------------------------------------------------
  // BE Scenario 2: ADMIN can access all GeoIP admin endpoints
  // --------------------------------------------------------------------
  test('@scenario-2 @admin-endpoints admin can hit metrics + lookup + my-location', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    // metrics — always available
    const metrics = await authGet(page, '/admin/geoip/metrics');
    expect(metrics.status(), 'GET /admin/geoip/metrics should be 200').toBe(200);

    // lookup — should include country info when GeoIP DB is loaded
    const lookup = await authGet(page, '/admin/geoip/lookup/8.8.8.8');
    expect(lookup.status(), 'GET /admin/geoip/lookup/8.8.8.8 should be 200').toBe(200);
    const lookupBody = await lookup.json().catch(() => null);
    if (lookupBody && 'country' in lookupBody) {
      // Sanity — 8.8.8.8 is Google Public DNS, typically US
      expect(typeof lookupBody.country).toBe('string');
    }

    // my-location — should include yourIp field
    const myLoc = await authGet(page, '/admin/geoip/my-location');
    expect(myLoc.status(), 'GET /admin/geoip/my-location should be 200').toBe(200);
    const myLocBody = await myLoc.json().catch(() => null);
    expect(myLocBody, '/my-location should return JSON').not.toBeNull();
    expect(myLocBody, '/my-location should contain yourIp').toHaveProperty('yourIp');
  });

  // --------------------------------------------------------------------
  // BE Scenario 3: Non-admin (COMPANY + INFLUENCER) get 403
  // --------------------------------------------------------------------
  test('@scenario-3 @non-admin COMPANY actor is 403 on GeoIP admin endpoints', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    for (const path of [
      '/admin/geoip/metrics',
      '/admin/geoip/lookup/8.8.8.8',
      '/admin/geoip/my-location',
    ]) {
      const res = await authGet(page, path);
      expect(res.status(), `COMPANY GET ${path} should be 403, got ${res.status()}`).toBe(403);
    }
  });

  test('@scenario-3 @non-admin INFLUENCER actor is 403 on GeoIP admin endpoints', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');

    for (const path of ['/admin/geoip/lookup/8.8.8.8', '/admin/geoip/metrics']) {
      const res = await authGet(page, path);
      expect(res.status(), `INFLUENCER GET ${path} should be 403, got ${res.status()}`).toBe(403);
    }
  });

  // --------------------------------------------------------------------
  // BE Scenario 4: Input validation (invalid IP + negative minutes → 400)
  // --------------------------------------------------------------------
  test('@scenario-4 @validation invalid IP returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    const res = await testTravel(page, 'invalid.ip', '8.8.8.8', 30);
    expect(res.status, `invalid.ip should produce 400, got ${res.status}`).toBe(400);
  });

  test('@scenario-4 @validation negative minutes returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    const res = await testTravel(page, '8.8.8.8', '8.8.4.4', -5);
    expect(res.status, `-5 minutes should produce 400, got ${res.status}`).toBe(400);
  });
});
