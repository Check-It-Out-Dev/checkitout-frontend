import { expect, test } from '@playwright/test';

/**
 * The hero connector: a line with room to travel, and two dots that cross in
 * the middle.
 *
 * The first assertion is a regression guard for a defect that was live at
 * every desktop width: the card is 392 px, and after padding, gaps and the two
 * marks the connection had 40 px — two dots and their gaps, and 0 px for the
 * dashed line between them. What visitors saw was two dots and nothing
 * joining them.
 *
 * The crossing is asserted by SCRUBBING, never by watching. The dots are on
 * one 4.8 s timeline with mirror-image keyframes and a point-symmetric easing,
 * so their centres coincide at exactly 25 % of a cycle — 1200 ms. The Web
 * Animations API can pause a CSS animation and seek it there, and a paused
 * animation renders the same frame every time it is asked. Sampling live
 * frames would make the test a reading of the machine's frame rate.
 *
 * Angular's emulated encapsulation prefixes keyframe names
 * (`_ngcontent-…_hero-cross-ltr`), so the name is matched by substring.
 */
const CYCLE_MS = 4800;
const CROSSING_MS = CYCLE_MS / 4;

const DOT = (which: 'creator' | 'company') => `[data-testid="hero-illustration-dot-${which}"]`;

test.describe('Sandbox · HeroIllustrationComponent', () => {
  // The hero is `hidden md:flex`, and the mobile project's viewport is below md.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'the hero is desktop-only');
  });

  async function landingAt(page: import('@playwright/test').Page, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/__sandbox/landing');
    await page.waitForLoadState('networkidle');
  }

  for (const width of [1440, 1024] as const) {
    test(`the line has room and the dots meet in the middle · ${width}px`, async ({ page }) => {
      await landingAt(page, width);

      const line = page.getByTestId('hero-illustration-connection-line').first();
      const lineWidth = await line.evaluate((el) => el.getBoundingClientRect().width);
      expect(lineWidth, 'the dashed line used to be 0 px wide').toBeGreaterThan(40);

      const motion = await page.evaluate(
        ([creatorSel, companySel]) =>
          [creatorSel, companySel].map((sel) => {
            const cs = getComputedStyle(document.querySelector(sel)!);
            return {
              name: cs.animationName,
              iterations: cs.animationIterationCount,
              duration: cs.animationDuration,
            };
          }),
        [DOT('creator'), DOT('company')],
      );
      for (const m of motion) {
        expect(m.name).toContain('hero-cross');
        expect(m.iterations).toBe('infinite');
      }
      expect(motion[0].duration, 'the two dots must share one timeline').toBe(motion[1].duration);

      const at = await page.evaluate(
        async ([creatorSel, companySel, t]) => {
          const creator = document.querySelector(creatorSel as string)!;
          const company = document.querySelector(companySel as string)!;
          for (const el of [creator, company]) {
            const [anim] = el.getAnimations();
            anim.pause();
            anim.currentTime = t as number;
          }
          // Two frames: one for the seek to apply, one for layout to settle.
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const centre = (el: Element) => {
            const r = el.getBoundingClientRect();
            return r.left + r.width / 2;
          };
          const conn = document
            .querySelector('[data-testid="hero-illustration-connection"]')!
            .getBoundingClientRect();
          return {
            creator: centre(creator),
            company: centre(company),
            middle: conn.left + conn.width / 2,
          };
        },
        [DOT('creator'), DOT('company'), CROSSING_MS] as const,
      );
      expect(Math.abs(at.creator - at.company), 'the dots did not meet').toBeLessThanOrEqual(2);
      expect(Math.abs(at.creator - at.middle), 'they met off-centre').toBeLessThanOrEqual(2);
    });
  }

  test('under reduced motion the dots stay home and nothing runs forever', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await landingAt(page, 1440);

    const state = await page.evaluate(
      ([creatorSel, companySel]) =>
        [creatorSel, companySel].map((sel) => {
          const el = document.querySelector(sel)!;
          return { name: getComputedStyle(el).animationName, running: el.getAnimations().length };
        }),
      [DOT('creator'), DOT('company')],
    );
    for (const s of state) {
      expect(s.name).toBe('none');
      expect(s.running).toBe(0);
    }
    // The picture must still be whole with the motion off: the line is there.
    const lineWidth = await page
      .getByTestId('hero-illustration-connection-line')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(lineWidth).toBeGreaterThan(40);
  });
});
