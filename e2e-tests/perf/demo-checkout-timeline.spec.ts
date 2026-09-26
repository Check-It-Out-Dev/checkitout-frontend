import { expect, test, type Page } from '@playwright/test';

/**
 * The checkout beat, event by event.
 *
 * Everything else in this tier asks business questions — did the step advance,
 * is the ring on its control. This one asks only technical ones, because the
 * complaint about this beat is not that it fails: it is that the new tier is
 * simply *there*, with no moment in which it arrives.
 *
 * What actually happens is a full page reload. The fixture answers
 * POST /subscription/upgrade by writing the plan into sessionStorage and
 * returning a same-origin `sessionUrl`, the component assigns
 * `window.location.href`, and the document is replaced. On the way back
 * `restore()` sees the stored plan and moves the tour on. The visitor never
 * sees the plan change — they see one page, a blink, and a different page.
 *
 * So the instrument has to survive the reload. The recorder is installed with
 * addInitScript (it runs in every document, before app code), and every mark is
 * stamped with `performance.timeOrigin + performance.now()` — a high-resolution
 * epoch that is comparable across the two documents — and appended to a
 * sessionStorage array that the second document inherits. What comes back is
 * one timeline across the navigation boundary.
 *
 * Two numbers are the point of the whole file:
 *   • blankMs      — pagehide → first contentful paint: how long the visitor
 *                    looks at nothing, or at the page they already left.
 *   • tierRevealMs — first contentful paint → the card showing the new tier.
 *                    At ~0 the higher tier does not appear, it was simply
 *                    always there. That is the "too instant" this measures.
 *
 * Run: `npm run test:perf -- e2e-tests/perf/demo-checkout-timeline.spec.ts`
 * (add PERF_BASE_URL=https://www.checkitout.app to measure production).
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';
const MARKS_KEY = '__ckMarks';

interface Mark {
  /** Event name. */
  n: string;
  /** High-resolution epoch, comparable across documents. */
  e: number;
  /** Which document recorded it: 1 before the reload, 2 after. */
  d: number;
  /** Optional detail — a status code, a duration, a key name. */
  v?: string | number;
}

/**
 * Installed before any application code, in every document of the run.
 *
 * Only patches things it can restore semantically: the storage writes and the
 * two network APIs are wrapped, never replaced, and every observer is guarded
 * so an unsupported entry type cannot take the page down.
 */
