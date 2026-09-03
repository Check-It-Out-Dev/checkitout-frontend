import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'cio.consent.v1';

test.describe('Sandbox · CookieBannerComponent', () => {
  test('renders banner with both CTAs when consent is pending (clean state)', async ({ page }) => {
    await page.addInitScript(
      ({ key }) => {
        window.localStorage.removeItem(key);
      },
      { key: STORAGE_KEY },
    );
    await page.goto('/__sandbox/cookie-banner');
    await expect(page.getByTestId('cookie-banner')).toBeVisible();
    await expect(page.getByTestId('cookie-banner-accept-all')).toBeVisible();
    await expect(page.getByTestId('cookie-banner-necessary')).toBeVisible();
  });

  test('hidden when consent has already been decided', async ({ page }) => {
    await page.addInitScript(
      ({ key }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            necessary: true,
            analytics: true,
            marketing: true,
            decidedAt: '2026-05-08T00:00:00.000Z',
          }),
        );
      },
      { key: STORAGE_KEY },
    );
    await page.goto('/__sandbox/cookie-banner');
    await expect(page.getByTestId('cookie-banner')).toHaveCount(0);
  });

  test('clicking accept-all hides the banner', async ({ page }) => {
    await page.addInitScript(
      ({ key }) => {
        window.localStorage.removeItem(key);
      },
      { key: STORAGE_KEY },
    );
    await page.goto('/__sandbox/cookie-banner');
    await page.getByTestId('cookie-banner-accept-all').click();
    await expect(page.getByTestId('cookie-banner')).toHaveCount(0);
  });

  test('clicking necessary-only hides the banner', async ({ page }) => {
    await page.addInitScript(
      ({ key }) => {
        window.localStorage.removeItem(key);
      },
      { key: STORAGE_KEY },
    );
    await page.goto('/__sandbox/cookie-banner');
    await page.getByTestId('cookie-banner-necessary').click();
    await expect(page.getByTestId('cookie-banner')).toHaveCount(0);
  });
});
