import { expect, test } from '@playwright/test';

test.describe('Sandbox · ForgotPasswordComponent', () => {
  test('empty fixture renders the form', async ({ page }) => {
    await page.goto('/__sandbox/forgot-password-empty');
    await expect(page.getByTestId('forgot-password-email')).toBeVisible();
    await expect(page.getByTestId('forgot-password-submit')).toBeVisible();
  });

  test('happy path flips to success message', async ({ page }) => {
    await page.goto('/__sandbox/forgot-password-empty');
    await page.getByTestId('forgot-password-email').fill('user@example.com');
    await page.getByTestId('forgot-password-submit').click();
    await expect(page.getByTestId('forgot-password-success')).toBeVisible();
  });

  test('rate-limited fixture surfaces error after submit', async ({ page }) => {
    await page.goto('/__sandbox/forgot-password-rate-limited');
    await page.getByTestId('forgot-password-email').fill('user@example.com');
    await page.getByTestId('forgot-password-submit').click();
    await expect(page.getByTestId('forgot-password-error')).toBeVisible();
  });
});