function recorder(key: string): void {
  const w = window as unknown as Record<string, unknown>;
  if (w['__ckInstalled']) return;
  w['__ckInstalled'] = true;

  const store = window.sessionStorage;
  const setItem = store ? Storage.prototype.setItem.bind(store) : null;
  const now = (): number => Math.round(performance.timeOrigin + performance.now());

  // Which document is this? The first one to run starts the list.
  let doc = 1;
  try {
    const existing = store?.getItem(key);
    if (existing) doc = (JSON.parse(existing) as Mark[]).reduce((m, x) => Math.max(m, x.d), 1) + 1;
  } catch {
    /* a corrupt list is not worth failing the page over */
  }

  const mark = (n: string, v?: string | number): void => {
    try {
      if (!store || !setItem) return;
      const list = JSON.parse(store.getItem(key) ?? '[]') as Mark[];
      list.push(v === undefined ? { n, e: now(), d: doc } : { n, e: now(), d: doc, v });
      setItem(key, JSON.stringify(list));
    } catch {
      /* never let instrumentation break the thing it measures */
    }
  };
  w['__ckMark'] = mark;
  mark('document.start', doc);

  // ── storage: the plan and the tour's own position ───────────────────────
  if (store) {
    // Capture the native implementation FIRST. Assigning a wrapper that reaches
    // for `Storage.prototype.setItem` by name captures itself, and the first
    // write recurses until the stack goes — which takes the page with it.
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, value: string): void {
      native.call(this, k, value);
      if (this === store && k !== key) {
        if (/plan/i.test(k)) mark('storage.plan', `${k}=${value}`);
        else if (/sandbox|demo/i.test(k)) {
          let step: unknown;
          try {
            step = (JSON.parse(value) as { step?: number }).step;
          } catch {
            step = undefined;
          }
          mark('storage.tourStep', step === undefined ? k : `step=${String(step)}`);
        }
      }
    };
  }

  // ── network: only the calls this beat makes ─────────────────────────────
  const interesting = (url: string): boolean => /\/subscription\//.test(url);
  const realFetch = window.fetch?.bind(window);
  if (realFetch) {
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!interesting(url)) return realFetch(input, init);
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      mark('xhr.send', path);
      const started = performance.now();
      const res = await realFetch(input, init);
      mark('xhr.done', `${path} ${res.status} ${Math.round(performance.now() - started)}ms`);
      return res;
    };
  }
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: unknown[]) {
    if (interesting(String(url))) {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '');
      this.addEventListener('loadstart', () => mark('xhr.send', path));
      this.addEventListener('loadend', () => mark('xhr.done', `${path} ${this.status}`));
    }
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  };

  // ── paint, layout and the long frames in between ────────────────────────
  const observe = (type: string, cb: (e: PerformanceEntry) => void): void => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({
        type,
        buffered: true,
      } as PerformanceObserverInit);
    } catch {
      /* unsupported entry type — the rest of the timeline still stands */
    }
  };
  observe('paint', (e) => mark(`paint.${e.name}`, Math.round(e.startTime)));
  observe('largest-contentful-paint', (e) => mark('paint.lcp', Math.round(e.startTime)));
  observe('long-animation-frame', (e) =>
    mark('frame.long', `${Math.round(e.duration)}ms @${Math.round(e.startTime)}`),
  );
  observe('layout-shift', (e) => {
    const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (!shift.hadRecentInput && shift.value > 0.001) mark('layout.shift', shift.value.toFixed(4));
  });

  // ── the DOM moments that matter to a person watching ────────────────────
  const seen = new Set<string>();
  const once = (n: string, v?: string | number): void => {
    if (seen.has(n)) return;
    seen.add(n);
    mark(n, v);
  };
  const scan = (): void => {
    if (document.querySelector('mat-dialog-container')) once('dom.dialogOpen');
    else if (seen.has('dom.dialogOpen')) once('dom.dialogClosed');
    const card = document.querySelector('[data-testid="plan-billing-card"]');
    if (card) {
      once('dom.planCard');
      const text = (card.textContent ?? '').toUpperCase();
      if (text.includes('ENTERPRISE')) once('dom.tierEnterprise');
    }
    if (document.querySelector('app-world-sim-shell')) once('dom.simOpen');
    if (document.querySelector('[data-testid="guide-shield"]')) once('dom.shieldUp');
    else if (seen.has('dom.shieldUp')) once('dom.shieldDown');
    const pill = document.querySelector('[data-testid="guide-spot-next"]');
    if (pill && (pill as HTMLElement).getBoundingClientRect().width > 0) once('dom.pillPlaced');
  };
  try {
    // Observe `document`, not `documentElement`: this runs before any page
    // script, and at that moment documentElement does not exist yet — observing
    // it throws and the DOM half of the timeline silently never records.
    new MutationObserver((records) => {
      // A dialog that opens and closes inside one batch is gone by the time the
      // callback queries the DOM, so read the records themselves for it.
      for (const r of records) {
        for (const node of Array.from(r.addedNodes)) {
          if (node instanceof Element && node.querySelector?.('mat-dialog-container'))
            once('dom.dialogOpen');
          if (node instanceof Element && node.matches?.('mat-dialog-container'))
            once('dom.dialogOpen');
        }
        for (const node of Array.from(r.removedNodes)) {
          if (
            node instanceof Element &&
            (node.matches?.('mat-dialog-container') || node.querySelector?.('mat-dialog-container'))
          ) {
            once('dom.dialogClosed');
          }
        }
      }
      scan();
    }).observe(document, { childList: true, subtree: true, characterData: true });
  } catch {
    /* no observer, no DOM marks — the navigation timeline is still recorded */
  }

  // ── document lifecycle ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    mark('doc.contentLoaded');
    scan();
  });
  window.addEventListener('pagehide', () => mark('doc.pagehide'));
  window.addEventListener('load', () => {
    mark('doc.load');
    scan();
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | null;
    if (nav) {
      mark('nav.ttfb', Math.round(nav.responseStart));
      mark('nav.domInteractive', Math.round(nav.domInteractive));
    }
  });
}

