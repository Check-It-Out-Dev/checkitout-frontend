import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The quality dashboard is a published report, so it has to be readable by the people the reports
 * are for — including the ones using a screen reader, a keyboard, or a screen in daylight.
 *
 * <p>Everything else the estate publishes gets measured. The app has Lighthouse; the tiers have
 * axe-free but human-reviewed markup; the dashboard had nothing at all, which meant its
 * accessibility was an intention rather than a fact. It is generated markup driven by run data, so
 * a chart that renders one way on a green run and another way on a red one can regress in a state
 * nobody looked at.
 *
 * <p>Run against the fixture data (`?data=fixtures`), which is exactly why fixtures exist: 30 runs
 * of history, a flaky list, mutation and security tiles, every rendering branch on screen at once.
 *
 * <p>Both themes and both widths, because the page follows `prefers-color-scheme` and reflows at
 * the phone breakpoint: contrast is a property of the rendered pixels, so a palette that passes in
 * light can fail in dark, and a layout that passes wide can collide narrow.
 */

const PAGE = '/index.html?data=fixtures';

/** WCAG 2.2 AA, which is what the estate's own accessibility claims are measured against. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function ready(page: Page): Promise<void> {
  await page.goto(PAGE, { waitUntil: 'networkidle' });
  // The verdict starts as "Reading the latest run…" and is replaced once the fetches resolve.
  // Asserting on it keeps this from passing against a page that never rendered.
  await expect(page.locator('#verdict')).not.toHaveText(/Reading the latest run/);
  await expect(page.locator('#tiles')).not.toBeEmpty();
}

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }));
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['phone', { width: 390, height: 844 }],
  ] as const) {
    test(`no WCAG 2.2 AA violations — ${scheme}, ${label}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(viewport);
      await ready(page);

      const found = await violations(page);
      expect(found, JSON.stringify(found, null, 2)).toEqual([]);
    });
  }
}

test('the page is navigable by keyboard alone', async ({ page }) => {
  await ready(page);

  // Every link in the masthead has to be reachable by tabbing, in order. A nav that can only be
  // used with a pointer is the commonest way a page like this becomes unusable without one.
  const navLinks = await page.locator('.mast a, .mast__nav a').count();
  expect(navLinks).toBeGreaterThan(0);

  const reached: string[] = [];
  for (let i = 0; i < navLinks + 2; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return { tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 40) };
    });
    if (focused) reached.push(`${focused.tag}:${focused.text}`);
  }

  expect(reached.length, 'tabbing reached nothing focusable').toBeGreaterThanOrEqual(navLinks);
});

test('the focused element is visibly focused', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Tab');

  // A focus ring the browser draws by default disappears the moment anything sets `outline: none`.
  // Asserting the computed style is the only way to notice that from a test.
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      boxShadow: s.boxShadow,
    };
  });

  expect(outline, 'nothing was focused after one Tab').not.toBeNull();
  const hasRing =
    (outline!.outlineStyle !== 'none' && parseFloat(outline!.outlineWidth) > 0) ||
    (outline!.boxShadow !== 'none' && outline!.boxShadow !== '');
  expect(hasRing, `focused element has no visible focus indicator: ${JSON.stringify(outline)}`).toBe(
    true,
  );
});
