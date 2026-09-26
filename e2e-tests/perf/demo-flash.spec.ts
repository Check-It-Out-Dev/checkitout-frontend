import { expect, test, type Page } from '@playwright/test';

/**
 * E-FLASH, swept across every tour: is anything the visitor is supposed to read
 * on screen for less time than reading it takes?
 *
 * The checkout dialog was. It carried the plan, the price, the terms and a
 * consent box — the entire commercial content of an upgrade — and it existed
 * for 101 ms, because opening it and confirming it were three clicks inside one
 * recipe. Nobody reads a price in a tenth of a second. That was found by hand,
 * in one beat; this asks the same question of every dialog, error, snackbar and
 * retry line in the sandbox.
 *
 * The rule being checked is deliberately weak, because the strong version is a
 * product decision and this is a floor:
 *
 *   **a transient carrying more than a few words must either still be there
 *   when the visitor acts, or live long enough to be read.**
 *
 * "Long enough" is 200 words per minute — unhurried adult reading — with a
 * one-second floor for noticing it at all. Something that outlives the walk is
 * not a flash by definition: it waited for the visitor, which is the point.
 *
 * Run: `npm run test:perf -- e2e-tests/perf/demo-flash.spec.ts`
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

/** Things that appear to tell the visitor something and then go away. */
const TRANSIENTS = [
  'mat-dialog-container',
  'mat-snack-bar-container',
  '.mat-mdc-snack-bar-container',
  '[role="alert"]',
  '[data-testid$="-error"]',
  '[data-testid="guide-retry"]',
].join(', ');

interface Flash {
  what: string;
  words: number;
  ms: number;
  /** Still on screen when the walk ended — it waited, so it is not a flash. */
  open: boolean;
  /**
   * True when the visitor pressed something between this appearing and this
   * going away — so it went away because they acted on it, not on its own.
   *
   * Without this the sweep measures how fast the walker presses. Three of the
   * four things it first called "too fast to read" were dialogs that were
   * patiently waiting for a press and got one 400 ms later, because an
   * automated walk never pauses to read anything.
   */
  answered: boolean;
  text: string;
}

/** Watches the transients appear and disappear; reinstalled on every document. */
function watcher(selectors: string): void {
  const w = window as unknown as Record<string, unknown>;
  if (w['__flashOn']) return;
  w['__flashOn'] = true;

  const seen = new Map<
    Element,
    { at: number; press: number; words: number; text: string; what: string }
  >();
  /** How many times the walk has pressed something. Survives the reload. */
  const presses = (): number => {
    try {
      return Number(sessionStorage.getItem('__presses') ?? '0');
    } catch {
      return 0;
    }
  };
  const done: Flash[] = [];
  // Carried across the checkout's full page reload, like every other
  // cross-document measurement here.
  const KEY = '__flashes';
  /**
   * Hand the buffer to storage and empty it. Writing `done` wholesale looked
   * equivalent and was not: after the checkout's reload the new document
   * starts with an empty buffer, so the first thing to disappear there
   * overwrote everything measured before the reload — losing exactly the beat
   * this sweep was built for.
   */
  const save = (): void => {
    try {
      const prior = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Flash[];
      sessionStorage.setItem(KEY, JSON.stringify([...prior, ...done]));
      done.length = 0;
    } catch {
      /* never let the instrument break what it measures */
    }
  };

  const describe = (el: Element): { words: number; text: string; what: string } => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      words: text ? text.split(' ').length : 0,
      text: text.slice(0, 60),
      what: el.getAttribute('data-testid') ?? el.tagName.toLowerCase(),
    };
  };

  const tick = (): void => {
    const now = performance.timeOrigin + performance.now();
    const present = new Set(document.querySelectorAll(selectors));
    for (const el of present) {
      if (!seen.has(el)) seen.set(el, { at: now, press: presses(), ...describe(el) });
    }
    for (const [el, first] of seen) {
      if (present.has(el)) continue;
      // it went away — record how long it was readable for
      done.push({
        what: first.what,
        words: first.words,
        ms: Math.round(now - first.at),
        open: false,
        answered: presses() !== first.press,
        text: first.text,
      });
      seen.delete(el);
      save();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // whatever is still up when the walk ends waited for the visitor
  w['__flashFinish'] = (): Flash[] => {
    const now = performance.timeOrigin + performance.now();
    const stillOpen: Flash[] = [...seen.entries()].map(([, f]) => ({
      what: f.what,
      words: f.words,
      ms: Math.round(now - f.at),
      open: true,
      answered: presses() !== f.press,
      text: f.text,
    }));
    let earlier: Flash[] = [];
    try {
      earlier = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Flash[];
    } catch {
      earlier = [];
    }
    // `done` holds only what save() has not flushed yet, so this cannot
    // double-count.
    return [...earlier, ...done, ...stillOpen];
  };
}

/** Unhurried reading, with a floor for noticing the thing at all. */
function readableMs(words: number): number {
  return Math.max(1000, Math.round((words / 200) * 60_000));
}

async function press(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      // stamped before the click, so anything closed BY the click is seen to
      // have been answered rather than to have vanished on its own
      try {
        sessionStorage.setItem(
          '__presses',
          String(Number(sessionStorage.getItem('__presses') ?? '0') + 1),
        );
      } catch {
        /* the count is a nicety, not the measurement */
      }
      const b =
        document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
        document.querySelector<HTMLElement>('[data-testid="guide-next"]');
      b?.click();
    })
    .catch(() => undefined);
}

