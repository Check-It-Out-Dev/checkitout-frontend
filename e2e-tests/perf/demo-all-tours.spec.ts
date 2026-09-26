import { expect, test, type Page } from '@playwright/test';

/**
 * All seven tours, back to back, in one browser — the way a visitor meets them
 * when they press "Next sandbox" at the end of each.
 *
 * Every other spec starts from a clean context, which is the one situation
 * that never happens to a real visitor and the one situation in which this
 * sandbox's worst bugs are invisible. Played in sequence, a finished run used
 * to hand the next one its leftovers: a stored plan that made the checkout
 * beat skip itself, and a TOTP counter that made the admin's *first* code work
 * — signing them in immediately and leaving the tour asking for a code from
 * inside the application it had just let them into, sometimes with nothing
 * pressed at all.
 *
 * So this asserts two things per tour, and they are the whole point:
 *
 *   • it begins pristine — step 0, and no `demo…` key left by anyone else;
 *   • it reaches its own recap.
 *
 * And once, at the end: the visitor's own settings are untouched. The sweep
 * that keeps the tours honest must not reach into the language they chose, the
 * theme, the consent record or a banner they dismissed.
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';

/** In the order the hub offers them. */
const TOURS = [
  'admin-2fa',
  'stepup-email',
  'company-campaign',
  'influencer-collab',
  'nip-to-ksef',
  'support-ticket',
  'admin-ops',
] as const;

/** Keys the director is entitled to carry across a start(). */
const PERSONA = ['demoRole', 'demoSession', 'demoSandbox'];

interface Probe {
  step: number | undefined;
  done: boolean;
  way: 'pill' | 'next' | 'none';
  /** `demo…` keys that are neither the persona nor the tour's own position. */
  leftovers: string[];
}

async function probe(page: Page): Promise<Probe> {
  return (
    page
      .evaluate((persona) => {
        const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
          step?: number;
          done?: boolean;
        };
        const leftovers: string[] = [];
        for (const store of [sessionStorage, localStorage]) {
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (k && k.startsWith('demo') && !persona.includes(k)) leftovers.push(k);
          }
        }
        return {
          step: s.step,
          done: s.done === true,
          way: document.querySelector('[data-testid="guide-spot-next"]')
            ? ('pill' as const)
            : document.querySelector('[data-testid="guide-next"]')
              ? ('next' as const)
              : ('none' as const),
          leftovers: leftovers.sort(),
        };
      }, PERSONA)
      // the checkout beat replaces the document mid-read; that is the tour
      // working, and the caller's wait loop handles it
      .catch(() => ({ step: undefined, done: false, way: 'none' as const, leftovers: [] }))
  );
}

async function press(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const b =
        document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
        document.querySelector<HTMLElement>('[data-testid="guide-next"]');
      b?.click();
    })
    .catch(() => undefined);
}

test.describe('The whole sandbox', () => {
  test('seven tours in a row, each starting pristine and reaching its recap', async ({ page }) => {
    test.setTimeout(360_000);

    await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
    // things the visitor owns, set before any tour runs
    await page.evaluate(() => {
      localStorage.setItem('cio-lang', 'pl');
      localStorage.setItem('cio.theme', 'light');
      localStorage.setItem('cio.consent.v1', '{"analytics":false}');
      localStorage.setItem('cio.shell.trialOfferDismissed', '1');
    });

    const reached: Record<string, number> = {};

    for (const tour of TOURS) {
      await page.goto(`${BASE}/demo?start=${tour}`, { waitUntil: 'networkidle' });
      await expect(
        page.locator('[data-testid="guide-spot-next"], [data-testid="guide-next"]').first(),
        `${tour}: the tour never offered a way to begin`,
      ).toBeVisible({ timeout: 30_000 });

      const start = await probe(page);
      expect(start.step, `${tour}: did not begin at its first step`).toBe(0);
      expect(
        start.leftovers,
        `${tour}: began holding another run's state — ${start.leftovers.join(', ')}`,
      ).toEqual([]);

      // walk it to the recap; twelve presses is more than the longest tour needs
      let last = start;
      for (let i = 0; i < 12 && !last.done; i++) {
        await press(page);
        await page.waitForTimeout(2600); // recipes, a world sim, and one reload
        last = await probe(page);
        // a reload leaves one unreadable frame; give it a second chance
        if (last.step === undefined) {
          await page.waitForTimeout(1500);
          last = await probe(page);
        }
      }

      expect(last.done, `${tour}: never reached its recap (stopped at step ${last.step})`).toBe(
        true,
      );
      reached[tour] = last.step ?? -1;
    }

    // eslint-disable-next-line no-console -- the walk is the deliverable
    console.log(`\n  seven tours completed: ${JSON.stringify(reached)}\n`);

    const kept = await page.evaluate(() => ({
      lang: localStorage.getItem('cio-lang'),
      theme: localStorage.getItem('cio.theme'),
      consent: localStorage.getItem('cio.consent.v1'),
      banner: localStorage.getItem('cio.shell.trialOfferDismissed'),
    }));
    expect(kept, 'seven tours must not touch what the visitor chose').toEqual({
      lang: 'pl',
      theme: 'light',
      consent: '{"analytics":false}',
      banner: '1',
    });
  });
});
