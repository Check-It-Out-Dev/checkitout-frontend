import { expect, test } from '@playwright/test';

test.describe('Sandbox · AddressesComponent', () => {
  test('list fixture renders both saved addresses', async ({ page }) => {
    await page.goto('/__sandbox/addresses-with-list');
    await expect(page.getByTestId('addresses-list')).toBeVisible();
    await expect(page.getByTestId('address-item-1')).toContainText(/Marszałkowska 100/);
    await expect(page.getByTestId('address-item-2')).toContainText(/Plac Solny 12/);
  });

  test('empty fixture shows empty-state message', async ({ page }) => {
    await page.goto('/__sandbox/addresses-empty');
    await expect(page.getByTestId('addresses-empty')).toBeVisible();
  });

  test('clicking Add opens the form, Cancel closes it', async ({ page }) => {
    await page.goto('/__sandbox/addresses-with-list');
    await page.getByTestId('addresses-add-button').click();
    await expect(page.getByTestId('addresses-form')).toBeVisible();
    await page.getByTestId('addresses-cancel').click();
    await expect(page.getByTestId('addresses-form')).toHaveCount(0);
  });
});
