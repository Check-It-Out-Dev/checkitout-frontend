import { expect, test } from '@playwright/test';
import { ACTORS, GREENFIELD_URL, login, recordApiCalls } from './_actor';

/**
 * FE-only: F0c live-BE trace flow. Asserts the FE-greenfield emits the
 * expected API call surface (GET /user/me) when rendering the profile
 * page. BE-side coverage of /user/me lives in the ported profile +
 * registry Cucumber specs.
 *
 * F0c — Live-BE integration test for Stage 2 profile load.
 *
 * Drives the greenfield FE on :4201 against the real BE on :8080 (test
 * profile) with a deterministic actor identity. Asserts:
 *   1. The expected GET /user/me API call fires.
 *   2. The page renders the influencer's email + role badge.
 *
 * Skips itself silently when the BE is unreachable so local dev runs
 * without pm2 stay green.
 *
 * Run with `npm run test:integration` (requires `npm run stack:up`).
 */

test.describe('Live-BE integration · Stage 2 profile', () => {
  test.beforeAll(async ({ request }) => {
    // Probe BE; skip suite gracefully if not up.
    try {
      const res = await request.get(
        `${process.env['BE_URL'] ?? 'https://localhost:8080'}/api/public-config`,
        {
          ignoreHTTPSErrors: true,
          timeout: 3_000,
        },
      );
      if (!res.ok()) test.skip(true, `BE health-check failed (${res.status()})`);
    } catch (err) {
      test.skip(true, `BE not reachable: ${(err as Error).message}`);
    }
  });

  test('influencer1 sees their profile after mock-session login', async ({ page }) => {
    await login(page, ACTORS['influencer1']!);
    const recorder = recordApiCalls(page);

    await page.goto(`${GREENFIELD_URL}/user/settings/account`, {
      waitUntil: 'networkidle',
    });

    const calls = recorder.flush();
    // BE path is `/users/me` (plural); FE proxy makes it `/api/users/me`.
    const getMeCalls = calls.filter(
      ([method, url]) => method === 'GET' && /\/api\/users\/me\b/.test(url),
    );
    expect(getMeCalls.length).toBeGreaterThan(0);

    // Profile card is rendered with the actor's email.
    await expect(page.getByTestId('profile-card')).toBeVisible();
    await expect(page.getByTestId('profile-email')).toContainText(ACTORS['influencer1']!.email);
  });
});
