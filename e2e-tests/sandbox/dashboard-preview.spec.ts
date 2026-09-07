import { expect, type Page, test } from '@playwright/test';

/**
 * The interactive presentation is a STAGE: one card whose height does not
 * change — not between beats, not when the story ends.
 *
 * Three things went wrong with the old three-column grid, and they were one
 * defect: nothing fixed its size. The middle column stacked seven steps with
 * descriptions and set the height of everything (~800 px, taller than a 768-px
 * laptop with the toolbar); the controls sat at the bottom of it; and the
 * finale replaced the grid with a small card, so the section dropped by
 * ~500 px and visitors read it as the component vanishing.
 *
 * So the assertions here are about geometry, measured: the stage's height is
 * the same number at three beats and after completion, the transport bar sits
 * above the panes, and no pane ever has more content than it can show. The
 * last one is the guard for the next person who adds a tile: `overflow-hidden`
 * would clip it silently, and this would not.
 *
 * Fixtures: `dashboard-preview-{application,production,results}` open the
 * component at beats 1, 4 and 6 with no timers. The rest of the beats are
 * reached through the stepper pills, which is also what a visitor does.
 */
const STAGE = '[data-testid="dashboard-stage"]';
const PANES = ['dashboard-pane-brand', 'dashboard-pane-influencer'] as const;

