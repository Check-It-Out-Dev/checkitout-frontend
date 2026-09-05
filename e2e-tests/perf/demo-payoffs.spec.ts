import { expect, test } from '@playwright/test';
import { SCENARIOS, type ScenarioStep } from '../../src/app/core/demo/scenario-registry';
import { TOURS, open, press, ready, turned } from './walk';

/**
 * E-BLINK — a beat's payoff must survive long enough to be seen.
 *
 * The class the reviewed round of 2026-09-06 produced, six times over. Every
 * instance is the same shape: one press does several things, so the screen that
 * proves the beat happened exists for about a tenth of a second and is gone.
 *
 *   the threaded admin reply      101 ms   (F148)
 *   the deletion receipt           91 ms   (F149)
 *   the published campaign page    18 ms   (F156)
 *   the checkout hand-off         101 ms   (F132, earlier)
 *   the ticket reference           56 ms   (F161)
 *   the cascade preview           112 ms   (F133, earlier)
 *
 * Each of those was found by a person reading frames of the one tour they were
 * given, and each was fixed where it was found. That is not a closed class. This
 * is the sweep: every step of every tour, including the ones no film reaches.
 *
 * The rule, stated once. A step says how the application confirms it — `done`.
 * When that confirmation is something on SCREEN (`appears`, or landing on a
 * route), the thing it names is the evidence the beat happened, and it has to
 * stay put long enough to be read. So: from the instant a step's evidence first
 * holds to the instant it stops holding — the element goes, or the tour
 * navigates away — must be at least PAYOFF_MS.
 *
 * What is deliberately not swept: `storage` conditions, which have nothing on
 * screen to see, and `disappears` conditions, whose evidence is an absence. Both
 * are named in `EXEMPT` with the reason, so the exemption is a decision on the
 * record rather than a silence.
 */

const PAYOFF_MS = 1200;

/** Steps whose confirmation is not a thing anyone can look at. */
const EXEMPT = new Map<string, string>([
  ['nip-to-ksef/upgrade-confirm', 'confirmed by the stored plan across a full page reload'],
  [
    'company-campaign/create-campaign',
    'confirmed by the submit going live, which the next beat rings',
  ],
  ['nip-to-ksef/upgrade-terms', 'confirmed by the checkbox it rings being ticked'],
]);

interface Sample {
  t: number;
  step: number | undefined;
  path: string;
  seen: Record<string, boolean>;
}

/** Every `appears` selector the tour declares, so one sampler covers them all. */
function watched(tour: string): string[] {
  const steps = SCENARIOS.find((s) => s.key === tour)?.steps ?? [];
  return [...new Set(steps.map((s) => s.done?.appears).filter((s): s is string => !!s))];
}

/** What each step's evidence is, and how to read it out of a sample. */
function evidenceOf(step: ScenarioStep): ((s: Sample) => boolean) | null {
  const appears = step.done?.appears;
  if (appears) return (s) => s.seen[appears] === true;
  const route = step.done?.route;
  if (route) {
    const re = new RegExp(route);
    return (s) => re.test(s.path);
  }
  return null;
}

