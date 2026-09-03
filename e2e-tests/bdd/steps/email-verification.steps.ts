import { GREENFIELD_URL } from '../../_framework/auth';
import { Given, When, Then, expect } from './fixtures';

/**
 * Steps for the EmailVerificationEnforcementFilter oracle
 * (email-verification-enforcement.feature). The BE Cucumber source drives a
 * real Firebase OAuth influencer; this port seeds via mock-session then
 * flips the same unverified state through /test/auth/reset-influencer-for-
 * verification (emailVerified=false + cache evict + IN_VALIDATION) that the
 * BE scenario's "is reset for verification" step uses.
 */

Given('the influencer is reset to unverified email state', async ({ page, world }) => {
  const email = world.current?.email;
  expect(email, 'a signed-in influencer must exist first').toBeTruthy();
  const res = await page.request.post(
    `${GREENFIELD_URL}/api/test/auth/reset-influencer-for-verification`,
    {
      data: { email },
      ignoreHTTPSErrors: true,
    },
  );
  expect(res.status(), 'reset-influencer-for-verification should succeed').toBeLessThan(300);
});

When('the influencer attempts to create an application', async ({ page, world }) => {
  // The enforcement filter runs BEFORE the controller, so a minimal body is
  // enough to trip it — the block is about verification state, not payload.
  const res = await page.request.post(`${GREENFIELD_URL}/api/applied-opportunity`, {
    data: { partnershipOpportunity: 1, note: 'oracle probe' },
    ignoreHTTPSErrors: true,
  });
  const headers = res.headers();
  world.lastResponse = { status: res.status(), headers };
});

Then('the application request is rejected with status {int}', async ({ world }, status: number) => {
  expect(world.lastResponse?.status, 'unverified application POST status').toBe(status);
});

Then('the response carries the X-Email-Verification-Required marker', async ({ world }) => {
  // Playwright lowercases header names.
  expect(world.lastResponse?.headers['x-email-verification-required']).toBe('true');
});
