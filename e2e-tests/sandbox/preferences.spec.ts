import { expect, test } from '@playwright/test';

test.describe('Sandbox · PreferencesComponent', () => {
  test('loaded fixture renders all toggle groups + save button', async ({ page }) => {
    await page.goto('/__sandbox/preferences-loaded');
    await expect(page.getByTestId('preferences-form')).toBeVisible();
    await expect(page.getByTestId('preferences-channel-email')).toBeVisible();
    await expect(page.getByTestId('preferences-channel-push')).toBeVisible();
    await expect(page.getByTestId('preferences-category-partnership')).toBeVisible();
    await expect(page.getByTestId('preferences-category-support')).toBeVisible();
    await expect(page.getByTestId('preferences-category-system')).toBeVisible();
    await expect(page.getByTestId('preferences-gdpr-marketing')).toBeVisible();
    await expect(page.getByTestId('preferences-save')).toBeVisible();
  });

  test('save button is disabled until form becomes dirty', async ({ page }) => {
    await page.goto('/__sandbox/preferences-loaded');
    // Wait for the form + toggle to settle before interacting — flake came
    // from clicking the slide-toggle before Angular wired the formControl.
    await expect(page.getByTestId('preferences-form')).toBeVisible();
    await expect(page.getByTestId('preferences-gdpr-marketing')).toBeVisible();
    await expect(page.getByTestId('preferences-save')).toBeDisabled();
    await page.getByTestId('preferences-gdpr-marketing').click();
    await expect(page.getByTestId('preferences-save')).toBeEnabled();
  });

  test('error fixture shows retry CTA', async ({ page }) => {
    await page.goto('/__sandbox/preferences-error');
    await expect(page.getByTestId('preferences-error')).toBeVisible();
    await expect(page.getByTestId('preferences-retry')).toBeVisible();
  });
});
