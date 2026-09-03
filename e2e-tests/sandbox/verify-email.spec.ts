import { expect, test } from '@playwright/test';

test.describe('Sandbox · VerifyEmailComponent', () => {
  test('verifying state shows the spinner', async ({ page }) => {
    await page.goto('/__sandbox/verify-email-verifying');
    await expect(page.getByTestId('verify-email-verifying')).toBeVisible();
  });

  test('success state shows the success heading + sign-in CTA', async ({ page }) => {
    await page.goto('/__sandbox/verify-email-success');
    await expect(page.getByTestId('verify-email-success')).toBeVisible();
  });

  test('invalid state shows the invalid heading', async ({ page }) => {
    await page.goto('/__sandbox/verify-email-invalid');
    await expect(page.getByTestId('verify-email-invalid')).toBeVisible();
  });

  test('no-oob-code goes straight to invalid state', async ({ page }) => {
    await page.goto('/__sandbox/verify-email-no-oob-code');
    await expect(page.getByTestId('verify-email-invalid')).toBeVisible();
  });
});
