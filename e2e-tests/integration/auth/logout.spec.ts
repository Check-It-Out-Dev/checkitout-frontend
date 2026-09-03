import { expect, test, type Page } from '@playwright/test';
import { ACTORS, BE_URL, GREENFIELD_URL, login, type ActorProfile } from '../_actor';

/**
 * T6 — Port of `src/test/resources/features/logout.feature` (3 scenarios:
 * @company @admin @influencer). Each scenario follows the same shape:
 *
 *   1. Authenticate the actor.
 *   2. Verify the session is live (GET /users/me returns 200).
 *   3. Drive /auth/sign-out → component calls POST /api/auth/sign-out.
 *   4. Verify cookies are cleared (GET /users/me returns 401).
 *   5. Verify the user lands on /auth/sign-in.
 *
 * The BE Cucumber tests authenticate via real Firebase + KMS. At FE level
 * we use the mock-session shortcut (T2 will add real-UI login parity) —
 * the BE issues the same HttpOnly session cookie either way, so the
 * logout-side behavior is identical.
 *
 * Run: `npm run test:integration -- --grep logout`
 */

async function probeUsersMe(page: Page): Promise<number> {
  // Hit /users/me via the FE-origin proxy so the cookie jar matches the
  // one the BE updated on logout. (Going direct to BE_URL works for
  // pre-logout but the post-logout Set-Cookie clearing flows through the
  // FE proxy — so we want the page's notion of "what cookies are valid".)
  const res = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
    ignoreHTTPSErrors: true,
  });
  return res.status();
}

async function runLogoutScenario(page: Page, actor: ActorProfile): Promise<void> {
  await login(page, actor);

  const meBefore = await probeUsersMe(page);
  expect(meBefore, `pre-logout /users/me should be 200 for ${actor.id}`).toBe(200);

  // Capture the sign-out network call so we know it actually fired.
  const signOutResponse = page.waitForResponse(
    (resp) => /\/api\/auth\/sign-out\b/.test(resp.url()) && resp.request().method() === 'POST',
    { timeout: 5000 },
  );

  await page.goto(`${GREENFIELD_URL}/auth/sign-out`, { waitUntil: 'networkidle' });
  const signOutResult = await signOutResponse;
  expect(
    signOutResult.status(),
    `POST /api/auth/sign-out should succeed for ${actor.id}`,
  ).toBeLessThan(400);

  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  const meAfter = await probeUsersMe(page);
  expect(meAfter, `post-logout /users/me should be 401 for ${actor.id}`).toBe(401);
}

test.describe('@authentication @logout — port of logout.feature', () => {
  test.beforeAll(async ({ request }) => {
    // Skip silently if BE isn't reachable (matches the existing
    // integration suite pattern in profile-load + plan-billing-load).
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

  test('@company company1 logs out and session is cleared', async ({ page }) => {
    await runLogoutScenario(page, ACTORS['company1']!);
  });

  test('@influencer influencer1 logs out and session is cleared', async ({ page }) => {
    await runLogoutScenario(page, ACTORS['influencer1']!);
  });

  test('@admin admin1 logs out and session is cleared', async ({ page }) => {
    await runLogoutScenario(page, ACTORS['admin1']!);
  });
});
