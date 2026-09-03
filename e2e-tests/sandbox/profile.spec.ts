import { expect, test } from '@playwright/test';

test.describe('Sandbox · ProfileViewComponent', () => {
  test('influencer fixture renders identity card', async ({ page }) => {
    await page.goto('/__sandbox/profile-influencer');
    await expect(page.getByTestId('profile-card')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toContainText(/Maja Kowalska/);
    await expect(page.getByTestId('profile-role')).toContainText(/Influencer/i);
    await expect(page.getByTestId('profile-email')).toContainText(/maja\.kowalska/);
    await expect(page.getByTestId('profile-email-verified')).toBeVisible();
    await expect(page.getByTestId('profile-complete-badge')).toBeVisible();
  });

  test('company fixture shows NIP + company name', async ({ page }) => {
    await page.goto('/__sandbox/profile-company');
    await expect(page.getByTestId('profile-name')).toContainText(/Acme Studios/);
    await expect(page.getByTestId('profile-card')).toContainText(/5252447777/);
  });

  test('loading fixture shows the spinner', async ({ page }) => {
    await page.goto('/__sandbox/profile-loading');
    await expect(page.getByTestId('profile-loading')).toBeVisible();
  });

  test('error fixture shows retry CTA', async ({ page }) => {
    await page.goto('/__sandbox/profile-error');
    await expect(page.getByTestId('profile-error')).toBeVisible();
    await expect(page.getByTestId('profile-retry')).toBeVisible();
  });

  test('edit button reveals the form pre-populated from the loaded user', async ({ page }) => {
    await page.goto('/__sandbox/profile-influencer');
    await page.getByTestId('profile-edit-button').click();
    await expect(page.getByTestId('profile-edit-form')).toBeVisible();
    await expect(page.getByTestId('profile-edit-first-name')).toHaveValue('Maja');
    await expect(page.getByTestId('profile-edit-phone')).toHaveValue('+48 123 456 789');
  });

  test('cancel returns to view without persisting changes', async ({ page }) => {
    await page.goto('/__sandbox/profile-influencer');
    await page.getByTestId('profile-edit-button').click();
    await page.getByTestId('profile-edit-first-name').fill('Anna');
    await page.getByTestId('profile-edit-cancel').click();
    await expect(page.getByTestId('profile-edit-form')).toHaveCount(0);
    await expect(page.getByTestId('profile-name')).toContainText(/Maja/);
  });
});
