import { expect, test, type Page } from '@playwright/test';
import { BASE } from './walk';

/**
 * The knowledge-graph map on /technical-survey/engineering, measured.
 *
 * The map is two layers: a base SVG painted once and never mutated, and an
 * overlay of flat fills that carries the hover and pin state; the pointer is
 * resolved by geometry in one listener outside Angular's zone. These numbers
 * are what that buys, at the owner's kind of screen (1920 × 1080, DPR 1.5):
 * an idle map that costs nothing, a sweep of the pointer around the whole
 * ring that never drops a frame, and zero mutations in the base layer while
 * it happens. The first version animated a halo inside the SVG (a repaint
 * every frame, forever) and flipped classes on ~830 nodes per hover.
 */
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 });

async function arm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const frames: number[] = [];
    const longTasks: number[] = [];
    let muts = 0;
    let last = performance.now();
    const tick = (): void => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      w['__raf'] = requestAnimationFrame(tick);
    };
    w['__raf'] = requestAnimationFrame(tick);
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push(e.duration);
      }).observe({ type: 'longtask' });
    } catch {
      /* not in every browser */
    }
    const base = document.querySelector('[data-testid="graphtopo-svg"]');
    const mo = new MutationObserver((ms) => (muts += ms.length));
    if (base) mo.observe(base, { attributes: true, childList: true, subtree: true });
    w['__frames'] = frames;
    w['__long'] = longTasks;
    w['__muts'] = () => muts;
    w['__mo'] = mo;
  });
}
async function read(
  page: Page,
): Promise<{ worst: number; mean: number; slow: number; long: number[]; n: number; muts: number }> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    cancelAnimationFrame(w['__raf'] as number);
    (w['__mo'] as MutationObserver).disconnect();
    const frames = (w['__frames'] as number[]).slice(3);
    return {
      worst: Math.round(Math.max(...frames)),
      mean: Math.round((frames.reduce((a, b) => a + b, 0) / frames.length) * 10) / 10,
      slow: frames.filter((f) => f > 33).length,
      long: w['__long'] as number[],
      n: frames.length,
      muts: (w['__muts'] as () => number)(),
    };
  });
}
async function openMap(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await page.goto(`${BASE}/technical-survey/engineering`, { waitUntil: 'networkidle' });
  const svg = page.locator('[data-testid="graphtopo-svg"]');
  await svg.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await svg.boundingBox();
  if (!box) throw new Error('the map is not on screen');
  return box;
}

test.describe('Survey graph map', () => {
  test('idle, the map costs nothing: no frame over 20 ms in two seconds', async ({ page }) => {
    await openMap(page);
    await page.mouse.move(5, 5);
    await arm(page);
    await page.waitForTimeout(2000);
    const seen = await read(page);
    console.log(`  idle: ${seen.n} frames, mean ${seen.mean} ms, worst ${seen.worst} ms`);
    expect(seen.worst, 'worst idle frame').toBeLessThanOrEqual(20);
    expect(seen.muts, 'base mutations while idle').toBe(0);
  });

  test('a pointer sweep around the whole ring never drops a frame and never touches the base', async ({
    page,
  }) => {
    const box = await openMap(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const k = box.width / 760;
    await arm(page);
    // the leaf ring, then the arcs: 600 real pointer positions, 1.2° apart
    for (const r of [231, 143]) {
      for (let deg = 0; deg < 360; deg += 1.2) {
        const a = ((deg - 90) * Math.PI) / 180;
        await page.mouse.move(cx + r * k * Math.cos(a), cy + r * k * Math.sin(a));
      }
    }
    // pins re-render the inspector; the base must stay untouched by those too
    for (const key of ['billing', 'cicd', 'legal-consent', 'observability', 'geo-security']) {
      await page.locator(`.gt-arc[data-domain="${key}"] .gt-arc-fill`).click();
      await page.waitForTimeout(60);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const seen = await read(page);
    console.log(
      `  sweep: ${seen.n} frames, mean ${seen.mean} ms, worst ${seen.worst} ms, ${seen.slow} over 33 ms, long tasks ${JSON.stringify(seen.long.map(Math.round))}, base mutations ${seen.muts}`,
    );
    expect(seen.slow, `frames over 33 ms (worst ${seen.worst} ms)`).toBe(0);
    expect(
      seen.long.filter((d) => d > 50),
      'long tasks over 50 ms during the sweep',
    ).toEqual([]);
    // the aria-pressed flag on a pinned arc is the one attribute the base may carry
    expect(seen.muts, 'mutations inside the base layer').toBeLessThanOrEqual(12);
  });

  test('the inspector answers a hover within a frame or two', async ({ page }) => {
    await openMap(page);
    const t0 = await page.evaluate(() => performance.now());
    await page.locator('.gt-arc[data-domain="billing"] .gt-arc-fill').hover();
    await page
      .locator('[data-testid="graphtopo-inspector"]:visible')
      .first()
      .locator('[data-testid="graphtopo-inspector-name"]')
      .filter({ hasText: 'Billing Saga' })
      .waitFor();
    const t1 = await page.evaluate(() => performance.now());
    console.log(`  hover → inspector: ${Math.round(t1 - t0)} ms (includes the driver round-trips)`);
    expect(t1 - t0).toBeLessThan(250);
  });
});
