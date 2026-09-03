import { expect, test } from '@playwright/test';

test.describe('Sandbox · BusinessSignUpComponent', () => {
  test('empty fixture renders NIP + verify + form fields + clickwrap', async ({ page }) => {
    await page.goto('/__sandbox/sign-up-business-empty');
    await expect(page.getByTestId('business-sign-up-nip')).toBeVisible();
    await expect(page.getByTestId('business-sign-up-verify')).toBeVisible();
    await expect(page.getByTestId('business-sign-up-email')).toBeVisible();
    await expect(page.getByTestId('business-sign-up-password')).toBeVisible();
    // Stage 6e/3 replaced the single ToS checkbox with the
    // LegalClickwrapComponent. Test against the clickwrap host testid.
    await expect(page.getByTestId('business-sign-up-clickwrap')).toBeVisible();
    await expect(page.getByTestId('business-sign-up-submit')).toBeVisible();
  });

  test('successful NIP verification reveals company card', async ({ page }) => {
    await page.goto('/__sandbox/sign-up-business-empty');
    await page.getByTestId('business-sign-up-nip').fill('5252447777');
    await page.getByTestId('business-sign-up-verify').click();
    await expect(page.getByTestId('business-sign-up-company')).toBeVisible();
    await expect(page.getByTestId('business-sign-up-company')).toContainText(/Acme Studios/);
  });

  test('NIP not found surfaces error', async ({ page }) => {
    await page.goto('/__sandbox/sign-up-business-nip-not-found');
    await page.getByTestId('business-sign-up-nip').fill('5252447777');
    await page.getByTestId('business-sign-up-verify').click();
    await expect(page.getByTestId('business-sign-up-error')).toBeVisible();
  });
});
