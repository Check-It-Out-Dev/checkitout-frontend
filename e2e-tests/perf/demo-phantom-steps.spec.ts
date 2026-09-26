import { expect, test, type Page } from '@playwright/test';
import { scenarioByKey } from '../../src/app/core/demo/scenario-registry';
import { installRingRule } from './walk';

/**
 * E-PHANTOM, swept across every tour: does any step walk on and narrate an
 * outcome that did not happen?
 *
 * Three steps did. Their simulators' buttons were the only thing that could
 * confirm them, and the director advanced regardless once its wait expired —
 * so taking `ksef-sim-done` away and pressing once completed the entire tour
 * and showed the recap, for a KSeF registration that never took place. That was
 * found by hand, in one tour. A class found by accident in one place is a class
 * worth looking for everywhere.
 *
 * The fault injected is **the click that silently does nothing** — the real
 * shape of this failure, and the only one that is uniform across every step.
 * `HTMLElement.prototype.click` is swallowed for the duration of one press,
 * except on the guide's own controls, so the visitor's press still lands and
 * the recipe it triggers reaches for a page that will not respond. It is one
 * line to undo.
 *
 * Hiding the target was tried first and measured the wrong thing twice: taking
 * the ring's element away also takes the pill away, so the press hit nothing
 * and the test proved only that pressing nothing does nothing; and a renamed
 * testid still matches a prefix selector, so `company-campaign` — which finds
 * its applicant by `[data-testid^="applicant-accept-"]` — carried on regardless.
 *
 * Each ringed step must then do three things:
 *
 *   1. not advance — the step did not happen;
 *   2. say so — the retry line, rather than silence;
 *   3. advance on a second press once the control is back, so a condition we
 *      got wrong can never trap anyone.
 *
 * One test per tour, so a failure names the tour it belongs to.
 *
 * Run: `npm run test:perf -- e2e-tests/perf/demo-phantom-steps.spec.ts`
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';

const TOURS = [
  'admin-2fa',
  'stepup-email',
  'company-campaign',
  'influencer-collab',
  'nip-to-ksef',
  'support-ticket',
  'admin-ops',
] as const;

/**
 * The longest a recipe can take to give up. Every action whose element never
 * appears costs the runner its full four-second lookup, and a swallowed first
 * click means the elements the later actions want are never rendered — so
 * `change-email`, three clicks deep, needs about ten seconds before the wait
 * for its `done` even starts. Waiting a fixed 7.5 s asserted in the middle of
 * the recipe and read "still working" as "said nothing about why".
 */
const GIVE_UP_MS = 20_000;

interface Probe {
  step: number | undefined;
  done: boolean;
  way: 'pill' | 'next' | 'none';
  /** The `data-testid` of the element the ring is drawn around, if any. */
  ringTarget: string | null;
  retry: boolean;
  /** The guide is mid-recipe: a press now is dropped by design. */
  busy: boolean;
}

async function probe(page: Page): Promise<Probe> {
  return page
    .evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
      };
      // The ring sits 6 px outside its control, so the control is whichever
      // testid'd element matches that inset.
      //
      // "Its control" is not always the element carrying the testid. A step
      // names a field by its input, and the guide rings the outlined wrapper
      // around it — sixteen pixels higher. When that changed, this match stopped
      // resolving every field-ringed step and the sweep quietly went from five
      // fault injections on admin-2fa to three, still reporting green. Same rule
      // as the component, and the count is asserted below so the next silent
      // halving fails instead.
      let ringTarget: string | null = null;
      const ring = document.querySelector('[data-testid="guide-spotlight"]');
      const r = ring?.getBoundingClientRect();
      if (r && r.width > 0) {
        let best = Infinity;
        document.querySelectorAll('[data-testid]').forEach((el) => {
          // …and cut to what is showing, because the ring is: an admin ticket
          // row measures past the right edge of the card that holds it, so
          // matching the ring against the row's full width missed it entirely.
          // Both halves are `__drawnBox`, which is the tier's single copy of
          // the rule — this sweep used to carry the wrapper half itself.
          const drawn = (window as unknown as Record<string, (n: Element) => DOMRect>)[
            '__drawnBox'
          ];
          const b = drawn(el);
          if (b.width === 0 || b.height === 0) return;
          const d = Math.max(
            Math.abs(b.left - (r.left + 6)),
            Math.abs(b.top - (r.top + 6)),
            Math.abs(b.right - (r.right - 6)),
            Math.abs(b.bottom - (r.bottom - 6)),
          );
          if (d < best) {
            best = d;
            ringTarget = el.getAttribute('data-testid');
          }
        });
        if (best > 3) ringTarget = null;
      }
      return {
        step: s.step,
        done: s.done === true,
        way: document.querySelector('[data-testid="guide-spot-next"]')
          ? ('pill' as const)
          : document.querySelector('[data-testid="guide-next"]')
            ? ('next' as const)
            : ('none' as const),
        ringTarget,
        retry: !!document.querySelector('[data-testid="guide-retry"]'),
        busy: !!document.querySelector('[data-testid="guide-performing"]'),
      };
    })
    .catch(() => ({
      step: undefined,
      done: false,
      way: 'none' as const,
      ringTarget: null,
      retry: false,
      busy: false,
    }));
}

