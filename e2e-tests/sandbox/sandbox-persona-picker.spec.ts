import { expect, test } from '@playwright/test';

/**
 * Sandbox tier · the public sandbox's persona picker (docs/ci/SANDBOX.md §3). The sign-in call is
 * stubbed by the fixture; the real endpoint is proven by deploy/sandbox/smoke.sh against the stack.
 */
test.describe('Sandbox · SandboxPersonaPickerComponent', () => {
  test('offers the two personas and says what the sandbox is', async ({ page }) => {
    await page.goto('/__sandbox/sandbox-persona-picker');
    await expect(page.getByTestId('sandbox-persona-company')).toBeVisible();
    await expect(page.getByTestId('sandbox-persona-influencer')).toBeVisible();
    // Language-neutral assertions: the app may render Polish or English depending on the visitor.
    await expect(page.getByTestId('sandbox-notice')).toContainText('sandbox');
    await expect(page.getByTestId('sandbox-persona-picker')).toContainText('03:00 UTC');
  });

  test('a choice disables both buttons and shows the pending spinner', async ({ page }) => {
    await page.goto('/__sandbox/sandbox-persona-picker');
    await page.getByTestId('sandbox-persona-company').click();
    await expect(page.getByTestId('sandbox-persona-pending')).toBeVisible();
    await expect(page.getByTestId('sandbox-persona-company')).toBeDisabled();
    await expect(page.getByTestId('sandbox-persona-influencer')).toBeDisabled();
  });

  test('says so when the guard refuses, and lets the visitor try again', async ({ page }) => {
    await page.goto('/__sandbox/sandbox-persona-picker-refused');
    await page.getByTestId('sandbox-persona-influencer').click();
    await expect(page.getByTestId('sandbox-persona-error')).toBeVisible();
    await expect(page.getByTestId('sandbox-persona-error')).toContainText('sandbox');
    await expect(page.getByTestId('sandbox-persona-influencer')).toBeEnabled();
  });
});
