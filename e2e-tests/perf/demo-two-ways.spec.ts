import { expect, test, type Page } from '@playwright/test';
import { TOURS, open, press, ready, turned } from './walk';

/**
 * E-TWOWAYS, swept across every tour: a step can be done two ways, and both
 * have to end up in the same place.
 *
 * Every beat can be completed by pressing the guide's pill — which runs the
 * step's recipe — or by the visitor simply doing the thing the ring is pointing
 * at, which the director notices through a watcher instead. Two code paths, one
 * promise.
 *
 * They had already come apart once. `cascade-delete` waits for a dialog its own
 * recipe opens to go away, and asked bluntly that is true before anything has
 * happened; the watcher path gated the question on having seen the dialog
 * first, and the pill path asked it raw. So the same step, done the two ways,
 * disagreed about whether it had happened — and only one of them was right.
 * That was F131, found by fault injection. This asks the question directly, of
 * every step, with no fault injected at all.
 *
 * The two ways are not interchangeable by construction: a recipe can be eight
 * actions long — the campaign form types a whole brief — and clicking the one
 * control the ring is around cannot stand in for that. So where a hand click
 * does not complete the beat, the guide finishes it and the walk carries on,
 * and that step is reported as one the visitor cannot drive alone. Stopping
 * there instead would have measured one step per tour and called it a sweep.
 *
 * Run: `npm run test:perf -- e2e-tests/perf/demo-two-ways.spec.ts`
 */

type Way = 'pill' | 'hand';

interface Walk {
  /** Where each action left the tour, as `step@route`. */
  trace: string[];
  /** Steps a single click on the ring's control was enough to complete. */
  alone: number[];
  /** Steps where the guide had to finish what the hand click started. */
  guided: number[];
  /** Steps whose ring sits on something you type into, not something you press. */
  typed: number[];
}

/**
 * Walk one tour, doing each beat the given way.
 *
 * `pill` presses the guide's own control, which runs the step's recipe. `hand`
 * clicks the thing the ring is pointing at, exactly as a visitor who ignores
 * the guide would, and falls back to the pill when that was not the whole
 * action — or when there is nothing to click, which a "look at this screen"
 * beat has by design.
 */
async function walk(page: Page, tour: string, way: Way): Promise<Walk> {
  await open(page, tour);

  const trace: string[] = [];
  const alone: number[] = [];
  const guided: number[] = [];
  const typed: number[] = [];
  let now = await ready(page);
  trace.push(`${String(now.step)}@${now.path}`);

  for (let i = 0; i < 16 && !now.done; i++) {
    const from = now.step;
    const target = now.ring;

    if (way === 'hand' && target !== null) {
      // Clicking an input cannot complete a step, so a beat whose ring sits on
      // a form field is not a beat a hand click was ever going to finish.
      // Counting it as one made `stepup-email` — three form beats — look like a
      // tour nothing could be compared on.
      const actuable = await page
        .evaluate((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) return false;
          const tag = el.tagName.toLowerCase();
          return (
            tag === 'button' ||
            tag === 'a' ||
            el.getAttribute('role') === 'button' ||
            !!el.querySelector('button, a, [role="button"]')
          );
        }, target)
        .catch(() => false);
      if (!actuable) {
        typed.push(from!);
        await press(page);
        now = await turned(page, from);
        if (now.step === from && !now.done) {
          trace.push(`stuck at ${String(from)}`);
          break;
        }
        trace.push(`${String(now.step)}@${now.path}`);
        continue;
      }
      await page
        .evaluate(
          (id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.click(),
          target,
        )
        .catch(() => undefined);
      now = await turned(page, from);
      if (now.step !== from || now.done) {
        alone.push(from!);
        trace.push(`${String(now.step)}@${now.path}`);
        continue;
      }
      guided.push(from!);
    }

    await press(page);
    now = await turned(page, from);
    if (now.step === from && !now.done) {
      trace.push(`stuck at ${String(from)}`);
      break;
    }
    trace.push(`${String(now.step)}@${now.path}`);
  }
  if (now.done) trace.push('done');
  return { trace, alone, guided, typed };
}

test.describe('Both ways through a step agree', () => {
  /** Every step a hand click actually completed, across all seven tours. */
  const compared: string[] = [];
  const walked = new Set<string>();

  for (const tour of TOURS) {
    test(`${tour}: doing it by hand lands where the pill lands`, async ({ page }) => {
      test.setTimeout(300_000);

      const pill = await walk(page, tour, 'pill');
      const hand = await walk(page, tour, 'hand');

      // eslint-disable-next-line no-console -- the two traces are the deliverable
      console.log(
        `  ${tour}
    pill: ${pill.trace.join(' → ')}` +
          `
    hand: ${hand.trace.join(' → ')}` +
          `
    a visitor can do steps [${hand.alone.join(', ')}] unaided; ` +
          `the guide finishes [${hand.guided.join(', ')}]; ` +
          `[${hand.typed.join(', ')}] ring a field you type into`,
      );

      expect(pill.trace.at(-1), `${tour}: the guided walk did not reach the recap`).toBe('done');
      expect(hand.trace.at(-1), `${tour}: the hand walk did not reach the recap`).toBe('done');
      expect(
        hand.trace,
        `${tour}: doing the steps by hand went somewhere the pill did not`,
      ).toEqual(pill.trace);
      walked.add(tour);
      compared.push(...hand.alone.map((n) => `${tour}:${String(n)}`));
    });
  }

  // Per tour, zero is a legitimate answer — `stepup-email` is three form beats
  // and none of them is a thing you press. Across the sweep it is not: if no
  // step anywhere could be done by hand, the two paths were never compared and
  // seven green tests would mean nothing.
  test.afterAll(() => {
    // eslint-disable-next-line no-console -- the coverage is the deliverable
    console.log(`
  compared ${compared.length} steps done both ways: ${compared.join(', ')}
`);
    // Guarded on the whole sweep having run, so filming or debugging a single
    // tour does not fail on a coverage rule it was never meant to satisfy.
    if (walked.size === TOURS.length && compared.length === 0) {
      throw new Error(
        'no step in any tour could be completed by hand, so the two paths were never compared',
      );
    }
  });
});