/** Press whichever control is offered, without waiting for it to hold still. */
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

/**
 * Make the page deaf to programmatic clicks, except the guide's own controls —
 * so the visitor's press still works and everything it then tries to do fails
 * silently, which is exactly what a broken step looks like from outside.
 */
async function deafen(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      if (w['__realClick']) return;
      const real = HTMLElement.prototype.click;
      w['__realClick'] = real;
      HTMLElement.prototype.click = function (this: HTMLElement) {
        const mine = this.closest(
          '[data-testid="guide-spot-next"], [data-testid="guide-next"], .guide-pop',
        );
        if (mine) real.call(this);
      };
    })
    .catch(() => undefined);
}

async function restore(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const real = w['__realClick'] as (() => void) | undefined;
      if (real) HTMLElement.prototype.click = real as HTMLElement['click'];
      delete w['__realClick'];
    })
    .catch(() => undefined);
}

/**
 * Poll until something conclusive happens, rather than guessing how long a
 * recipe takes. Returns the last reading either way, so a timeout still fails
 * on the assertion that matters instead of on the clock.
 */
async function settle(
  page: Page,
  before: number | undefined,
  conclusive: (p: Probe) => boolean,
): Promise<Probe & { sawBusy: boolean }> {
  const deadline = Date.now() + GIVE_UP_MS;
  let last = await probe(page);
  // Whether the press started anything at all. A deafened step still makes the
  // guide busy — the pill is the one control the injection leaves working, so
  // the recipe runs and only its own clicks fall through. A settle that never
  // saw `busy` is therefore a press that was dropped, not a step that ran and
  // said nothing, and those two look identical from the outside otherwise.
  let sawBusy = last.busy;
  while (Date.now() < deadline) {
    if (conclusive(last)) return { ...last, sawBusy };
    await page.waitForTimeout(250);
    last = await probe(page);
    sawBusy = sawBusy || last.busy;
  }
  return { ...last, sawBusy };
}

