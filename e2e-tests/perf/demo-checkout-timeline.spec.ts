import { expect, test, type Page } from '@playwright/test';

/**
 * The checkout beat, event by event.
 *
 * Everything else in this tier asks business questions — did the step advance,
 * is the ring on its control. This one asks only technical ones, because the
 * complaint about this beat used to be that the new tier was simply *there*,
 * with no moment in which it arrived: the fixture stored the plan as the
 * checkout opened, the component reloaded the document, and the visitor saw
 * one page, a blink, and a different page.
 *
 * What happens now (2026-09-07): confirming closes the dialog and hops — no
 * document is replaced — and the beat that follows is Stripe Checkout,
 * simulated. Paying is what stores the plan (the completed-payment webhook)
 * and the plan page reads itself again. So the timeline this file draws is
 * ONE document from the confirm press to the new tier on the card, with the
 * purchase in the middle of it, and the numbers it exists for are:
 *   • confirmToClose — press → the dialog gone.
 *   • simRevealMs    — press → the checkout card on screen.
 *   • payToTierMs    — Pay → the card saying ENTERPRISE. Non-zero now, by
 *                      construction: there is a moment the tier arrives.
 *
 * The recorder is still installed with addInitScript and still stamps each
 * mark with an epoch comparable across documents — so that if a reload ever
 * comes back, it shows up here as a second document rather than as a hole.
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
    // the checkout card by name: `dom.simOpen` was spent on the inbox mail
    // three beats earlier, and `once` says a moment happens once
    if (document.querySelector('[data-testid="checkout-sim"]')) once('dom.checkoutOpen');
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

    // ── beat two: the visitor confirms, and the checkout arrives ──────────
    await page.evaluate((k) => sessionStorage.removeItem(k), MARKS_KEY);
    await press();
    // the beat is over when the tour is standing on the checkout simulator
    await page.waitForFunction(
      () =>
        JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === 7 &&
        !!document.querySelector('[data-testid="checkout-sim-pay"]') &&
        !!document.querySelector('[data-testid="guide-spot-next"],[data-testid="guide-next"]'),
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(600); // let the card finish arriving
    expect(
      await page.evaluate(() => sessionStorage.getItem('demoPlan')),
      'nothing may be bought by confirming — the checkout is where the purchase happens',
    ).toBeNull();

    // ── beat three: the visitor pays ──────────────────────────────────────
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      (w['__ckMark'] as (n: string) => void)?.('pay');
    });
    await press();
    // over when the tour has moved on to the invoice simulator
    await page.waitForFunction(
      () =>
        JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === 8 &&
        !!document.querySelector('[data-testid="fakturownia-sim-send"]'),
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
      '\n  checkout timeline (ms from the confirm press)\n' +
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
    // not assumed. Against a real backend they would appear.
    expect(names, 'confirming must close the dialog').toContain('dom.dialogClosed');
    expect(names, 'the checkout must arrive as a simulator card').toContain('dom.checkoutOpen');
    expect(names, 'paying must store the plan — the webhook the simulator plays').toContain(
      'storage.plan',
    );
    expect(names, 'the new tier must end up on the card').toContain('dom.tierEnterprise');
    expect(names, 'the hand-off must stay in this document — no reload, no flash').not.toContain(
      'doc.pagehide',
    );
    expect(
      new Set(marks.map((m) => m.d)).size,
      'one document from the confirm press to the new tier',
    ).toBe(1);

    // the purchase happens on Pay, not before: the plan is stored after that press
    const payAt = at('pay');
    const planAt = at('storage.plan');
    const tierAt = at('dom.tierEnterprise');
    expect(payAt).toBeDefined();
    expect(planAt).toBeDefined();
    expect(tierAt).toBeDefined();
    expect(
      planAt!,
      'the plan is stored by the Pay press, not by opening the checkout',
    ).toBeGreaterThanOrEqual(payAt!);
    expect(tierAt!, 'the card changes only once the plan is stored').toBeGreaterThanOrEqual(
      planAt!,
    );

    // ── the numbers this file exists for ──────────────────────────────────
    const confirmToClose = rel('dom.dialogClosed');
    const simRevealMs = rel('dom.checkoutOpen');
    const payToTierMs = tierAt! - payAt!;
    // eslint-disable-next-line no-console -- the whole point of the measurement
    console.log(
      `  confirmToClose (press → the checkout dialog closes): ${String(confirmToClose)}\n` +
        `  simRevealMs (press → the Stripe card on screen): ${String(simRevealMs)}\n` +
        `  payToTierMs (Pay → the card says ENTERPRISE): ${String(payToTierMs)}\n`,
    );
    expect(confirmToClose, 'the dialog must go promptly').toBeLessThanOrEqual(1500);
    expect(simRevealMs, 'the checkout must arrive promptly').toBeLessThanOrEqual(2500);
    expect(payToTierMs, 'the new tier must follow the payment promptly').toBeLessThanOrEqual(2500);
  });
});
