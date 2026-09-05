import { expect, test, type Page } from '@playwright/test';
import { BASE, TOURS, beat, open, press, ready, turned } from './walk';

/**
 * E-DISAGREE, swept across every tour: does the application ever go somewhere
 * the narration does not know about?
 *
 * This is the generic form of what the admin 2FA tour did. Its first code was
 * accepted, so the admin was signed in and the app navigated to the
 * marketplace — while the tour sat on the login step, still saying "the server
 * wants a TOTP code, generate one and watch it closely". Route in the app,
 * narration on the sign-in page, and nothing to reconcile them.
 *
 * Stated without reference to 2FA: **the route changed and the step did not.**
 * That is checkable in every tour without knowing anything about what any of
 * them do.
 *
 * A brief version of it is legitimate and happens constantly — a step whose
 * action *is* a navigation changes the route a moment before the step it
 * confirms catches up. So what is measured is how long the disagreement lasts.
 * Momentary is the machinery working; sustained is the visitor reading one
 * thing and looking at another.
 *
 * Run: `npm run test:perf -- e2e-tests/perf/demo-disagreement.spec.ts`
 */

/** How long a route may run ahead of the step that explains it. */
const GRACE_MS = 3000;

interface Sample {
  t: number;
  step: number | undefined;
  done: boolean;
  path: string;
  says: string;
}