test.describe('No phantom steps', () => {
  for (const tour of TOURS) {
    test(`${tour}: no step advances without its action`, async ({ page }) => {
      test.setTimeout(300_000);

      await installRingRule(page);
      await page.goto(`${BASE}/demo?start=${tour}`, { waitUntil: 'networkidle' });
      await expect(
        page.locator('[data-testid="guide-spot-next"], [data-testid="guide-next"]').first(),
      ).toBeVisible({ timeout: 30_000 });

      const tested: string[] = [];
      let guard = 0;

      // Room for every beat plus a few wasted turns, taken from the tour
      // rather than from a constant: nip-to-ksef grew to nine beats today and
      // a fixed fourteen stopped it one short of its last ringed step.
      const room = (scenarioByKey(tour)?.steps.length ?? 8) * 2 + 4;
      for (let at = await probe(page); !at.done && guard < room; guard++, at = await probe(page)) {
        // A beat with no recipe has nothing to fail, so there is no phantom to
        // hunt. That used to be read off the ring — no ring, no recipe — and the
        // day a reading beat arrived with a ring pointing at the thing to read,
        // the sweep injected a fault into a step that has no action and reported
        // it for advancing anyway. It asks the registry now, which is where the
        // answer actually lives.
        const defined = scenarioByKey(tour)?.steps[at.step ?? -1];
        // The fault this sweep injects is a swallowed CLICK, so a beat whose
        // recipe only types has nothing for it to break: the campaign brief's
        // seven fills go in, the publish button comes alive, and the step is
        // confirmed by the application exactly as it should be. Injecting there
        // reports a phantom that is really the beat working.
        const clicks = (defined?.perform ?? []).some((p) => p.kind === 'click');
        // A beat that owes an injection gets waited for, not walked past: a
        // simulator card scales in over 300 ms and its pill arrives with it.
        // …and until the guide has finished with the beat before. A press that
        // lands while the director is still confirming the previous step is
        // dropped on the floor by design, and the sweep then reads a step that
        // held with nothing said about why — which is what it is hunting for.
        // Seen once in a loaded nineteen-minute run and never alone.
        for (let w = 0; w < 25 && clicks && (at.way !== 'pill' || at.busy); w++) {
          await page.waitForTimeout(200);
          at = await probe(page);
        }
        if (at.way !== 'pill' || !clicks) {
          await press(page);
          await page.waitForTimeout(2600);
          continue;
        }

        // What the beat points at comes from the registry, not from matching the
        // ring's box to a testid. The geometric match is a fine cross-check —
        // demo-smoothness makes it properly, against the visible part of the
        // control — but it must not decide COVERAGE: it failed to resolve while a
        // simulator was still animating, and the inbox beat then vanished from
        // this sweep's fault injections on one run and came back on the next
        // with nothing changed in between.
        const target = defined?.target ?? at.ringTarget ?? 'the ringed control';
        const before = at.step;

        await deafen(page);
        await press(page);
        let stalled = await settle(page, before, (p) => p.retry || p.done || p.step !== before);
        // A press that never made the guide busy did not land: the director was
        // still confirming the beat before and dropped it on the floor, which is
        // by design and reads from outside exactly like the defect being hunted
        // — a step that held and said nothing about why. Seen twice now, both
        // times in a loaded run. Press once more rather than reporting it, and
        // only then take the reading. A second dropped press is a real finding
        // and still fails below.
        if (!stalled.sawBusy && !stalled.retry && stalled.step === before && !stalled.done) {
          await press(page);
          stalled = await settle(page, before, (p) => p.retry || p.done || p.step !== before);
        }
        // "Did not advance" has to include "did not finish the tour": the last
        // step of a tour completes by setting done while leaving the index
        // where it is, so comparing the index alone reads a finished tour as a
        // held step.
        expect(
          stalled.done ? 'finished the tour' : `step ${String(stalled.step)}`,
          `${tour}: step ${String(before)} advanced while ${target} could not be clicked — ` +
            'something that did not happen',
        ).toBe(`step ${String(before)}`);
        expect(
          stalled.retry,
          `${tour}: step ${String(before)} held, but said nothing about why` +
            (stalled.sawBusy ? '' : ' — and never even started, so both presses were dropped'),
        ).toBe(true);

        // give the page its hearing back and let the second press do the real thing
        await restore(page);
        await press(page);
        const after = await settle(page, before, (p) => p.done || p.step !== before);
        expect(
          after.done || after.step !== before ? 'moved' : 'stuck',
          `${tour}: step ${String(before)} would not move even once ${target} worked again`,
        ).toBe('moved');
        tested.push(target);
      }

      // eslint-disable-next-line no-console -- the coverage is the deliverable
      console.log(
        `  ${tour}: fault-injected ${tested.length} ringed step(s) — ${tested.join(', ')}`,
      );
      // Every beat that HAS something to fail must have had it failed.
      //
      // "More than zero" let the sweep quietly halve: when the ring moved from a
      // field's input to the field's wrapper, three of admin-2fa's five
      // injections stopped resolving and the test still reported green. The
      // registry knows how many beats carry a recipe and a target; that is the
      // number, and a drop in it is now a failure rather than a smaller run.
      const owed = (scenarioByKey(tour)?.steps ?? []).filter(
        (st) => st.target && (st.perform ?? []).some((p) => p.kind === 'click'),
      ).length;
      expect(
        tested.length,
        `${tour}: ${String(owed)} beat(s) carry a recipe and a ring, but only ` +
          `${String(tested.length)} were fault-injected — ${tested.join(', ')}`,
      ).toBe(owed);
    });
  }
});
