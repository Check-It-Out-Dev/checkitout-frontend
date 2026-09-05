import { expect, test, type Page } from '@playwright/test';

/**
 * The tour on a phone.
 *
 * Everything else in this tier measures a desktop window, where the ring's
 * pill almost always finds room beside its target. A 390 px viewport takes
 * that room away: the pill goes above the target instead, and lands on
 * whatever is written there.
 *
 * That is how the inbox beat came to draw the pill across the last line of the
 * mail it was asking the visitor to read (measured 130x8 px), and the KSeF beat
 * across its "Status" label (34x7 px). The placement code did ask the page what
 * was underneath — but only along one horizontal line through the middle of the
 * pill, and the mail's text ended three pixels above that line.
 *
 * So this asserts the thing the visitor actually cares about: whatever else the
 * pill covers, it never covers words.
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';
const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE });

interface Overlap {
  text: string;
  overlap: [number, number];
}

/** Text nodes inside the open simulator that the pill is drawn over. */
async function textUnderPill(page: Page): Promise<Overlap[]> {
  return page.evaluate(() => {
    const pill = document.querySelector('[data-testid="guide-spot-next"]');
    if (!pill) return [];
    const q = pill.getBoundingClientRect();
    const hits: { text: string; overlap: [number, number] }[] = [];
    document.querySelectorAll('app-world-sim-shell *').forEach((el) => {
      if (el.childElementCount > 0) return;
      const text = (el.textContent ?? '').trim();
      if (!text) return;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      const ox = Math.min(q.right, b.right) - Math.max(q.left, b.left);
      const oy = Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top);
      // 2 px of anti-aliasing overlap is not "covering the text"
      if (ox > 2 && oy > 2) {
        hits.push({ text: text.slice(0, 60), overlap: [Math.round(ox), Math.round(oy)] });
      }
    });
    return hits;
  });
}

async function advance(page: Page): Promise<void> {
  await page.evaluate(() => {
    const b =
      document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
      document.querySelector<HTMLElement>('[data-testid="guide-next"]');
    b?.click();
  });
}

test.describe('Demo on a phone', () => {
  test('the pill never covers the words the beat is asking you to read', async ({ page }) => {
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });

    // the emulation is asserted, not assumed — a viewport that silently stayed
    // at the desktop default would make every assertion below vacuous
    expect(await page.evaluate(() => window.innerWidth)).toBe(PHONE.width);

    const seen: string[] = [];
    for (let step = 0; step < 8; step++) {
      const sim = await page.locator('app-world-sim-shell').count();
      if (sim) {
        const covered = await textUnderPill(page);
        expect(
          covered,
          `the pill was drawn over simulator copy: ${JSON.stringify(covered)}`,
        ).toEqual([]);
        seen.push(await page.evaluate(() => location.pathname));
      }
      const done = await page.evaluate(
        () => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').done === true,
      );
      if (done) break;
      await advance(page);
      await page.waitForTimeout(2600); // recipes, a world sim, and one full reload
    }

    // the walk has to have actually met simulators, or it proved nothing
    expect(seen.length, 'the tour should have opened at least two simulators').toBeGreaterThan(1);
  });

  test('nothing the tour draws spills off a 390 px screen', async ({ page }) => {
    await page.goto(`${BASE}/demo?start=company-campaign`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });

    const fit = await page.evaluate(() => {
      const panel = document.querySelector('.guide-pop');
      const p = panel?.getBoundingClientRect();
      const pill = document.querySelector('[data-testid="guide-spot-next"]');
      const q = pill?.getBoundingClientRect();
      const scroller = document.querySelector('mat-sidenav-content');
      return {
        panelInside: p
          ? p.left >= 0 && p.right <= window.innerWidth && p.bottom <= window.innerHeight
          : null,
        pillInside: q ? q.left >= 0 && q.right <= window.innerWidth && q.top >= 0 : null,
        panelOverflow: panel
          ? [...panel.querySelectorAll('*')].filter(
              (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
            ).length
          : null,
        hScroll:
          document.documentElement.scrollWidth > window.innerWidth + 1 ||
          (scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false),
      };
    });

    expect(fit.panelInside, 'the guide panel must fit the screen it is drawn on').toBe(true);
    expect(fit.pillInside, 'the pill must be on screen to be pressed').toBe(true);
    expect(fit.panelOverflow, 'no text in the panel may be clipped').toBe(0);
    expect(fit.hScroll, 'a phone must never scroll sideways').toBe(false);
  });
});