test.describe("Every beat's payoff outlives the press that made it", () => {
  for (const tour of TOURS) {
    test(`${tour}: nothing the tour proves is taken away too soon`, async ({ page }) => {
      test.setTimeout(300_000);

      await page.addInitScript((ids: string[]) => {
        const w = window as unknown as Record<string, unknown>;
        const rows: Sample[] = [];
        w['__payoff'] = rows;
        const tick = (): void => {
          requestAnimationFrame(tick);
          const seen: Record<string, boolean> = {};
          for (const id of ids) seen[id] = !!document.querySelector(id);
          const state = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
            step?: number;
          };
          rows.push({
            t: performance.timeOrigin + performance.now(),
            step: state.step,
            path: location.pathname,
            seen,
          });
        };
        requestAnimationFrame(tick);
      }, watched(tour));

      await open(page, tour);
      await ready(page);

      // Walk it the way a visitor pressing the pill would, keeping every sample.
      const kept: Sample[] = [];
      const drain = async (): Promise<void> => {
        const rows = await page
          .evaluate(() => {
            const w = window as unknown as Record<string, unknown>;
            const a = (w['__payoff'] as Sample[] | undefined) ?? [];
            const taken = a.slice();
            a.length = 0;
            return taken;
          })
          .catch(() => [] as Sample[]);
        kept.push(...rows);
      };

      let at = await ready(page);
      for (let i = 0; i < 16 && !at.done; i++) {
        const from = at.step;
        // The beat has to be given the time a reader would take, or the
        // measurement below is of the walker's impatience (T29).
        await page.waitForTimeout(1600);
        await drain();
        await press(page);
        at = await turned(page, from);
        await drain();
        if (at.step === from && !at.done) break;
      }
      await page.waitForTimeout(2000);
      await drain();

      const steps = SCENARIOS.find((s) => s.key === tour)?.steps ?? [];
      const verdicts: string[] = [];

      for (const [i, step] of steps.entries()) {
        const reads = evidenceOf(step);
        const key = `${tour}/${step.id}`;
        if (!reads) {
          verdicts.push(
            `${step.id}: nothing on screen to hold (${step.done ? 'storage or absence' : 'no done'})`,
          );
          continue;
        }
        if (EXEMPT.has(key)) {
          verdicts.push(`${step.id}: exempt — ${String(EXEMPT.get(key))}`);
          continue;
        }
        // From the first sample in which the evidence holds, to the last
        // CONSECUTIVE one. A later re-appearance is a different screen.
        const from = kept.findIndex((s) => s.step === i && reads(s));
        if (from < 0) {
          verdicts.push(`${step.id}: its evidence never held — the walk did not reach it`);
          continue;
        }
        let to = from;
        while (to + 1 < kept.length && reads(kept[to + 1])) to += 1;
        const lived = Math.round(kept[to].t - kept[from].t);
        verdicts.push(`${step.id}: ${String(lived)} ms`);
        // The last beat of a tour is exempt by construction: nothing follows it
        // to take its payoff away, and the walk stops.
        if (i === steps.length - 1) continue;
        expect(
          lived,
          `${key}: the screen that proves this beat happened was on for ${String(lived)} ms — ` +
            `a person needs ${String(PAYOFF_MS)}. One press is doing more than one thing.`,
        ).toBeGreaterThanOrEqual(PAYOFF_MS);
      }

      // eslint-disable-next-line no-console -- the coverage is the deliverable
      console.log(`  ${tour}: ${verdicts.join(' · ')}`);
      const measured = verdicts.filter((v) => /\d+ ms$/.test(v)).length;
      expect(
        measured,
        `${tour}: no beat's payoff was measured, so nothing was proven`,
      ).toBeGreaterThan(0);
    });
  }

  /**
   * The planted defect. Nothing found is worth nothing until the instrument has
   * been shown to find something (methodology §13).
   *
   * The rule this sweep applies is a pure function of the samples, so the fault
   * is planted in the samples: a beat whose evidence holds for one frame and is
   * then taken away is exactly what every instance of this class looked like.
   */
  test('the rule catches evidence that is taken away after one frame', () => {
    const holds = (s: Sample): boolean => s.seen['#proof'] === true;
    const lifetime = (rows: Sample[]): number => {
      const from = rows.findIndex((r) => r.step === 0 && holds(r));
      if (from < 0) return -1;
      let to = from;
      while (to + 1 < rows.length && holds(rows[to + 1])) to += 1;
      return Math.round(rows[to].t - rows[from].t);
    };
    const frame = (t: number, proof: boolean): Sample => ({
      t,
      step: 0,
      path: '/x',
      seen: { '#proof': proof },
    });

    // The defect: confirmed, and gone by the next frame.
    const blinked = [frame(0, false), frame(50, true), frame(100, false), frame(150, false)];
    expect(lifetime(blinked)).toBe(0);
    expect(lifetime(blinked)).toBeLessThan(PAYOFF_MS);

    // The fix: the same beat, holding.
    const held = [
      frame(0, false),
      ...Array.from({ length: 40 }, (_, i) => frame(50 + i * 50, true)),
    ];
    expect(lifetime(held)).toBeGreaterThanOrEqual(PAYOFF_MS);

    // And a beat the walk never reached must not read as a pass.
    expect(lifetime([frame(0, false), frame(50, false)])).toBe(-1);
  });
});