/** Read the stitched timeline out of the page. */
async function timeline(page: Page): Promise<Mark[]> {
  return page.evaluate((k) => {
    try {
      return JSON.parse(sessionStorage.getItem(k) ?? '[]') as Mark[];
    } catch {
      return [] as Mark[];
    }
  }, MARKS_KEY);
}

test.describe('Demo checkout timeline', () => {
  test('every atomic event of the checkout hand-off is accounted for', async ({ page }) => {
    // Four fixed 2.6 s waits to get to the upgrade beat, then two beats and a
    // full page reload under the microscope. Splitting the terms off pushed that
    // past the default thirty seconds. The waits themselves are the debt (T23:
    // a fixed wait asserts wherever the clock lands, not where the app is) and
    // they should become `walk.ts` presses; until then the test gets the time it
    // actually needs rather than a trimmed measurement.
    test.setTimeout(90_000);
    await page.addInitScript(recorder, MARKS_KEY);
    await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });

    // walk to the upgrade beat without measuring it — only the hand-off is
    // under the microscope here
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => {
        const b =
          document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
          document.querySelector<HTMLElement>('[data-testid="guide-next"]');
        b?.click();
      });
      await page.waitForTimeout(2600);
    }
    const atUpgrade = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step,
    );
    expect(atUpgrade, 'the walk should have reached the upgrade beat').toBe(4);

    const press = async (): Promise<void> => {
      await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        (w['__ckMark'] as (n: string) => void)?.('press');
        const b =
          document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
          document.querySelector<HTMLElement>('[data-testid="guide-next"]');
        b?.click();
      });
    };

    // ── beat one: the checkout opens, and stays open ──────────────────────
    // This is the whole point of splitting the beat. The dialog carries the
    // plan, the price, the terms and the consent box; before the split it was
    // opened and confirmed inside one recipe and lived 101 ms.
    await page.evaluate((k) => sessionStorage.removeItem(k), MARKS_KEY);
    await press();
    await page.waitForSelector('mat-dialog-container', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(
      page.locator('mat-dialog-container'),
      'the checkout must wait for the visitor, not close itself',
    ).toHaveCount(1);
    expect(
      await page.evaluate(() => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step),
      'opening the checkout is its own step',
    ).toBe(5);
    expect(
      await page.evaluate(() => sessionStorage.getItem('demoPlan')),
      'nothing may be bought by opening the checkout',
    ).toBeNull();

    // ── the terms, which are now their own beat ───────────────────────────
    // The payment button is disabled until the consent box is ticked, so the
    // ring points at the box first. Before that split the ring pointed straight
    // at a dead button and only the guided path could get past it.
    await press();
    await page.waitForFunction(
      () => !!document.querySelector('[data-testid="upgrade-consent-checkbox"] input:checked'),
      undefined,
      { timeout: 15_000 },
    );
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-testid="upgrade-confirm-submit"]')?.hasAttribute('disabled'),
      ),
      'once the terms are accepted the payment button must be live',
    ).toBe(false);
    // and wait for the tour itself to be standing on the confirm beat with a
    // control offered. Pressing into the moment between one step confirming and
    // the next arming is a press the director drops on the floor, by design.
    await page.waitForFunction(
      () =>
        JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === 6 &&
        !!document.querySelector('[data-testid="guide-spot-next"],[data-testid="guide-next"]'),
      undefined,
      { timeout: 15_000 },
    );

    // ── beat two: the visitor confirms, and the hand-off happens ──────────
    await page.evaluate((k) => sessionStorage.removeItem(k), MARKS_KEY);
    await press();

    // the beat is over when the tour has resumed on the invoice simulator
    await page.waitForFunction(
      () =>
        JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === 7 &&
        !!document.querySelector('app-world-sim-shell'),
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(1200); // let the paint observers flush

    const marks = await timeline(page);
    const at = (n: string): number | undefined => marks.find((m) => m.n === n)?.e;
    const t0 = marks[0]?.e ?? 0;
    const rel = (n: string): number | undefined => {
      const e = at(n);
      return e === undefined ? undefined : e - t0;
    };

    // eslint-disable-next-line no-console -- the timeline is the deliverable
    console.log(
      '\n  checkout timeline (ms from the press)\n' +
        marks
          .map(
            (m) =>
              `    ${String(m.e - t0).padStart(6)}  d${m.d}  ${m.n}${m.v === undefined ? '' : `  ${m.v}`}`,
          )
          .join('\n') +
        '\n',
    );

    // ── the sequence itself ────────────────────────────────────────────────
    const names = marks.map((m) => m.n);
    // No network assertion on purpose. The demo answers /subscription/consent
    // and /subscription/upgrade inside an Angular HttpInterceptor, so nothing
    // reaches fetch or XMLHttpRequest and no request is ever made — measured,
    // not assumed: the patches below record every /subscription/ call and this
    // timeline contains none. Against a real backend they would appear.
    expect(names, 'the plan must be written before the document is replaced').toContain(
      'storage.plan',
    );
    expect(names, 'the hand-off is a full document replacement').toContain('doc.pagehide');
    expect(names, 'the second document must report a contentful paint').toContain(
      'paint.first-contentful-paint',
    );
    expect(names, 'the new tier must end up on the card').toContain('dom.tierEnterprise');
    expect(
      new Set(marks.map((m) => m.d)).size,
      'the timeline must span the document boundary, not stop at the unload',
    ).toBeGreaterThan(1);

    // the plan is stored before the unload, or the reload would land nowhere
    const planAt = at('storage.plan');
    const hideAt = at('doc.pagehide');
    expect(planAt).toBeDefined();
    expect(hideAt).toBeDefined();
    expect(planAt!, 'the plan must be stored before the page goes away').toBeLessThan(hideAt!);

    // ── the two numbers this file exists for ──────────────────────────────
    const fcp = at('paint.first-contentful-paint');
    const tier = at('dom.tierEnterprise');
    const blankMs = hideAt !== undefined && fcp !== undefined ? fcp - hideAt : undefined;
    const tierRevealMs = fcp !== undefined && tier !== undefined ? tier - fcp : undefined;
    // eslint-disable-next-line no-console -- the whole point of the measurement
    console.log(
      `  confirmToClose (press → the checkout closes): ${String(rel('dom.dialogClosed'))}\n` +
        `  blankMs (pagehide → first contentful paint): ${String(blankMs)}\n` +
        `  tierRevealMs (paint → the card says ENTERPRISE): ${String(tierRevealMs)}\n` +
        `  total (confirm → the new tier on screen): ${String(rel('dom.tierEnterprise'))}\n` +
        '  (the checkout itself is no longer timed here: it stays open until the\n' +
        '   visitor confirms, which is the fix this beat was split for)\n',
    );

    // A reload in the middle of a guided tour is a deliberate design, but the
    // visitor should not be left looking at nothing for long.
    expect(blankMs, 'the hand-off must not leave the screen stale').toBeLessThanOrEqual(2500);

    // No budget on tierRevealMs yet, on purpose: today it is ~0 by
    // construction — the second document is painted with the new tier already
    // on it, which is exactly the "too instant" being investigated. The number
    // is printed so a decision about what the reveal should be can be made
    // against a measurement rather than an impression.
    expect(tierRevealMs, 'the tier reveal must be measurable at all').toBeDefined();
  });
});