function sampler(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w['__disOn']) return;
  w['__disOn'] = true;
  const out: Sample[] = [];
  w['__dis'] = out;
  // The checkout hands over through a full page load, and a reload is exactly
  // the moment a route can run ahead of the step that explains it — so the
  // frames before it have to survive it. Handed to storage on the way out.
  const KEY = '__disSamples';
  addEventListener('pagehide', () => {
    // The marker goes down FIRST and is lifted only on success, so a hand-off
    // that fails — a storage quota is the likely way — arrives in the next
    // document as a fact the test can fail on, rather than as a silently
    // shorter recording that reads like a clean run.
    try {
      sessionStorage.setItem('__disLost', '1');
      const prior = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Sample[];
      sessionStorage.setItem(KEY, JSON.stringify([...prior, ...out]));
      sessionStorage.removeItem('__disLost');
    } catch {
      /* the marker stays down; never let the instrument break what it measures */
    }
  });
  w['__disAll'] = (): Sample[] => {
    let prior: Sample[] = [];
    try {
      prior = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Sample[];
    } catch {
      prior = [];
    }
    return [...prior, ...out];
  };
  const tick = (): void => {
    let step: number | undefined;
    let done = false;
    try {
      const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
      };
      step = s.step;
      done = s.done === true;
    } catch {
      /* mid-write is not a fault */
    }
    out.push({
      t: Math.round(performance.timeOrigin + performance.now()),
      step,
      done,
      path: location.pathname,
      says: (document.querySelector('[data-testid="guide-narration"]')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

interface Drift {
  step: number;
  from: string;
  to: string;
  ms: number;
  /** What the panel was saying while the app was elsewhere. */
  says: string;
}

/**
 * How long after a step change the route is allowed to still be moving before
 * anything it does counts as where that step lives.
 *
 * This is not padding. `advance()` persists the new step and asks the router
 * to navigate in the same task, and the router commits whenever it commits —
 * so the frame on which the step number changes shows the OLD path about half
 * the time. Anchoring on that frame made every route-changing step read as a
 * step-long disagreement, which is the instrument inventing the very defect it
 * was built to find.
 */
const SETTLE_MS = 600;

/**
 * Contiguous runs of frames in which the step held still while the route was
 * somewhere other than where that step settled.
 *
 * The anchor is the path once the step's own navigation has finished, not the
 * path at the instant the step number changed.
 */
function disagreements(samples: readonly Sample[]): Drift[] {
  const out: Drift[] = [];
  let step: number | undefined;
  let since = 0;
  let anchor: string | null = null;
  let run: (Drift & { start: number }) | null = null;

  const flush = (): void => {
    if (run) out.push({ step: run.step, from: run.from, to: run.to, ms: run.ms, says: run.says });
    run = null;
  };

  for (const s of samples) {
    if (s.step === undefined || s.done) {
      flush();
      step = undefined;
      anchor = null;
      continue;
    }
    if (s.step !== step) {
      flush();
      step = s.step;
      since = s.t;
      anchor = null;
      continue;
    }
    if (anchor === null) {
      // still settling; the first frame past the window says where this step is
      if (s.t - since < SETTLE_MS) continue;
      anchor = s.path;
      continue;
    }
    if (s.path === anchor) {
      flush();
      continue;
    }
    if (run && run.to === s.path) run.ms = s.t - run.start;
    else {
      flush();
      run = { step: s.step, from: anchor, to: s.path, ms: 0, says: s.says, start: s.t };
    }
  }
  flush();
  return out;
}

test.describe('The route and the narration agree', () => {
  test('no tour walks off somewhere its narration does not know about', async ({ page }) => {
    test.setTimeout(420_000);
    await page.addInitScript(sampler);

    const report: string[] = [];
    const sustained: string[] = [];
    /** How far each tour actually got. "Nothing found" over three steps is not
     *  a result, so the reach is asserted as well as the finding. */
    const reached: string[] = [];

    for (const tour of TOURS) {
      await open(page, tour);

      await page.evaluate(() => {
        sessionStorage.removeItem('__disSamples');
        sessionStorage.removeItem('__disLost');
      });

      for (let i = 0, at = await ready(page); i < 14 && !at.done; i++) {
        const from = at.step;
        await press(page);
        at = await turned(page, from);
        // the beat has to be allowed to stand still long enough for a
        // disagreement to be visible as one
        await page.waitForTimeout(900);
        if (at.step === from && !at.done) break; // held — nothing more to walk
      }
      reached.push(
        `${tour}: ${(await beat(page)).done ? 'recap' : `held at ${String((await beat(page)).step)}`}`,
      );

      const samples = await page
        .evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          return ((w['__disAll'] as () => Sample[])?.() ?? w['__dis'] ?? []) as Sample[];
        })
        .catch(() => [] as Sample[]);
      expect(
        await page.evaluate(() => sessionStorage.getItem('__disLost')),
        `${tour}: frames were lost across a reload, so this tour was not measured`,
      ).toBeNull();
      expect(samples.length, `${tour}: the sampler recorded nothing`).toBeGreaterThan(50);
      for (const d of disagreements(samples)) {
        const line =
          `${tour}: step ${d.step} stayed put while the app went ${d.from} → ${d.to} ` +
          `for ${d.ms}ms — narration still read "${d.says}"`;
        report.push(line);
        if (d.ms > GRACE_MS) sustained.push(line);
      }
    }

    // eslint-disable-next-line no-console -- the survey is the deliverable
    console.log(
      `\n  route/step disagreements seen (momentary ones are the machinery working)\n` +
        (report.length ? report.map((r) => `    ${r}`).join('\n') : '    none') +
        '\n',
    );

    // eslint-disable-next-line no-console -- how far the walk got is part of the result
    console.log(`  reach: ${reached.join(' · ')}
`);

    expect(
      reached.filter((r) => !r.endsWith('recap')),
      'every tour has to be walked to the end, or "nothing found" means nothing',
    ).toEqual([]);
    expect(
      sustained,
      'a visitor should never be reading one step while standing on another page',
    ).toEqual([]);
  });

  /**
   * The instrument, falsified. "No tour walks off" is only worth reading once
   * a tour that walks off would have been caught — and this sweep in
   * particular had a false positive built into it, anchoring on the frame the
   * step number changed rather than on where the step settled.
   *
   * So the app is walked off deliberately: the path is changed under a held
   * step, with nothing advancing, and held there past the grace. The sweep has
   * to name it, with roughly the right duration.
   */
  test('the sweep can see the app walk off', async ({ page }) => {
    await page.addInitScript(sampler);
    await page.goto(`${BASE}/demo?start=support-ticket`, { waitUntil: 'networkidle' });
    await expect(
      page.locator('[data-testid="guide-spot-next"], [data-testid="guide-next"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    // let the step settle where it lives, so the anchor is its real route
    await page.waitForTimeout(SETTLE_MS + 400);
    const from = await page.evaluate(() => location.pathname);
    // pushState only — the tour must not advance, or there is no disagreement
    await page.evaluate(() => history.pushState({}, '', '/collaborations/list'));
    await page.waitForTimeout(GRACE_MS + 1200);
    await page.evaluate((back: string) => history.pushState({}, '', back), from);

    const samples = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__dis'] as Sample[],
    );
    const found = disagreements(samples);
    const planted = found.find((d) => d.to === '/collaborations/list');

    expect(planted, 'a route held away from its step for four seconds must be seen').toBeTruthy();
    expect(planted!.from, 'and reported against where the step actually lives').toBe(from);
    expect(planted!.ms, 'for about as long as it was actually held').toBeGreaterThan(GRACE_MS);
    expect(planted!.says, 'with what the panel was saying while it happened').not.toBe('');
  });
});