test.describe('Sandbox · InteractiveDashboardPreviewComponent', () => {
  test.beforeEach(({}, testInfo) => {
    // Desktop geometry: the fixed height is an `lg:` rule.
    test.skip(testInfo.project.name !== 'chromium-desktop', 'the stage is fixed at lg');
  });

  async function open(page: Page, fixture: string, width = 1440): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/__sandbox/${fixture}`);
    await page.waitForLoadState('networkidle');
    // A page served between two dev-server rebuilds arrives without its
    // stylesheet, and an unstyled stage is 800 px of raw text. That is a
    // reading of the server, not of the layout — so wait for the styles.
    await expect(page.locator(STAGE)).toHaveCSS('display', 'flex');
  }

  const stageHeight = (page: import('@playwright/test').Page) =>
    page.locator(STAGE).evaluate((el) => Math.round(el.getBoundingClientRect().height));

  /** Every pane must fit what it holds. */
  async function expectNoOverflow(page: import('@playwright/test').Page, where: string) {
    for (const id of PANES) {
      const o = await page
        .getByTestId(id)
        .evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
      expect(o.scroll, `${id} overflows its budget ${where}`).toBeLessThanOrEqual(o.client + 1);
    }
  }

  test('the stage keeps one height across beats and through the finale', async ({ page }) => {
    const seen: number[] = [];
    for (const fixture of [
      'dashboard-preview-application',
      'dashboard-preview-production',
      'dashboard-preview-results',
    ]) {
      await open(page, fixture);
      seen.push(await stageHeight(page));
      await expectNoOverflow(page, `at ${fixture}`);
    }
    expect(new Set(seen).size, `stage heights per beat: ${seen.join(', ')}`).toBe(1);

    // Drive the results beat to its end: the finale must not move the stage.
    await page.getByTestId('dashboard-next').click();
    await expect(page.getByTestId('dashboard-success')).toBeVisible();
    await expect(page.getByTestId('dashboard-pane-brand')).toBeVisible();
    await expect(page.getByTestId('dashboard-pane-influencer')).toBeVisible();
    expect(await stageHeight(page), 'the finale changed the stage height').toBe(seen[0]);
    await expectNoOverflow(page, 'at the finale');
  });

  test('the transport bar is above the panes, and every beat fits', async ({ page }) => {
    await open(page, 'dashboard-preview-application');

    const bar = await page.getByTestId('dashboard-transport').boundingBox();
    const brand = await page.getByTestId('dashboard-pane-brand').boundingBox();
    expect(bar && brand && bar.y + bar.height <= brand.y, 'controls are not on top').toBe(true);

    // Through all seven beats via the pills — what a visitor does.
    const keys = [
      'campaign_created',
      'influencer_application',
      'review_selection',
      'agreement_planning',
      'content_creation',
      'content_approval',
      'publication_results',
    ];
    const heights: number[] = [];
    for (const key of keys) {
      await page.getByTestId(`dashboard-step-${key}`).locator('button').click();
      await expect(page.getByTestId(`dashboard-brand-${key}`)).toBeVisible();
      heights.push(await stageHeight(page));
      await expectNoOverflow(page, `at ${key}`);
    }
    expect(new Set(heights).size, `stage heights: ${heights.join(', ')}`).toBe(1);
  });

  /**
   * The flight: each beat's message crosses the channel from the sender's pane
   * to the receiver's and dissolves into the receiver's tile — one animation
   * of 960 ms. Asserted by scrubbing, paused and seeked through the Web
   * Animations API, never by watching. Instants in ms from the mount:
   * 0, not there yet; 105, faded in at the sender's edge; 350, its centre
   * inside the channel; 700, flush with the receiver's edge; 960, absorbed.
   * Beat 1 is her application going to the brand.
   */
  type Instant = {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centre: { x: number; y: number };
    channel: { left: number; right: number };
    duration: number;
    opacity: number;
  } | null;

  const at = (page: Page, ms: number): Promise<Instant> =>
    page.evaluate(async (t) => {
      const el = document.querySelector('[data-testid="dashboard-flight"]')!;
      const anims = el.getAnimations() as CSSAnimation[];
      const flight = anims.find((a) => /cargo-flight/.test(a.animationName));
      if (!flight) return null;
      for (const a of anims) {
        a.pause();
        a.currentTime = t;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rect = (id: string) =>
        document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      const lane = rect('dashboard-flight-lane');
      const channel = rect('dashboard-channel');
      const box = el.getBoundingClientRect();
      return {
        left: box.left - lane.left,
        right: lane.right - box.right,
        top: box.top - lane.top,
        bottom: lane.bottom - box.bottom,
        centre: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
        channel: { left: channel.left, right: channel.right },
        duration: Number(flight.effect!.getComputedTiming().duration),
        opacity: Number(getComputedStyle(el).opacity),
      };
    }, ms);

  test('the message crosses the channel, lands at the receiver and dissolves', async ({ page }) => {
    await open(page, 'dashboard-preview-application');
    await expect(page.getByTestId('dashboard-flight')).toHaveAttribute('data-direction', 'rtl');

    const before = await at(page, 0);
    expect(before, 'the cargo is not animated').not.toBeNull();
    expect(before!.duration).toBe(960);
    // Not there yet: it fades in rather than popping.
    expect(before!.opacity).toBeLessThanOrEqual(0.05);

    // Faded in and still at the sender's edge — rtl, so flush right, her side …
    const start = await at(page, 105);
    expect(start!.opacity).toBeGreaterThanOrEqual(0.95);
    expect(Math.abs(start!.right)).toBeLessThanOrEqual(1);

    // … its centre inside the channel halfway …
    const mid = await at(page, 350);
    expect(mid!.centre.x).toBeGreaterThan(mid!.channel.left);
    expect(mid!.centre.x).toBeLessThan(mid!.channel.right);

    // … landed flush left, inside the brand's edge, still whole …
    const end = await at(page, 700);
    expect(Math.abs(end!.left)).toBeLessThanOrEqual(1);
    expect(end!.opacity).toBeGreaterThanOrEqual(0.95);

    // … and gone: the receiver's tile has it now.
    const gone = await at(page, 960);
    expect(gone!.opacity, 'the cargo is left lying on the pane').toBeLessThanOrEqual(0.02);
  });

  test('below lg the panes stack and the message goes up, inside the stage', async ({ page }) => {
    await open(page, 'dashboard-preview-application', 1024);
    const lane = await page.getByTestId('dashboard-flight-lane').boundingBox();
    const stage = await page.locator(STAGE).boundingBox();
    // The lane stands on end inside the stage. Poking out sideways is what
    // gives a phone a horizontal scroll.
    expect(lane!.x).toBeGreaterThanOrEqual(stage!.x);
    expect(lane!.x + lane!.width).toBeLessThanOrEqual(stage!.x + stage!.width);

    // rtl: from her pane, which is now below — so from the lane's bottom …
    const start = await at(page, 105);
    expect(start, 'the cargo is not animated').not.toBeNull();
    expect(Math.abs(start!.bottom)).toBeLessThanOrEqual(1);
    expect(start!.centre.x).toBeGreaterThan(start!.channel.left);
    expect(start!.centre.x).toBeLessThan(start!.channel.right);
    // … straight up to its top, by the brand.
    const end = await at(page, 700);
    expect(Math.abs(end!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(end!.centre.x - start!.centre.x)).toBeLessThanOrEqual(1);
  });

  test('under reduced motion nothing flies and the receiver just updates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'dashboard-preview-application');
    await expect(page.getByTestId('dashboard-flight-lane')).toBeHidden();
    // Nothing in the section may run forever, and nothing may still be
    // waiting on a flight that never happens.
    const running = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-testid="landing-dashboard-preview"] *')]
          .map((el) => getComputedStyle(el))
          .filter((cs) => cs.animationName !== 'none' && cs.animationIterationCount === 'infinite')
          .length,
    );
    expect(running).toBe(0);
    await expect(page.getByTestId('dashboard-brand-influencer_application')).toBeVisible();
  });

  test('the whole section fits a laptop: heading top to stage bottom', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/__sandbox/landing');
    await page.waitForLoadState('networkidle');
    const geo = await page.evaluate(() => {
      const section = document.querySelector('[data-testid="landing-dashboard-preview"]')!;
      const heading = section.querySelector('h2')!.getBoundingClientRect();
      const stage = section
        .querySelector('[data-testid="dashboard-stage"]')!
        .getBoundingClientRect();
      return { span: Math.round(stage.bottom - heading.top), stage: Math.round(stage.height) };
    });
    // 768 minus the 64 px sticky toolbar leaves 704 visible; 8 px of slack.
    expect(geo.span, 'the presentation is taller than a laptop screen').toBeLessThanOrEqual(696);
    // The overview is the same stage as the story — same height, not content-sized.
    expect(geo.stage, 'the overview stage is not the fixed height').toBe(480);
  });
  /**
   * The overview's stepper is a legend, not a stepper: seven identical checks
   * told a visitor nothing. Each pill now carries the step's glyph and short
   * name, and the row has to hold all seven on one line at lg and wrap, not
   * cut, on a phone.
   */
  test('the overview legend names every step and fits the bar', async ({ page }) => {
    for (const width of [1440, 1280, 412]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/__sandbox/landing');
      await page.waitForLoadState('networkidle');
      const bar = page.getByTestId('dashboard-progress-steps');
      await expect(bar).toHaveCSS('display', 'flex');
      await expect(bar.getByTestId('dashboard-legend-step')).toHaveCount(7);
      const geo = await bar.evaluate((ol) => {
        const pills = [
          ...ol.querySelectorAll('[data-testid="dashboard-legend-step"]'),
        ] as HTMLElement[];
        const label = (p: HTMLElement) => p.querySelector('span')!;
        return {
          rows: new Set(pills.map((p) => Math.round(p.getBoundingClientRect().top))).size,
          cut: pills.filter((p) => label(p).scrollWidth > label(p).clientWidth + 1).length,
          names: pills.map((p) => label(p).textContent!.trim()),
          titled: pills.every((p) => (p.getAttribute('title') ?? '').length > 0),
          right: Math.round(ol.getBoundingClientRect().right),
          viewport: window.innerWidth,
        };
      });
      expect(geo.cut, `at ${width}: a short name is cut off`).toBe(0);
      expect(new Set(geo.names).size, `at ${width}: names repeat`).toBe(7);
      expect(geo.titled, `at ${width}: a pill has no tooltip`).toBe(true);
      expect(geo.right, `at ${width}: the legend leaves the viewport`).toBeLessThanOrEqual(
        geo.viewport,
      );
      if (width >= 1280) expect(geo.rows, `at ${width}: the legend wrapped`).toBe(1);
    }
  });
});