interface Where {
  step: number | undefined;
  done: boolean;
}

async function where(page: Page): Promise<Where> {
  return page
    .evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
      };
      return { step: s.step, done: s.done === true };
    })
    .catch(() => ({ step: undefined, done: false }));
}

/**
 * Wait for the beat to actually turn over rather than guessing how long it
 * takes. A fixed 2.6 s under-waits every recipe deep enough to need two
 * element lookups, so the walk pressed into a busy page and half the tours
 * never reached their last beats — the sweep then reported on transients it
 * had never got as far as.
 */
async function turned(page: Page, from: number | undefined): Promise<Where> {
  const deadline = Date.now() + 20_000;
  let at = await where(page);
  while (Date.now() < deadline && !at.done && at.step === from) {
    await page.waitForTimeout(250);
    at = await where(page);
  }
  return at;
}

test.describe('Nothing flashes past', () => {
  test('no tour shows something to read and takes it away too soon', async ({ page }) => {
    test.setTimeout(420_000);
    await page.addInitScript(watcher, TRANSIENTS);

    const all: (Flash & { tour: string })[] = [];

    for (const tour of TOURS) {
      await page.goto(`${BASE}/demo?start=${tour}`, { waitUntil: 'networkidle' });
      await expect(
        page.locator('[data-testid="guide-spot-next"], [data-testid="guide-next"]').first(),
      ).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => {
        sessionStorage.removeItem('__flashes');
        sessionStorage.removeItem('__presses');
      });

      for (let i = 0, at = await where(page); i < 14 && !at.done; i++) {
        const from = at.step;
        await press(page);
        at = await turned(page, from);
        // a transient that outlives its beat is still being read; give it the
        // moment the visitor would take before pressing on
        await page.waitForTimeout(400);
        if (at.step === from && !at.done) break; // held — nothing more to walk
      }

      const flashes = await page
        .evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          return (w['__flashFinish'] as () => Flash[])?.() ?? [];
        })
        .catch(() => [] as Flash[]);
      all.push(...flashes.map((f) => ({ ...f, tour })));
    }

    const rows = all
      .filter((f) => f.words > 0)
      .sort((a, b) => a.ms - b.ms)
      .map(
        (f) =>
          `    ${String(f.ms).padStart(6)} ms  ${String(f.words).padStart(3)}w  ` +
          `${f.open ? 'waited  ' : f.answered ? 'answered' : 'vanished'}  ` +
          `${f.tour}/${f.what}  "${f.text}"`,
      );
    // eslint-disable-next-line no-console -- the table is the deliverable
    console.log(`\n  every transient the seven tours showed\n${rows.join('\n')}\n`);

    // Anything with real content that went away on its own before it could be
    // read. Answered and still-open ones waited for the visitor, which is the
    // whole point of them.
    const tooFast = all.filter(
      (f) => !f.open && !f.answered && f.words >= 8 && f.ms < readableMs(f.words),
    );
    // eslint-disable-next-line no-console -- as above
    console.log(
      tooFast.length
        ? `  too fast to read: ${tooFast.map((f) => `${f.tour}/${f.what} ${f.ms}ms/${f.words}w`).join(', ')}\n`
        : '  nothing vanished before it could be read\n',
    );

    expect(all.length, 'the walk should have seen at least one transient').toBeGreaterThan(0);
    expect(
      tooFast.map((f) => `${f.tour}/${f.what} showed ${f.words} words for ${f.ms}ms`),
      'a visitor cannot read what is already gone',
    ).toEqual([]);
  });

  /**
   * The instrument, falsified. Six of the first eight findings in this sweep's
   * methodology were the measurement rather than the application, so "nothing
   * flashed" is only worth reading once this has shown that something flashing
   * would have been caught. A real transient is planted — same selector, real
   * words, gone in 150 ms — and the sweep has to name it.
   */
  test('the sweep can see a flash', async ({ page }) => {
    await page.addInitScript(watcher, TRANSIENTS);
    await page.goto(`${BASE}/demo?start=support-ticket`, { waitUntil: 'networkidle' });
    await expect(
      page.locator('[data-testid="guide-spot-next"], [data-testid="guide-next"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      sessionStorage.removeItem('__flashes');
      sessionStorage.removeItem('__presses');
    });

    await page.evaluate(() => {
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      el.setAttribute('data-testid', 'planted-flash');
      el.textContent =
        'Your Enterprise plan starts today and renews every month until you cancel it here.';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 150);
    });
    await page.waitForTimeout(1200);

    const seen = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return (w['__flashFinish'] as () => Flash[])?.() ?? [];
    });
    const planted = seen.find((f) => f.what === 'planted-flash');

    expect(planted, 'a 150 ms alert must be recorded at all').toBeTruthy();
    expect(planted!.open, 'it went away, so it is not something that waited').toBe(false);
    expect(planted!.answered, 'nothing was pressed, so nobody answered it').toBe(false);
    expect(planted!.words, 'its words must be counted, or the budget means nothing').toBe(14);
    expect(planted!.ms, 'and its lifetime measured, not guessed').toBeLessThan(600);
    expect(
      planted!.ms < readableMs(planted!.words),
      'the rule must call a 150 ms sentence too fast to read',
    ).toBe(true);
  });
});
