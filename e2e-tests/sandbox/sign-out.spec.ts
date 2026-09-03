import { expect, test } from '@playwright/test';

test.describe('Sandbox · SignOutComponent', () => {
  test('in-progress fixture renders the spinner + label', async ({ page }) => {
    await page.goto('/__sandbox/sign-out-in-progress');
    await expect(page.getByTestId('sign-out')).toBeVisible();
    // Spinner present
    await expect(page.locator('mat-spinner')).toBeVisible();
  });
});
