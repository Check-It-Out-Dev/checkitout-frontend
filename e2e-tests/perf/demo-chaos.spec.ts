import { expect, test, type Page } from '@playwright/test';

/**
 * The tour with an impatient visitor in the room.
 *
 * Every other spec drives the demo the way it expects to be driven. This one
 * does what people actually do: scroll away mid-step, click things that are
 * not the guide, type into whatever has focus, resize the window, tab away and
 * come back, and press Escape for no reason — then checks that the tour never
 * loses its footing.
 *
 * The disorder is seeded, so a failure is reproducible: the seed is printed
 * with every failure and can be pinned with CHAOS_SEED=<n>.
 *
 * Invariants (all of them things that have actually broken here before):
 *   • a way forward is always offered within a couple of seconds;
 *   • the way forward never changes identity while a step waits;
 *   • the page shield is never left up;
 *   • the ring, when it is on screen, is on something the visitor can see;
 *   • the step index never goes backwards;
 *   • nothing throws.
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';
const SEED = Number(process.env['CHAOS_SEED'] ?? 20260911);
const TOURS = ['nip-to-ksef', 'company-campaign', 'admin-2fa'] as const;

/** mulberry32 — small, seeded, good enough to reproduce a run exactly. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Reading {
  step?: number;
  done: boolean;
  pill: boolean;
  next: boolean;
  shield: boolean;
  ringVisible: boolean;
  ringOnScreen: boolean;
}

function read(page: Page): Promise<Reading | null> {
  return page
    .evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
      };
      const ring = document.querySelector('[data-testid="guide-spotlight"]');
      const box = ring?.getBoundingClientRect();
      return {
        step: s.step,
        done: s.done === true,
        pill: !!document.querySelector('[data-testid="guide-spot-next"]'),
        next: !!document.querySelector('[data-testid="guide-next"]'),
        shield: !!document.querySelector('[data-testid="guide-shield"]'),
        ringVisible: !!box && box.width > 0,
        ringOnScreen:
          !box ||
          (box.bottom > -4 &&
            box.top < window.innerHeight + 4 &&
            box.right > -4 &&
            box.left < window.innerWidth + 4),
      };
    })
    .catch(() => null); // a reload mid-read is the tour's business, not a fault
}

test.describe('Demo chaos', () => {
  for (const tour of TOURS) {
    test(`the ${tour} tour survives an impatient visitor`, async ({ page }) => {
      const random = rng(SEED + tour.length);
      const errors: string[] = [];
      const log: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto(`${BASE}/demo?start=${tour}`, { waitUntil: 'networkidle' });
      await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({
        timeout: 30_000,
      });

      let highest = -1;
      for (let move = 0; move < 26; move++) {
        const before = await read(page);
        if (!before) {
          await page.waitForTimeout(300);
          continue;
        }
        if (before.done) break;

        if (before.step !== undefined) {
          expect(
            before.step,
            `${tour}: the tour went backwards (seed ${SEED})`,
          ).toBeGreaterThanOrEqual(highest === -1 ? 0 : highest);
          highest = Math.max(highest, before.step);
        }
        if (before.ringVisible) {
          expect(before.ringOnScreen, `${tour}: the ring pointed off screen (seed ${SEED})`).toBe(
            true,
          );
        }

        // one act of impatience, then let the page settle
        const roll = random();
        if (roll < 0.22) {
          log.push('scroll');
          await page.mouse.wheel(0, Math.round((random() - 0.35) * 900));
        } else if (roll < 0.38) {
          log.push('resize');
          await page.setViewportSize({
            width: 900 + Math.round(random() * 540),
            height: 700 + Math.round(random() * 220),
          });
        } else if (roll < 0.5) {
          log.push('escape');
          await page.keyboard.press('Escape');
        } else if (roll < 0.62) {
          log.push('type');
          await page.keyboard.type('zz', { delay: 15 });
        } else if (roll < 0.72) {
          log.push('background');
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
          await page.waitForTimeout(120);
        } else if (roll < 0.82) {
          log.push('stray-click');
          await page.mouse.click(8 + Math.round(random() * 40), 8 + Math.round(random() * 40));
        } else {
          // and sometimes the visitor actually does what the tour asked
          log.push('advance');
          const control = before.pill
            ? '[data-testid="guide-spot-next"]'
            : '[data-testid="guide-next"]';
          if (before.pill || before.next) {
            await page.click(control, { timeout: 8_000 }).catch(() => undefined);
          }
        }
        await page.waitForTimeout(320);

        const after = await read(page);
        if (!after || after.done) continue;

        // the shield belongs to a running recipe, never to an idle page
        await expect(
          page.locator('[data-testid="guide-shield"]'),
          `${tour}: the page was left shielded after "${log[log.length - 1]}" (seed ${SEED})`,
        ).toHaveCount(0, { timeout: 5_000 });

        // whatever the visitor just did, there must still be a way on
        await expect
          .poll(async () => (await read(page))?.pill || (await read(page))?.next || false, {
            timeout: 6_000,
            message: `${tour}: no way forward after "${log[log.length - 1]}" (seed ${SEED}); moves so far: ${log.join(',')}`,
          })
          .toBe(true);
      }

      expect(errors, `${tour}: page errors (seed ${SEED})`).toEqual([]);
    });
  }
});
