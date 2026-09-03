import { expect, test } from '@playwright/test';

test.describe('Sandbox · SignUpChooserComponent', () => {
  test('renders both role cards with links', async ({ page }) => {
    await page.goto('/__sandbox/sign-up-chooser');
    await expect(page.getByTestId('sign-up-as-influencer')).toBeVisible();
    await expect(page.getByTestId('sign-up-as-business')).toBeVisible();
  });
});

test.describe('Sandbox · InfluencerSignUpComponent', () => {
  test('empty fixture renders form fields + clickwrap host', async ({ page }) => {
    await page.goto('/__sandbox/sign-up-influencer-empty');
    await expect(page.getByTestId('influencer-sign-up-email')).toBeVisible();
    await expect(page.getByTestId('influencer-sign-up-password')).toBeVisible();
    // Stage 6e/3 replaced the single ToS checkbox with the
    // LegalClickwrapComponent (3-doc consent). The component is mounted
    // at testid `influencer-sign-up-clickwrap`; the 3 inner checkboxes
    // use `legal-clickwrap-{tos,pp,cp}-checkbox` testids once the
    // /legal/current call resolves.
    await expect(page.getByTestId('influencer-sign-up-clickwrap')).toBeVisible();
    await expect(page.getByTestId('influencer-sign-up-submit')).toBeVisible();
  });

  // The email-taken-error path requires accepting the 3-doc clickwrap
  // before submit, which in turn requires the sandbox fixture to stub
  // LegalApiService.prepareConsentCookie. The current fixture only stubs
  // AuthApiService.register — so the clickwrap can't reach `accepted`
  // state and submit stays disabled. Sandbox fixture extension is
  // tracked alongside Stage 6g component-parity work.
  test.fixme('email-taken fixture surfaces error after submit', () => {
    /* Needs sandbox fixture to stub LegalApiService (getCurrentDocuments +
     * prepareConsentCookie). Today the clickwrap component blocks submit
     * because /legal/current call fails. Stage 6g unblock. */
  });
});
