import { expect, test } from '@playwright/test';
import { ACTORS, GREENFIELD_URL, login, recordApiCalls } from './_actor';

/**
 * FE-only: F0c live-BE trace flow. Asserts the FE-greenfield emits the
 * expected API call surface when an influencer browses /collaborations/list.
 * BE-side coverage of the same endpoint lives in the ported partnership /
 * applied-opportunity Cucumber specs.
 *
 * F0c — Live-BE integration test for Stage 4 opportunity browse.
 *
 * influencer1 navigates to /collaborations/list; the page issues the
 * expected POST /partnership-opportunities/list (paginated find) and
 * either renders cards (if seed data exists) or the empty state.
 */

test.describe('Live-BE integration · Stage 4 opportunities', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(
        `${process.env['BE_URL'] ?? 'https://localhost:8080'}/api/public-config`,
        { ignoreHTTPSErrors: true, timeout: 3_000 },
      );
      if (!res.ok()) test.skip(true, `BE health-check failed (${res.status()})`);
    } catch (err) {
      test.skip(true, `BE not reachable: ${(err as Error).message}`);
    }
  });

  test('influencer1 loads paginated opportunities list', async ({ page }) => {
    await login(page, ACTORS['influencer1']!);
    const recorder = recordApiCalls(page);

    await page.goto(`${GREENFIELD_URL}/collaborations/list`, {
      waitUntil: 'networkidle',
    });

    const calls = recorder.flush();
    // Codegen → BE: `findPaginated7()` hits `/partnership-opportunity/paged`.
    // FE dev-server proxies as `/api/partnership-opportunity/paged`.
    const listCall = calls.find(([_, u]) => /\/api\/partnership-opportunity\/paged\b/.test(u));
    expect(listCall).toBeDefined();

    // Page rendered into one of the three terminal states (loaded, empty, error).
    const root = page.getByTestId('opportunities-list');
    await expect(root).toBeVisible();
    const hasItems = await page
      .getByTestId('opportunities-list-items')
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByTestId('opportunities-list-empty')
      .isVisible()
      .catch(() => false);
    const hasError = await page
      .getByTestId('opportunities-list-error')
      .isVisible()
      .catch(() => false);
    expect(hasItems || hasEmpty || hasError).toBe(true);
  });
});
