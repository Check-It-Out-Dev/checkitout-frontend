import { expect, test } from '@playwright/test';

/**
 * Harness boot spec — proves the sandbox registry is reachable, the index
 * lists fixtures, a real fixture renders live, and unknown ids surface the
 * not-found state. (The original placeholder fixtures this file asserted
 * were excised in iter-104 once every route had a real component; the spec
 * now asserts the live registry instead.)
 */
test.describe('Sandbox · harness', () => {
  test('index page lists registered fixtures', async ({ page }) => {
    await page.goto('/__sandbox');
    await expect(page.getByRole('heading', { name: /sandbox/i })).toBeVisible();
    await expect(page.getByText(/fixtures registered/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in · empty' })).toBeVisible();
  });

  test('renders a registry fixture from its route', async ({ page }) => {
    await page.goto('/__sandbox/sign-in-empty');
    await expect(page.getByTestId('sign-in-email')).toBeVisible();
  });

  test('shows not-found state for unknown fixture id', async ({ page }) => {
    await page.goto('/__sandbox/this-fixture-does-not-exist');
    await expect(page.getByText(/Fixture not found/i)).toBeVisible();
  });
});
