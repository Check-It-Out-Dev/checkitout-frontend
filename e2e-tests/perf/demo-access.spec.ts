import { expect, test, type Page } from '@playwright/test';

/**
 * The demo, from the perspectives the smoothness tier cannot see: a visitor
 * driving it from the keyboard, a visitor hearing it through a screen reader,
 * and a visitor who has asked the system to stop animating things.
 *
 * Every assertion here was written against something the audit actually found:
 *   • the world-simulator frame claimed `aria-modal` while trapping no focus,
 *     which tells assistive technology that the guide panel and the ring's
 *     pill — the only ways forward — are inert;
 *   • the step narration changed silently, so the guidance a sighted visitor
 *     reads was never announced;
 *   • the landing story plays by itself, which WCAG 2.2.2 allows only when it
 *     can be paused.
 *
 * Runs in the same tier as the smoothness spec: `npm run test:perf`.
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';

/** Tab from the top of the document until the testid shows up, or give up. */
async function tabsTo(page: Page, testid: string, limit = 12): Promise<number> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 1; i <= limit; i++) {
    await page.keyboard.press('Tab');
    const on = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    if (on === testid) return i;
  }
  return -1;
}

test.describe('Demo access', () => {
  test('the tour can be driven from the keyboard alone', async ({ page }) => {
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
    const pill = page.locator('[data-testid="guide-spot-next"]');
    await expect(pill).toBeVisible({ timeout: 30_000 });

    // a real button with a real name, not a div someone styled
    expect(await pill.evaluate((el) => el.tagName)).toBe('BUTTON');
    expect((await pill.getAttribute('aria-label')) ?? (await pill.innerText())).toBeTruthy();

    const tabs = await tabsTo(page, 'guide-spot-next');
    expect(tabs, 'the tour control must be reachable by Tab').toBeGreaterThan(0);

    const before = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step,
    );
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (prev) => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step !== prev,
      before,
      { timeout: 10_000 },
    );
  });

  test('each step is announced, not just shown', async ({ page }) => {
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
    const narration = page.locator('[data-testid="guide-narration"]');
    await expect(narration).toBeVisible({ timeout: 30_000 });

    // role=status carries an implicit polite live region: the text changing is
    // what a screen reader reads out
    expect(await narration.getAttribute('role')).toBe('status');
    const first = (await narration.innerText()).trim();
    expect(first.length).toBeGreaterThan(0);

    await page.click('[data-testid="guide-spot-next"]');
    await expect
      .poll(async () => (await narration.innerText()).trim(), { timeout: 10_000 })
      .not.toBe(first);
    // the live region must be the SAME element across the step change, or
    // nothing is announced
    expect(await page.locator('[data-testid="guide-narration"]').count()).toBe(1);
  });

  test('nothing the demo owns claims modality it does not enforce', async ({ page }) => {
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });

    // walk to a step that opens a world simulator
    for (let i = 0; i < 6; i++) {
      if (await page.locator('app-world-sim-shell').count()) break;
      await page.click('[data-testid="guide-spot-next"]').catch(() => undefined);
      await page.waitForTimeout(900);
    }
    await expect(page.locator('app-world-sim-shell')).toHaveCount(1);

    const claims = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            'app-world-sim-shell [aria-modal="true"], .guide-pop[aria-modal="true"]',
          ),
        ].length,
    );
    expect(claims, 'the guide and its simulators keep the tour reachable').toBe(0);

    // and the frame still says what it is
    const named = await page.evaluate(() => {
      const el = document.querySelector(
        'app-world-sim-shell [role="dialog"], app-world-sim-shell [role="complementary"]',
      );
      return el?.getAttribute('aria-label') ?? null;
    });
    expect(named).toBeTruthy();

    // the tour's own control is still there while the simulator is open
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible();
  });

  test('the tour and the story stop animating when motion is not wanted', async ({ page }) => {
    // Emulated explicitly rather than through test.use: a nested use() silently
    // did nothing here, and an accessibility test that quietly checks an
    // un-emulated page is worse than no test at all — so the emulation is
    // asserted before anything is concluded from it.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // CSS is only half of it: a scroll started from script with
    // behavior:'smooth' keeps gliding whatever the stylesheet says, and the
    // tour scrolls from script on every step (W3C technique C39).
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const seen: string[] = [];
      w['__scrolls'] = seen;
      const real = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
        seen.push(typeof arg === 'object' && arg?.behavior ? arg.behavior : 'default');
        return real.call(this, arg as ScrollIntoViewOptions);
      };
    });
    await page.goto(`${BASE}/demo?start=company-campaign`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });

    const endless = async (scope: string): Promise<string[]> =>
      page.evaluate(
        (sel) =>
          [...document.querySelectorAll(sel)]
            .filter((el) => {
              const cs = getComputedStyle(el);
              return cs.animationName !== 'none' && cs.animationIterationCount === 'infinite';
            })
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`),
        scope,
      );

    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'the test must actually be emulating reduced motion',
    ).toBe(true);
    expect(await endless('*'), 'nothing in the tour may animate forever').toEqual([]);

    // walk a few steps so the tour actually scrolls, then check how it scrolled
    for (let i = 0; i < 3; i++) {
      await page
        .click('[data-testid="guide-spot-next"]', { timeout: 8_000 })
        .catch(() => undefined);
      await page.waitForTimeout(700);
    }
    const scrolls = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__scrolls'] as string[],
    );
    expect(scrolls.length, 'the tour should have scrolled at least once').toBeGreaterThan(0);
    expect(
      scrolls.filter((b) => b === 'smooth'),
      'a visitor who asked for less motion must not be given a script-driven glide',
    ).toEqual([]);

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="dashboard-mode-simulation"]').scrollIntoViewIfNeeded();
    await page.click('[data-testid="dashboard-mode-simulation"]');
    await page.waitForSelector('[data-testid^="dashboard-brand-"]');
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'emulation must survive the navigation',
    ).toBe(true);
    expect(await endless('[data-testid="landing-dashboard-preview"] *')).toEqual([]);
  });

  test('the self-playing story can be paused, as WCAG 2.2.2 requires', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="dashboard-mode-simulation"]').scrollIntoViewIfNeeded();
    await page.click('[data-testid="dashboard-mode-simulation"]');
    await page.waitForSelector('[data-testid^="dashboard-brand-"]');

    // one toggle: it reads "pause" while the story plays
    const pause = page.locator('[data-testid="dashboard-autoplay"]');
    await expect(
      pause,
      'an animation that runs longer than 5 s needs a pause control',
    ).toBeVisible();
    expect((await pause.getAttribute('aria-label')) ?? (await pause.innerText())).toBeTruthy();

    const beat = () =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid^="dashboard-brand-"]')
            ?.getAttribute('data-testid') ?? '',
      );
    await pause.click();
    const held = await beat();
    await page.waitForTimeout(4200); // longer than the longest beat
    expect(await beat(), 'a paused story must not move on').toBe(held);
  });
});
