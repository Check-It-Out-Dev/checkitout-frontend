import { expect, test } from '@playwright/test';

test.describe('Sandbox · SignInComponent', () => {
  test('empty fixture renders the form', async ({ page }) => {
    await page.goto('/__sandbox/sign-in-empty');
    await expect(page.getByTestId('sign-in-email')).toBeVisible();
    await expect(page.getByTestId('sign-in-password')).toBeVisible();
    await expect(page.getByTestId('sign-in-submit')).toBeVisible();
    await expect(page.getByTestId('sign-in-error')).toHaveCount(0);
  });

  test('invalid-credentials fixture surfaces error after submit', async ({ page }) => {
    await page.goto('/__sandbox/sign-in-invalid-credentials');
    await page.getByTestId('sign-in-email').fill('user@example.com');
    await page.getByTestId('sign-in-password').fill('wrong-password');
    await page.getByTestId('sign-in-submit').click();
    await expect(page.getByTestId('sign-in-error')).toBeVisible();
  });
});
