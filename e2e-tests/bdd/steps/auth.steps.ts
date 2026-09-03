import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import { authenticate, GREENFIELD_URL } from '../../_framework/auth';
import { ACTORS, type ActorProfile } from '../../_framework/actor';
import { Given, When, Then, expect } from './fixtures';

/** Map a Gherkin role word ("company"/"influencer"/"admin") to a seeded actor. */
function actorFor(role: string): ActorProfile {
  const key = { company: 'company1', influencer: 'influencer1', admin: 'admin1' }[
    role.toLowerCase()
  ];
  const profile = key ? ACTORS[key] : undefined;
  if (!profile) throw new Error(`Unknown actor role in feature: "${role}"`);
  return profile;
}

Given('a {word} user is signed in', async ({ context, page, world }, role: string) => {
  const profile = actorFor(role);
  // Mock-session seeds the same HttpOnly session cookie the real Firebase
  // exchange issues, so the logout post-condition is identical — the
  // documented shortcut the BE full-auth scenarios collapse to here.
  await authenticate(context, page, profile);
  world.current = profile;
});

Given('the user can access {string}', async ({ page }, apiPath: string) => {
  const res = await page.request.get(`${GREENFIELD_URL}/api${apiPath}`, {
    ignoreHTTPSErrors: true,
  });
  expect(res.status(), `${apiPath} should be reachable while signed in`).toBe(200);
  const me = (await res.json()) as UserDtoOut;
  expect(me.id, 'authenticated /users/me returns the user id').toBeTruthy();
});

When('I sign out from the application', async ({ page }) => {
  // Drive the real UI path. '/' is the PUBLIC landing page (no user menu);
  // the authed shell with the user menu lives under the app layout, so go
  // straight to a protected route. Use the testid (not the aria-label — the
  // app defaults to Polish, so the label text varies by locale).
  await page.goto('/collaborations/list');
  await page.getByTestId('user-menu-trigger').click();
  const signOutResponse = page.waitForResponse(
    (resp) => /\/api\/auth\/sign-out\b/.test(resp.url()) && resp.request().method() === 'POST',
    { timeout: 10_000 },
  );
  await page.getByTestId('user-menu-sign-out').click();
  const resp = await signOutResponse;
  expect(resp.status(), 'sign-out POST should not be a client/server error').toBeLessThan(400);
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
});

Then('the user cannot access {string}', async ({ page }, apiPath: string) => {
  const res = await page.request.get(`${GREENFIELD_URL}/api${apiPath}`, {
    ignoreHTTPSErrors: true,
  });
  expect(res.status(), `${apiPath} should be 401 after sign-out`).toBe(401);
});
