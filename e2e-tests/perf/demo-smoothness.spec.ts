import { expect, test, type Page } from '@playwright/test';
import { installRingRule } from './walk';

/**
 * Smoothness tier — the answer to "is the demo smooth?" in numbers instead of
 * impressions. The owner could feel jitter through the browser but could not
 * say where; every budget below was found by measuring, and each one carries
 * the reading that made it necessary.
 *
 * What it watches:
 *   • the landing presentation — the cards must not change height between
 *     beats (they grew 51 px per beat and shoved the page down seven times a
 *     run), the beat block must not blink (it hit zero opacity for eighteen
 *     frames), and each beat must hold for its own length;
 *   • a guided tour — every step must advance promptly, the input shield must
 *     never hold the page for long (a rejected step held it for 2.5 s), and no
 *     step may leave the visitor without a way forward (one did);
 *   • the ring — following a control during a scroll must not cost the
 *     application change-detection passes or hit tests (it cost 60 and 249),
 *     and the pill must not hop around the control (it moved 31 times);
 *   • the half-typed value that started all of this: the guide must correct it
 *     rather than submit it and walk on.
 *
 * Runs against the DEMO build (the tours only exist there): `npm run test:perf`
 * starts one on http://localhost:4300 and reuses one already running.
 * Deliberately outside the pre-commit gate — it needs a served build and about
 * a minute. Run it before a deploy, or whenever the demo feels off.
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';

// Frame-timing budgets are asserted where the clock is quiet: this box, or a dedicated
// runner. On a shared CI runner (PERF_TIMING=report, set by browser-tiers.yml) the same
// numbers are measured and written to the report as `timing` annotations, never asserted:
// one or two 67 ms frames in a twenty-second story under 4x throttle, or 10 to 14 long
// frames through a tour where this box reads 8, are the runner, not the application
// (both measured on the same commit, 2026-09-09). Structural budgets, such as card
// heights, opacity, beat tempo and a way forward at every step, stay hard everywhere.
const REPORT_ONLY = process.env['PERF_TIMING'] === 'report';
function timing(name: string, reading: string, assert: () => void): void {
  test.info().annotations.push({ type: 'timing', description: `${name}: ${reading}` });
  if (!REPORT_ONLY) assert();
}

/** How long each beat of the landing story holds, in play order. */
const BEATS = [2400, 2800, 3400, 3000, 2800, 2400, 3600];

const TOURS = [
  'admin-2fa',
  'stepup-email',
  'company-campaign',
  'influencer-collab',
  'nip-to-ksef',
  'support-ticket',
  'admin-ops',
] as const;

