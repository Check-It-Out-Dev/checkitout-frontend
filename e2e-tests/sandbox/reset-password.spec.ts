import { expect, test } from '@playwright/test';

test.describe('Sandbox · ResetPasswordComponent', () => {
  test('valid-link fixture renders the new-password form', async ({ page }) => {
    await page.goto('/__sandbox/reset-password-valid-link');
    await expect(page.getByTestId('reset-password-new')).toBeVisible();
    await expect(page.getByTestId('reset-password-confirm')).toBeVisible();
    await expect(page.getByTestId('reset-password-submit')).toBeVisible();
  });

  test('invalid-link fixture shows the invalid-link state', async ({ page }) => {
    await page.goto('/__sandbox/reset-password-invalid-link');
    await expect(page.getByTestId('reset-password-invalid-link')).toBeVisible();
  });

  test('no-oob-code fixture shows the invalid-link state', async ({ page }) => {
    await page.goto('/__sandbox/reset-password-no-oob-code');
    await expect(page.getByTestId('reset-password-invalid-link')).toBeVisible();
  });
});
