import { expect, test, type Page } from '@playwright/test';

/**
 * Tailwind's preflight is off in this app, and until 2026-09-07 the landing
 * page's headings, paragraphs and lists still carried the user agent's
 * margins on top of every `gap-*` and `mt-*` the templates asked for. The
 * pricing cards were the worst of it: a plan card measured 1023 px with
 * 357 px of nothing above its button, and the three plans' prices sat at
 * three different heights because one description wrapped to a third line.
 *
 * Three instruments, all geometry: no margin on the landing's type that a
 * class did not ask for; the three plan cards share their rows (a subgrid)
 * and fit a screen; the two managed offers do the same. Each was made to
 * fail first — the reset reverted, the subgrid removed.
 */
const PLANS = ['starter', 'growth', 'premium'] as const;

test.describe('Sandbox · Landing pricing', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'desktop geometry');
  });

  async function open(page: Page, width = 1440): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/__sandbox/landing');
    await page.waitForLoadState('networkidle');
    // md and up the plan card is a subgrid; an unstyled mid-rebuild page is not.
    await expect(page.getByTestId('landing-pricing-starter')).toHaveCSS('display', 'grid');
  }

  test("no user-agent margin survives on the landing page's type", async ({ page }) => {
    await open(page);
    const offenders = await page.evaluate(() => {
      const out: string[] = [];
      const scope = 'section, app-oss-story-section';
      for (const el of document.querySelectorAll(`:is(${scope}) :is(h1, h2, h3, h4, p, ul, ol)`)) {
        const cs = getComputedStyle(el);
        const cls = (el as HTMLElement).className.toString();
        const mt = parseFloat(cs.marginTop);
        const mb = parseFloat(cs.marginBottom);
        // the OSS story's own rule: a paragraph after a paragraph gets a line
        const prose = el.tagName === 'P' && el.previousElementSibling?.tagName === 'P';
        const askedTop = /(^|\s)-?(mt-|my-|m-)/.test(cls) || prose;
        const askedBottom = /(^|\s)-?(mb-|my-|m-)/.test(cls);
        if ((mt > 0 && !askedTop) || (mb > 0 && !askedBottom)) {
          out.push(`${el.tagName.toLowerCase()} ${mt}/${mb} ${cls.slice(0, 40)}`);
        }
      }
      return out;
    });
    expect(offenders, `margins nobody asked for: ${offenders.slice(0, 4).join(' | ')}`).toEqual([]);
  });

  test('the three plans share their rows: prices, counts and buttons sit level', async ({
    page,
  }) => {
    for (const width of [1440, 1024]) {
      await open(page, width);
      const geo = await page.evaluate((ids) => {
        const top = (sel: string) =>
          Math.round(document.querySelector(sel)!.getBoundingClientRect().top);
        return {
          heights: ids.map((id) =>
            Math.round(
              document
                .querySelector(`[data-testid="landing-pricing-${id}"]`)!
                .getBoundingClientRect().height,
            ),
          ),
          prices: ids.map((id) => top(`[data-testid="landing-price-${id}"]`)),
          ctas: ids.map((id) => top(`[data-testid="landing-pricing-cta-${id}"]`)),
        };
      }, PLANS);
      expect(new Set(geo.heights).size, `at ${width}: heights ${geo.heights}`).toBe(1);
      expect(
        geo.heights[0],
        `at ${width}: a plan card is taller than a screen`,
      ).toBeLessThanOrEqual(640);
      expect(new Set(geo.prices).size, `at ${width}: prices at ${geo.prices}`).toBe(1);
      expect(new Set(geo.ctas).size, `at ${width}: buttons at ${geo.ctas}`).toBe(1);
    }
  });

  test('the two managed offers share their rows too', async ({ page }) => {
    await open(page, 1440);
    const geo = await page.evaluate(() => {
      const ids = ['hands-free', 'enterprise'];
      const card = (id: string) => document.querySelector(`[data-testid="landing-pricing-${id}"]`)!;
      const top = (id: string, sel: string) =>
        Math.round(card(id).querySelector(sel)!.getBoundingClientRect().top);
      return {
        heights: ids.map((id) => Math.round(card(id).getBoundingClientRect().height)),
        titles: ids.map((id) => top(id, 'h3')),
        prices: ids.map((id) => top(id, 'p.text-4xl')),
        ctas: ids.map((id) => top(id, 'a')),
      };
    });
    expect(new Set(geo.heights).size, `heights ${geo.heights}`).toBe(1);
    expect(geo.heights[0], 'a managed card is taller than a screen').toBeLessThanOrEqual(600);
    expect(new Set(geo.titles).size, `titles at ${geo.titles}`).toBe(1);
    expect(new Set(geo.prices).size, `prices at ${geo.prices}`).toBe(1);
    expect(new Set(geo.ctas).size, `buttons at ${geo.ctas}`).toBe(1);
  });
});
