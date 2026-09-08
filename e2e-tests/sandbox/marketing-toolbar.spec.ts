import { expect, test } from '@playwright/test';

/**
 * What the toolbar owes a visitor: the pages exist in it, and none of them
 * disappears when the viewport shrinks.
 *
 * This file is deliberately narrower than the bug that prompted it. The nav
 * gained the two engineering pages, and in Polish the multi-word labels broke
 * over two lines — the bar became two rows tall at 1440 px. The pixel tier
 * caught that (`landing-chromium-desktop-win32.png`); a DOM measurement of the
 * same thing did NOT, and the reason is worth recording: label width depends on
 * whether Albert Sans is actually in use, `font-display: optional` drops a face
 * that is not ready in ~100 ms for the whole page load, and this tier does not
 * control that. Measuring the same string three times across two navigations
 * gave 80 px, 71 px and — in the pixel tier, which does control it — enough to
 * wrap. An instrument that cannot be made to fail against a planted defect does
 * not count as coverage, so the width assertions were deleted rather than
 * shipped green. Text geometry stays with the pixel baselines, which own it.
 *
 * What is left is font-independent and was each checked against a deliberately
 * broken build: the breakpoint, the menu's completeness, and the footer.
 */

/** Below `lg` (1280 px in this config — Material's scale, not Tailwind's
 * defaults) the bar hands its list to the menu. */
const MENU_WIDTHS = [960, 1024, 1152] as const;
const BAR_WIDTHS = [1280, 1440, 1920] as const;

test.describe('Sandbox · MarketingToolbarComponent', () => {
  // Viewport arithmetic, not rendering: one engine is enough, and the mobile
  // project's viewport is fixed by its device profile anyway.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'desktop widths only');
  });

  async function landingAt(page: import('@playwright/test').Page, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/__sandbox/landing');
    await page.waitForLoadState('networkidle');
  }

  const navShown = (page: import('@playwright/test').Page): Promise<boolean> =>
    page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('[data-testid="marketing-toolbar"]')!.querySelector('nav')!,
        ).display !== 'none',
    );

  test('the bar carries the seven primary pages from lg upwards', async ({ page }) => {
    for (const width of BAR_WIDTHS) {
      await landingAt(page, width);
      expect(await navShown(page), `@ ${width}px: nav should be in the bar`).toBe(true);
    }

    // The two the survey argument depends on. `technical-survey` is the entry
    // door a CV link points at, and it had no entrance in the bar at all until
    // this slice; `codemap` is the tooling page it leans on.
    await expect(page.getByTestId('marketing-toolbar-nav-survey')).toHaveAttribute(
      'href',
      '/technical-survey',
    );
    await expect(page.getByTestId('marketing-toolbar-nav-codemap')).toHaveAttribute(
      'href',
      '/codemap',
    );
    // the funding disclosure was lost from the bar once; the owner wants it there
    await expect(page.getByTestId('marketing-toolbar-nav-grants')).toHaveAttribute(
      'href',
      '/grants',
    );
  });

  test('below lg the list moves into the menu, and nothing is lost', async ({ page }) => {
    for (const width of MENU_WIDTHS) {
      await landingAt(page, width);
      expect(await navShown(page), `@ ${width}px: nav should be behind the menu`).toBe(false);
      await expect(page.getByTestId('marketing-toolbar-hamburger')).toBeVisible();
    }

    // `team` was demoted out of the bar on purpose. The menu is where it went,
    // so "demoted" must not be able to become "gone".
    await page.getByTestId('marketing-toolbar-hamburger').click();
    for (const key of [
      'survey',
      'codemap',
      'grants',
      'team',
      'how-it-works',
      'pricing',
      'faq',
      'contact',
    ]) {
      await expect(page.getByTestId(`marketing-toolbar-mnav-${key}`)).toBeVisible();
    }
  });

  test('the engineering pages are reachable from the footer too', async ({ page }) => {
    await landingAt(page, 1440);
    await expect(page.getByTestId('landing-footer-survey')).toHaveAttribute(
      'href',
      '/technical-survey',
    );
    await expect(page.getByTestId('landing-footer-codemap')).toHaveAttribute('href', '/codemap');
    await expect(page.getByTestId('landing-footer-team')).toHaveAttribute('href', '/team');
    await expect(page.getByTestId('landing-footer-grants')).toHaveAttribute('href', '/grants');
  });
});