/** Squeeze the CPU so jank that a fast desktop hides becomes reproducible. */
async function throttle(page: Page, rate: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

/**
 * Where the ring actually is, judged against the page rather than against
 * itself: hit-test the middle of the ring and walk up from whatever is there
 * looking for the element the ring is drawn around (6 px outside it). If no
 * ancestor matches, the ring is floating over something it does not describe.
 *
 * "Drawn around" means around the part of the control that is showing. An admin
 * ticket row measures 1466 px inside a 1440 px window and its card clips the
 * rest; the ring stops where the card does, and comparing it against the row's
 * full width called that a 48 px drift. The visible box is recomputed here
 * rather than read off the component — see `INSTALL_VISIBLE_BOX` in walk.ts,
 * which is the tier's only copy of the rule.
 */
function ringOnTarget(page: Page) {
  return page.evaluate(() => {
    const visible = (window as unknown as Record<string, (el: Element) => DOMRect>)['__visibleBox'];
    const ring = document.querySelector('[data-testid="guide-spotlight"]');
    if (!ring) return null;
    const r = ring.getBoundingClientRect();
    if (r.width === 0) return null;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    // Ancestors alone are not enough. A centre hit-test lands on an inner
    // <span> when the control has one — which is why the walk goes up — but it
    // also passes straight *through* a control that has `pointer-events: none`,
    // and Material gives that to every disabled button. The checkout's confirm
    // button is disabled until the consent box is ticked, so the hit lands on
    // `mat-dialog-actions` and the button it is asking about is a child of that,
    // never an ancestor. So look down as well as up.
    const candidates: Element[] = [];
    for (let el: Element | null = hit; el && el !== document.body; el = el.parentElement) {
      candidates.push(el);
    }
    if (hit) candidates.push(...Array.from(hit.querySelectorAll('*')));
    let drift: number | null = null;
    let matched: string | null = null;
    for (const el of candidates) {
      const b = visible(el);
      if (b.width <= 0 || b.height <= 0) continue;
      const d = Math.max(
        Math.abs(b.left - (r.left + 6)),
        Math.abs(b.top - (r.top + 6)),
        Math.abs(b.right - (r.right - 6)),
        Math.abs(b.bottom - (r.bottom - 6)),
      );
      if (drift === null || d < drift) {
        drift = d;
        matched = el.getAttribute('data-testid') ?? el.tagName.toLowerCase();
      }
    }
    return { drift: drift === null ? null : Math.round(drift), matched };
  });
}

interface TourState {
  step: number | undefined;
  done: boolean;
  pill: boolean;
  panelNext: boolean;
}

/**
 * Reading the tour's state can land on the checkout's full page reload, and
 * an evaluate whose document is replaced under it throws. That is the tour
 * working, not the tour failing — so it reads as "nothing offered yet", which
 * the caller already knows how to wait out.
 */
async function tourState(page: Page): Promise<TourState> {
  return page
    .evaluate(() => {
      const state = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
      };
      return {
        step: state.step,
        done: state.done === true,
        pill: !!document.querySelector('[data-testid="guide-spot-next"]'),
        panelNext: !!document.querySelector('[data-testid="guide-next"]'),
      };
    })
    .catch(() => ({ step: undefined, done: false, pill: false, panelNext: false }));
}

