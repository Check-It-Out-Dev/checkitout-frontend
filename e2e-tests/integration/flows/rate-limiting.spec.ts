import { expect, test } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/**
 * T20 — Port of `rate-limiting.feature` headers + buckets subset.
 *
 * Source of truth: `checkitout-backend/.../features/rate-limiting.feature`
 * (4 scenarios). The BE Cucumber runs in an isolated `RunRateLimitingIT`
 * JVM with strict 5/60s STANDARD limits. Our greenfield integration
 * runs against the dev profile which has rate-limit relaxed (50k/60s)
 * to keep parallel tests healthy.
 *
 * Coverage map (BE scenario → FE test):
 *
 *   ⏭️  Scenario 1 "COMPANY receives 429 when exceeding STANDARD limit"
 *      Needs strict 5/60s config. Dev profile = 50k/60s → 6th request
 *      won't be 429. Fixme.
 *   ✅ Scenario 2 "Rate limit headers show correct STANDARD limits"
 *      Asserts X-RateLimit-Limit=5 specifically. Adapted to assert
 *      well-formed numeric headers (any positive limit) since the value
 *      varies by profile — the *contract* (headers present + numeric)
 *      is what matters for the FE banner UX.
 *   ⏭️  Scenario 3 "Different users have independent rate limit buckets"
 *      Same strict-config dependency. Fixme.
 *   ✅ Scenario 4 "Rate limit headers include reset timestamp"
 *      Just checks X-RateLimit-Reset is present + a valid epoch. Portable.
 *
 * Bug class caught (subset): X-RateLimit-* header drift on the BE side
 * (filter ordering, header rename, missing-on-200 regression). The FE
 * banner that warns users they're hitting rate limits depends on these
 * exact header names + numeric format.
 *
 * Run: `npm run test:integration -- --grep rate-limiting`
 */

const UNIQUE_COMPANY = () =>
  `t20-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

test.describe('@rate-limiting — port of rate-limiting.feature', () => {
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

  // Strict 5/60s config — needs RunRateLimitingIT profile.
  test.fixme('@company @429-response @standard-profile COMPANY receives 429 when exceeding STANDARD limit (5 req/60s)', async () => {
    /* Blocked on rate-limit-strict BE profile. Dev profile = 50k/60s. */
  });

  test.fixme('@company @influencer @isolation Different users have independent rate limit buckets', async () => {
    /* Same blocker — needs strict 5-req/60s config to trigger 429 on 6th. */
  });

  // --------------------------------------------------------------------
  // BE Scenario 2: "Rate limit headers show correct STANDARD limits"
  //
  // Adapted: assert headers are present + well-formed numeric. The exact
  // value (BE Cucumber asserts "5") varies between dev (relaxed) and
  // RunRateLimitingIT (strict). The contract being tested is "headers
  // are emitted + numeric" — that's what the FE banner depends on.
  // --------------------------------------------------------------------
  test('@company @headers @standard-profile rate limit headers are present and well-formed', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    const res = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
      ignoreHTTPSErrors: true,
    });
    expect(res.status(), '/users/me should return 200').toBe(200);

    const headers = res.headers();
    expect(headers['x-ratelimit-limit'], 'X-RateLimit-Limit header should be present').toBeTruthy();
    expect(
      headers['x-ratelimit-remaining'],
      'X-RateLimit-Remaining header should be present',
    ).toBeTruthy();

    const limit = Number(headers['x-ratelimit-limit']);
    const remaining = Number(headers['x-ratelimit-remaining']);
    expect(Number.isFinite(limit) && limit > 0, 'X-RateLimit-Limit is a positive integer').toBe(
      true,
    );
    expect(
      Number.isFinite(remaining) && remaining >= 0,
      'X-RateLimit-Remaining is a non-negative integer',
    ).toBe(true);
    expect(remaining, 'remaining should be <= limit').toBeLessThanOrEqual(limit);
  });

  // --------------------------------------------------------------------
  // BE Scenario 4: "Rate limit headers include reset timestamp"
  //
  //   When I make a GET request to "/test/health"
  //   Then the response status should be 200
  //   And the response should contain header "X-RateLimit-Reset"
  // --------------------------------------------------------------------
  test('@company @headers rate limit headers include reset timestamp', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    const res = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
      ignoreHTTPSErrors: true,
    });
    expect(res.status(), '/users/me should return 200').toBe(200);

    const headers = res.headers();
    const reset = headers['x-ratelimit-reset'];
    expect(reset, 'X-RateLimit-Reset header should be present').toBeTruthy();

    // Reset is either an epoch-seconds timestamp or seconds-until-reset.
    // Either way, must parse as a positive number.
    const resetNum = Number(reset);
    expect(
      Number.isFinite(resetNum) && resetNum > 0,
      `X-RateLimit-Reset should be a positive numeric — got "${reset}"`,
    ).toBe(true);
  });
});
