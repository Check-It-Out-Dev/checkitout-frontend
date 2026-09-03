import { expect, test } from '@playwright/test';

test.describe('Sandbox · LandingComponent', () => {
  test('renders hero + features + sign-in link', async ({ page }) => {
    await page.goto('/__sandbox/landing');
    await expect(page.getByTestId('landing')).toBeVisible();
    await expect(page.getByTestId('landing-badge')).toBeVisible();
    await expect(page.getByTestId('landing-title')).toBeVisible();
    await expect(page.getByTestId('landing-cta-primary')).toBeVisible();
    await expect(page.getByTestId('landing-cta-secondary')).toBeVisible();
    await expect(page.getByTestId('landing-sign-in')).toBeVisible();
  });

  test('CTA primary points to /auth/sign-up/business', async ({ page }) => {
    await page.goto('/__sandbox/landing');
    await expect(page.getByTestId('landing-cta-primary')).toHaveAttribute(
      'href',
      '/auth/sign-up/business',
    );
  });

  test('CTA secondary points to /auth/sign-up/influencer', async ({ page }) => {
    await page.goto('/__sandbox/landing');
    await expect(page.getByTestId('landing-cta-secondary')).toHaveAttribute(
      'href',
      '/auth/sign-up/influencer',
    );
  });
});