test.describe('Demo smoothness', () => {
  // Every budget here that talks about the ring compares it against the part
  // of its control that is showing, which the page has to be able to work out
  // for itself. An init script survives the tour's own reload.
  test.beforeEach(async ({ page }) => {
    await installRingRule(page);
  });

  test('the landing story keeps its shape and its tempo', async ({ page }) => {
    await throttle(page, 4);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="dashboard-mode-simulation"]').scrollIntoViewIfNeeded();

    // Sampling is armed before the click but only records once the story's
    // first beat is on screen, so the numbers below describe the run itself
    // and not the deliberate expansion that starting it causes (measured
    // separately at the end of this test).
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const heights: number[] = [];
      const opacity: number[] = [];
      const beats: { key: string; at: number }[] = [];
      const frames: number[] = [];
      let last = performance.now();
      let running = false;
      let switchFrame = 0;
      const sample = (t: number): void => {
        w['__raf'] = requestAnimationFrame(sample);
        const block = document.querySelector('[data-testid^="dashboard-brand-"]');
        const key = block?.getAttribute('data-testid') ?? '';
        if (!running && key !== 'dashboard-brand-campaign_created') {
          last = t;
          return;
        }
        if (!running) {
          // the frame that rendered the story in place of the tableau: real
          // work, measured on its own rather than counted as a dropped frame
          running = true;
          switchFrame = t - last;
          last = t;
          return;
        }
        frames.push(t - last);
        last = t;
        if (!block) return; // the finale replaced the cards; the run is over
        opacity.push(Number(getComputedStyle(block).opacity));
        if (beats[beats.length - 1]?.key !== key) beats.push({ key, at: performance.now() });
        const card = document.querySelector('[data-testid="landing-dashboard-preview"] article');
        if (card) heights.push(Math.round(card.getBoundingClientRect().height));
      };
      w['__data'] = {
        heights,
        opacity,
        beats,
        frames,
        get switchFrame() {
          return switchFrame;
        },
      };
      w['__raf'] = requestAnimationFrame(sample);
    });

    const before = await page.locator('[data-testid="landing-dashboard-preview"]').boundingBox();
    await page.click('[data-testid="dashboard-mode-simulation"]');
    await page.waitForSelector('[data-testid="dashboard-brand-campaign_created"]');
    const after = await page.locator('[data-testid="landing-dashboard-preview"]').boundingBox();
    await page.waitForSelector('[data-testid="dashboard-success"]', { timeout: 60_000 });

    const seen = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      cancelAnimationFrame(w['__raf'] as number);
      const d = w['__data'] as {
        heights: number[];
        opacity: number[];
        beats: { key: string; at: number }[];
        frames: number[];
        switchFrame: number;
      };
      return {
        heightSpread: Math.max(...d.heights) - Math.min(...d.heights),
        minOpacity: Math.min(...d.opacity),
        gaps: d.beats.slice(1).map((b, i) => Math.round(b.at - d.beats[i].at)),
        slowFrames: d.frames.filter((f) => f > 50).length,
        worstFrame: Math.round(Math.max(...d.frames)),
        switchFrame: Math.round(d.switchFrame),
      };
    });

    // the cards grew 51 px on every beat before the descriptions were reserved
    expect(seen.heightSpread).toBeLessThanOrEqual(4);
    // the beat block used to be destroyed and rebuilt, blinking to nothing
    expect(seen.minOpacity).toBeGreaterThanOrEqual(0.2);
    timing('slow frames', `${seen.slowFrames} over 50 ms, worst ${seen.worstFrame} ms`, () =>
      expect(seen.slowFrames, `worst frame ${seen.worstFrame} ms`).toBe(0),
    );
    timing('switch frame', `${seen.switchFrame} ms`, () =>
      expect(seen.switchFrame).toBeLessThanOrEqual(120),
    );
    // each beat holds for its own length, not one metronomic 2.6 s
    for (const [i, gap] of seen.gaps.entries()) {
      if (i >= BEATS.length - 1) break;
      expect(Math.abs(gap - BEATS[i])).toBeLessThanOrEqual(300);
    }
    // Starting the story adds the narration and its countdown under the
    // progress list, so the section does grow once — on the visitor's own
    // click, with the section's top anchored. Bounded so it stays one line of
    // narration and not a page-shoving reflow.
    expect((after?.height ?? 0) - (before?.height ?? 0)).toBeLessThanOrEqual(260);
  });

  test('the ring follows a scroll without costing the application anything', async ({ page }) => {
    await throttle(page, 4);
    await page.goto(`${BASE}/demo?start=company-campaign`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 30_000 });
    await page.waitForTimeout(600);

    const seen = await page.evaluate(async () => {
      const w = window as unknown as Record<string, unknown>;
      let hits = 0;
      const original = Document.prototype.elementFromPoint;
      Document.prototype.elementFromPoint = function (...args: [number, number]) {
        hits++;
        return original.apply(this, args);
      };
      const sides: string[] = [];
      const lag: number[] = [];
      const helpers = window as unknown as Record<string, unknown>;
      const drawn = helpers['__drawnBox'] as (el: Element) => DOMRect;
      const sample = (): void => {
        const ring = document.querySelector('[data-testid="guide-spotlight"]');
        const pill = document.querySelector('[data-testid="guide-spot-next"]');
        const target = document.querySelector('[data-testid="opp-form-name"]');
        if (ring && pill && target) {
          const r = ring.getBoundingClientRect();
          const q = pill.getBoundingClientRect();
          const t = drawn(target);
          sides.push(`${Math.round(q.left - r.left)}`);
          // Against the showing part of the field, not the whole of it: once a
          // control passes the top of the pane that holds it the ring stops
          // there, which is the ring being right rather than late.
          if (t.height > 0) lag.push(Math.abs(r.top + 6 - t.top));
        }
        w['__raf'] = requestAnimationFrame(sample);
      };
      w['__raf'] = requestAnimationFrame(sample);

      const scroller =
        [...document.querySelectorAll('*')].find(
          (e) =>
            e.scrollHeight > e.clientHeight + 4 &&
            ['auto', 'scroll'].includes(getComputedStyle(e).overflowY),
        ) ?? document.scrollingElement;
      for (let i = 0; i < 60; i++) {
        if (scroller) scroller.scrollTop += 10;
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => setTimeout(r, 300));
      cancelAnimationFrame(w['__raf'] as number);
      Document.prototype.elementFromPoint = original;
      return { hits, sides: new Set(sides).size, worstLag: Math.max(...lag, 0) };
    });

    expect(seen.hits).toBeLessThanOrEqual(12); // 249 before
    expect(seen.sides).toBeLessThanOrEqual(2); // the pill kept changing sides
    expect(seen.worstLag).toBeLessThanOrEqual(2); // the ring used to trail its control
  });

  /**
   * A simulator's own button is what confirms a sim step — it calls notify()
   * when it fires, and those steps declare no other `done`. So a press whose
   * click never landed is a step that did not happen, and the tour used to
   * carry on regardless: taking `ksef-sim-done` away on the live demo and
   * pressing once completed the whole tour and showed the recap, narrating a
   * KSeF registration that never took place.
   */
  test('a simulator that never fires holds the step instead of narrating it', async ({ page }) => {
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 30_000 });

    // two presses reach verify-mail — a sim step with no `done` and no reload
    for (let i = 0; i < 2; i++) {
      await page.click('[data-testid="guide-spot-next"]');
      await page.waitForTimeout(2600);
    }
    expect((await tourState(page)).step, 'the walk should have reached verify-mail').toBe(2);
    await expect(page.locator('[data-testid="inbox-sim-cta"]')).toBeVisible();

    // Take the simulator's button away: the recipe now has nothing to click,
    // so nothing can notify and the step cannot have happened.
    //
    // Press whichever control is offered, without waiting for it to hold still.
    // Removing the ring's target makes the pill detach as the ring gives up on
    // it and the panel takes over, and a `page.click` on the pill spends the
    // whole timeout watching it come and go.
    const press = async (): Promise<void> => {
      await page.evaluate(() => {
        const b =
          document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
          document.querySelector<HTMLElement>('[data-testid="guide-next"]');
        b?.click();
      });
    };

    await page.evaluate(() => document.querySelector('[data-testid="inbox-sim-cta"]')?.remove());
    await press();
    // long enough for the runner to give up looking for the button it was told
    // to click (4 s) and for the wait on the simulator to expire (1.5 s)
    await page.waitForTimeout(7500);

    expect((await tourState(page)).step, 'an unconfirmed step must not advance').toBe(2);
    await expect(
      page.locator('[data-testid="guide-retry"]'),
      'and it must say so rather than pretending',
    ).toBeVisible();

    // but a visitor who insists is never trapped by a condition we got wrong —
    // the second press pays the same lookup and wait before it gives up
    await press();
    await page.waitForTimeout(7500);
    expect((await tourState(page)).step, 'a second press moves on regardless').toBe(3);
  });

  test('a half-typed value is corrected instead of submitted', async ({ page }) => {
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 30_000 });
    await page.click('[data-testid="company-setup-nip"]');
    await page.keyboard.type('526');

    const shield = page.locator('[data-testid="guide-shield"]');
    await page.click('[data-testid="guide-spot-next"]');
    await expect(page.locator('[data-testid="company-setup-confirm"]')).toBeVisible({
      timeout: 5_000,
    });

    // the guide typed a working NIP over the half-typed one and the step ran
    await expect(page.locator('[data-testid="company-setup-nip"]')).toHaveValue('5260250995');
    await expect(shield).toHaveCount(0);
    const state = await tourState(page);
    expect(state.step).toBe(1);
  });

  test('the main thread stays answerable through a tour', async ({ page }) => {
    // Long Animation Frames is the signal that replaced counting rAF gaps: it
    // reports the frames that actually blocked, with the script that caused
    // them attributed. Event Timing gives the other half — how long the page
    // took to answer a press (the INP measure).
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const loaf: { dur: number; blocking: number; worst: string }[] = [];
      const slowEvents: number[] = [];
      w['__supported'] = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          duration: number;
          blockingDuration: number;
          scripts: { duration: number; invoker?: string; invokerType?: string }[];
        }[]) {
          const worst = [...(e.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0];
          loaf.push({
            dur: Math.round(e.duration),
            blocking: Math.round(e.blockingDuration),
            worst: worst ? `${worst.invokerType}:${worst.invoker}` : '-',
          });
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) slowEvents.push(Math.round(e.duration));
      }).observe({ type: 'event', durationThreshold: 16, buffered: true });
      w['__loaf'] = loaf;
      w['__slowEvents'] = slowEvents;
    });
    await throttle(page, 4);
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });

    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>)['__supported']),
      'this browser cannot report long animation frames, so the test would prove nothing',
    ).toBe(true);

    for (let i = 0; i < 12; i++) {
      const s = await tourState(page).catch(() => null);
      if (!s || s.done) break;
      if (!s.pill && !s.panelNext) {
        await page.waitForTimeout(300);
        continue;
      }
      await page
        .click(s.pill ? '[data-testid="guide-spot-next"]' : '[data-testid="guide-next"]', {
          timeout: 8_000,
        })
        .catch(() => undefined);
      await page.waitForTimeout(400);
    }

    const seen = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const loaf = w['__loaf'] as { dur: number; blocking: number; worst: string }[];
      const events = w['__slowEvents'] as number[];
      return {
        frames: loaf.length,
        worst: Math.max(0, ...loaf.map((f) => f.dur)),
        blocking: loaf.reduce((n, f) => n + f.blocking, 0),
        worstEvent: Math.max(0, ...events),
        blame: [...loaf].sort((a, b) => b.dur - a.dur)[0]?.worst ?? '-',
      };
    });

    // What this can honestly assert, and what it cannot.
    //
    // The single worst frame is not a property of the application: measured on
    // an idle machine it is 222, 222, 250 ms, and measured inside the tier's own
    // twenty-minute run it is 338. A hundred milliseconds of that is whatever
    // else the box is doing. It was asserted at 250, then at 320, and failed at
    // both often enough to be noise rather than a guard.
    //
    // It is not the guide's work either. The longest script in the worst frame
    // is a rAF callback of which 102 of its 104 ms is `forcedStyleAndLayout` —
    // the ring measuring its control on the frame after the page replaced its
    // DOM. Caching the clip search moved it by nothing; removing the
    // fading-overlay opacity read entirely gave 267, 256, 265.
    //
    // So the worst frame is reported and not asserted. The three that remain are
    // the ones that describe answerability and they are stable: a regression
    // that costs every frame — the kind that once put 144 hit tests into a
    // single scroll — shows up as MORE long frames and more blocking, not as one
    // unlucky long one.
    const reading = `${String(seen.frames)} long frames, worst ${String(seen.worst)} ms, blamed on ${seen.blame}`;
    timing('long frames', reading, () => expect(seen.frames, reading).toBeLessThanOrEqual(8));
    timing('blocking', `${String(seen.blocking)} ms`, () =>
      expect(seen.blocking).toBeLessThanOrEqual(400),
    );
    // the "good" threshold for interaction latency
    timing('worst event', `${String(seen.worstEvent)} ms`, () =>
      expect(seen.worstEvent).toBeLessThanOrEqual(200),
    );
  });

  for (const key of TOURS) {
    test(`the ${key} tour advances promptly at every step`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // Layout shifts within half a second of a click are excluded from CLS by
      // design — and the ring moves right after a click, so CLS is blind to
      // exactly the shifts this tour causes. Count them all.
      await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const shifts: number[] = [];
        w['__shifts'] = shifts;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number }[]) shifts.push(e.value);
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${BASE}/demo?start=${key}`, { waitUntil: 'networkidle' });

      for (let i = 0; i < 12; i++) {
        let before = await tourState(page);
        // a step that reloads the page needs a moment to come back
        for (let k = 0; k < 30 && !before.done && !before.pill && !before.panelNext; k++) {
          await page.waitForTimeout(100);
          before = await tourState(page);
        }
        if (before.done) break;
        expect(before.pill || before.panelNext, `step ${before.step} offers no way forward`).toBe(
          true,
        );

        // Once a way forward is offered it must stay that control. The ksef
        // beat used to hand the panel a Next while its simulator was still
        // opening, then swap it for the ring's pill — a button appearing and
        // vanishing under the visitor's cursor.
        await page.waitForTimeout(400);
        // a step that reloads may already be navigating; that is not a flicker
        const settled = await tourState(page).catch(() => null);
        if (settled && settled.step === before.step && !settled.done) {
          expect(settled.pill, `step ${before.step} changed its way forward`).toBe(before.pill);
        }

        // whenever the ring is up, it must be drawn around something real
        const ring = await ringOnTarget(page);
        if (ring && ring.drift !== null) {
          expect(
            ring.drift,
            `step ${before.step}: the ring is ${ring.drift} px off the nearest element (${ring.matched})`,
          ).toBeLessThanOrEqual(2);
        }

        const control = before.pill
          ? '[data-testid="guide-spot-next"]'
          : '[data-testid="guide-next"]';
        const started = Date.now();
        await page.click(control);
        await page.waitForFunction(
          (prev) => {
            const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
              step?: number;
              done?: boolean;
            };
            return s.step !== prev.step || (s.done === true) !== prev.done;
          },
          { step: before.step, done: before.done },
          { timeout: 10_000 },
        );
        // the simulators have beats of their own; everything else is instant
        expect(Date.now() - started, `step ${before.step} took too long`).toBeLessThanOrEqual(1500);
        // the page is held while the guide types, and only then
        await expect(page.locator('[data-testid="guide-shield"]')).toHaveCount(0);
      }
      const shifted = await page.evaluate(() =>
        ((window as unknown as Record<string, unknown>)['__shifts'] as number[]).reduce(
          (n, v) => n + v,
          0,
        ),
      );
      // measured per tour: 0.006 to 0.085, and CLS reports as little as 0 of it
      expect(shifted, 'the tour moved the page under the visitor').toBeLessThanOrEqual(0.15);
      expect(errors).toEqual([]);
    });
  }
  /**
   * The message's dissolve lives in the same keyframes as its flight because
   * the production pipeline once lost it. Angular scopes `@keyframes` names
   * per component; inside an `@media` block the minified build scoped only
   * the first name of a two-name `animation-name` list, so the dev server
   * ran both, the sandbox tier passed, and the live site left every message
   * lying on the pane. This runs against the BUILT app, so it sees what the
   * visitor sees: the first message is whole at some point and gone 1.3 s
   * after it appears.
   */
  test("the story's first message dissolves after landing, in the built app", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="dashboard-mode-simulation"]').scrollIntoViewIfNeeded();
    await page.click('[data-testid="dashboard-mode-simulation"]');
    const cargo = page.locator('[data-testid="dashboard-flight"]');
    await cargo.waitFor();
    const seen = await cargo.evaluate(async (el) => {
      const read = () => Number(getComputedStyle(el).opacity);
      const t0 = performance.now();
      let peak = 0;
      while (performance.now() - t0 < 1300) {
        peak = Math.max(peak, read());
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { peak, final: read() };
    });
    expect(seen.peak, 'the message never became visible').toBeGreaterThanOrEqual(0.95);
    expect(seen.final, 'the message is still lying on the pane').toBe(0);
  });
});
