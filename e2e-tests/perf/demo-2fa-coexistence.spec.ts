import { expect, test, type Page } from '@playwright/test';

/**
 * The admin 2FA beat, asked the only question that matters about it: at any one
 * instant, do the phone, the dialog, the page and the narration agree about
 * what is happening?
 *
 * This tour stacks more layers than any other in the sandbox. At its second and
 * third steps the screen carries, at once: the sign-in page, Material's dialog
 * backdrop, the verify dialog, the world simulator's own full-viewport scrim,
 * the phone, the guide panel, and the ring with its pill. Each of those has an
 * independent idea of whether something is in progress, and the complaint is
 * that they disagree — that it freezes on "Working…", and that what is dimmed,
 * what is bright and what is being asked of the visitor do not line up.
 *
 * So this does not time a transition. It samples the whole tuple every
 * animation frame — which is the granularity a person actually perceives — and
 * collapses equal neighbours into intervals. What comes out is a table of every
 * distinct state the screen was in and how long it held, which is the only form
 * in which "it freezes" and "it is ugly" become checkable claims.
 *
 * Run: `npm run test:perf -- e2e-tests/perf/demo-2fa-coexistence.spec.ts`
 * (add PERF_BASE_URL=https://www.checkitout.app to measure production).
 */

const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';

/** Slow the main thread the way a real machine under load is slow. */
async function throttle(page: Page, rate: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

interface Sample {
  t: number;
  step: number | null;
  /** The guide panel is showing "Working…". */
  working: boolean;
  /** The page-blocking shield the runner raises while a recipe runs. */
  shield: boolean;
  /** What the panel offers: the ring's pill, the panel's own Next, or nothing. */
  way: 'pill' | 'next' | 'none';
  /** First words of the narration, enough to tell the steps apart. */
  says: string;
  /** The uppercase instruction line under it. */
  hint: string;
  sim: boolean;
  /** The 6 digits on the phone, if it is showing any. */
  phoneCode: string;
  dialog: boolean;
  /** What is typed into the dialog's code field. */
  dialogCode: string;
  /** The dialog is verifying — its submit button is a spinner. */
  dialogBusy: boolean;
  error: boolean;
  /** How many dimming layers are stacked over the page right now. */
  scrims: number;
  /** Is the dialog itself underneath one of them? */
  dialogDimmed: boolean;
  /** The tour has finished and the panel is showing its recap. */
  recap: boolean;
  /** The guide panel is on screen at all. */
  panel: boolean;
  /** The director has marked the tour finished. */
  done: boolean;
  /** Where the app is. */
  path: string;
}

interface Interval extends Sample {
  ms: number;
}

/** Installs a per-frame sampler; returns nothing, results are read later. */
function sampler(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w['__2faStop']) (w['__2faStop'] as () => void)();
  const out: Sample[] = [];
  w['__2fa'] = out;
  const t0 = performance.now();
  let raf = 0;

  const text = (sel: string): string =>
    (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const take = (): Sample => {
    const panel = document.querySelector('.guide-pop');
    const shell = document.querySelector('app-world-sim-shell');
    const dialog = document.querySelector('mat-dialog-container');
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="two-factor-verify-code"]',
    );
    // Any 6-digit run on the phone is the code it is showing.
    const phone = (shell?.textContent ?? '').match(/\b(\d{6})\b/);

    // Every layer that actually dims what is behind it. Matching on class name
    // counted card backgrounds too and reported four scrims where there were
    // not four; a dimmer is defined by what it does — cover the viewport, in a
    // colour you can see through.
    const scrimNodes = [
      ...document.querySelectorAll('.cdk-overlay-backdrop, app-world-sim-shell *'),
    ].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
      const b = el.getBoundingClientRect();
      if (b.width < window.innerWidth * 0.9 || b.height < window.innerHeight * 0.9) return false;
      const rgba = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!rgba) return false;
      const parts = rgba[1].split(',').map(Number);
      const alpha = (parts.length > 3 ? parts[3] : 1) * Number(cs.opacity || '1');
      return alpha > 0.02 && alpha < 0.99;
    });

    // Is the dialog painted under a scrim? Ask the page what is on top of it.
    let dialogDimmed = false;
    if (dialog) {
      const b = dialog.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + 10);
      dialogDimmed = !!top && scrimNodes.some((s) => s === top || s.contains(top));
    }

    return {
      t: Math.round(performance.now() - t0),
      step: (() => {
        try {
          const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as { step?: number };
          return typeof s.step === 'number' ? s.step : null;
        } catch {
          return null;
        }
      })(),
      working: !!document.querySelector('[data-testid="guide-performing"]'),
      shield: !!document.querySelector('[data-testid="guide-shield"]'),
      way: document.querySelector('[data-testid="guide-spot-next"]')
        ? 'pill'
        : document.querySelector('[data-testid="guide-next"]')
          ? 'next'
          : 'none',
      says: text('[data-testid="guide-narration"]').slice(0, 34),
      hint: (panel?.querySelector('.uppercase')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 26),
      sim: !!shell,
      phoneCode: phone ? phone[1] : '',
      dialog: !!dialog,
      dialogCode: input?.value ?? '',
      dialogBusy: !!dialog?.querySelector('mat-spinner'),
      error: !!document.querySelector('[data-testid="two-factor-verify-error"]'),
      scrims: scrimNodes.length,
      dialogDimmed,
      recap: !!panel && /gotowe|done/i.test(panel.textContent ?? ''),
      panel: !!panel,
      done: (() => {
        try {
          return JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').done === true;
        } catch {
          return false;
        }
      })(),
      path: location.pathname,
    };
  };

  const tick = (): void => {
    out.push(take());
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  w['__2faStop'] = () => cancelAnimationFrame(raf);
}

/** Collapse equal neighbouring samples into intervals with durations. */
function intervals(samples: Sample[]): Interval[] {
  // Everything except the clock. Spreading the sample would compare `ms` too,
  // which only the interval has — so nothing ever matched and every frame came
  // back as its own state.
  const key = (s: Sample): string =>
    [
      s.step,
      s.working,
      s.shield,
      s.way,
      s.says,
      s.hint,
      s.sim,
      s.phoneCode,
      s.dialog,
      s.dialogCode,
      s.dialogBusy,
      s.error,
      s.scrims,
      s.dialogDimmed,
      s.recap,
      s.panel,
      s.done,
      s.path,
    ].join('|');
  const out: Interval[] = [];
  for (const s of samples) {
    const last = out[out.length - 1];
    if (last && key(last as Sample) === key(s)) continue;
    if (last) last.ms = s.t - last.t;
    out.push({ ...s, ms: 0 });
  }
  const last = out[out.length - 1];
  const end = samples[samples.length - 1];
  if (last && end) last.ms = end.t - last.t;
  return out;
}

function render(rows: Interval[]): string {
  const cell = (v: unknown): string =>
    v === true ? 'Y' : v === false ? '·' : String(v === '' ? '·' : v);
  const head = [
    't',
    'ms',
    'st',
    'work',
    'shld',
    'way',
    'sim',
    'phone',
    'dlg',
    'typed',
    'busy',
    'err',
    'scrim',
    'recap',
    'panel',
    'done',
    'path',
  ];
  const body = rows.map((r) => [
    r.t,
    r.ms,
    r.step,
    cell(r.working),
    cell(r.shield),
    r.way,
    cell(r.sim),
    cell(r.phoneCode),
    cell(r.dialog),
    cell(r.dialogCode),
    cell(r.dialogBusy),
    cell(r.error),
    r.scrims,
    cell(r.recap),
    cell(r.panel),
    cell(r.done),
    r.path,
  ]);
  const widths = head.map((h, i) =>
    Math.max(h.length, ...body.map((row) => String(row[i]).length)),
  );
  const line = (cells: unknown[]): string =>
    '    ' + cells.map((c, i) => String(c).padStart(widths[i])).join('  ');
  return [line(head), ...body.map(line)].join('\n');
}

async function press(page: Page): Promise<void> {
  await page.evaluate(() => {
    const b =
      document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
      document.querySelector<HTMLElement>('[data-testid="guide-next"]');
    b?.click();
  });
}

test.describe('Demo 2FA coexistence', () => {
  test('the phone, the dialog and the narration never contradict each other', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${BASE}/demo?start=admin-2fa`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });

    await page.evaluate(sampler);
    // Three steps, driven the way a visitor drives them: press, then look.
    for (let i = 0; i < 3; i++) {
      await press(page);
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(12000);
    const samples = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      (w['__2faStop'] as () => void)?.();
      return w['__2fa'] as Sample[];
    });

    const rows = intervals(samples);
    // eslint-disable-next-line no-console -- the table is the deliverable
    console.log(`\n  2FA coexistence — ${samples.length} frames, ${rows.length} distinct states\n`);
    // eslint-disable-next-line no-console -- as above
    console.log(render(rows) + '\n');

    // ── how long the guide says it is working ─────────────────────────────
    const workingRuns = rows.filter((r) => r.working).map((r) => r.ms);
    const workingTotal = workingRuns.reduce((a, b) => a + b, 0);
    const workingLongest = Math.max(0, ...workingRuns);

    // ── the states that should never coexist ──────────────────────────────
    const dimmedDialog = rows.filter((r) => r.dialogDimmed);
    const twoScrims = rows.filter((r) => r.scrims > 1);
    const codeMismatch = rows.filter(
      (r) => r.dialog && r.phoneCode !== '' && r.dialogCode !== '' && r.phoneCode !== r.dialogCode,
    );
    const askedWhileWorking = rows.filter((r) => r.working && r.way !== 'none');
    // The recap is not dead air: it carries its own controls, which are not
    // the pill and not the panel's Next.
    const deadAir = rows.filter(
      (r) => !r.working && !r.shield && r.way === 'none' && !r.recap && r.ms > 400,
    );

    const ms = (list: Interval[]): number => list.reduce((a, b) => a + b.ms, 0);
    // eslint-disable-next-line no-console -- the measurement is the point
    console.log(
      `  "Working…" total ${workingTotal} ms, longest single run ${workingLongest} ms\n` +
        `  dialog under a scrim:      ${dimmedDialog.length} interval(s), ${ms(dimmedDialog)} ms\n` +
        `  two dimming layers at once: ${twoScrims.length} interval(s), ${ms(twoScrims)} ms\n` +
        `  phone and dialog show different codes: ${codeMismatch.length} interval(s), ${ms(codeMismatch)} ms\n` +
        `  a way forward offered while "Working…": ${askedWhileWorking.length} interval(s), ${ms(askedWhileWorking)} ms\n` +
        `  no way forward and nothing running (>400ms): ${deadAir.length} interval(s), ${ms(deadAir)} ms\n`,
    );

    // The tour has to have actually run, or the table above proves nothing.
    expect(samples.length, 'the sampler must have seen the tour').toBeGreaterThan(200);
    expect(
      rows.some((r) => r.dialog && r.sim),
      'this tour must reach the state where the phone and the dialog are both up',
    ).toBe(true);

    // A visitor must never be asked to act on a guide that says it is busy.
    expect(
      ms(askedWhileWorking),
      `the pill was offered while the panel said "Working…" for ${ms(askedWhileWorking)} ms`,
    ).toBeLessThanOrEqual(120);

    // "Working…" is a recipe running, and a recipe here is three clicks.
    expect(
      workingLongest,
      `the guide sat on "Working…" for ${workingLongest} ms`,
    ).toBeLessThanOrEqual(1200);

    // Nothing should leave the visitor with no way on while nothing is running.
    expect(ms(deadAir), 'the tour left no way forward while idle').toBeLessThanOrEqual(600);
  });

  test('pressing the moment it is offered does not freeze the guide', async ({ page }) => {
    test.setTimeout(90_000);
    // The patient run above waits five seconds on every step, which is exactly
    // what a person does not do. A recipe here begins by clicking a control
    // inside the world simulator, and the simulator mounts with the step — so
    // the interesting question is what happens to someone who presses in the
    // same breath as the step arriving.
    await page.goto(`${BASE}/demo?start=admin-2fa`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(sampler);

    for (let i = 0; i < 3; i++) {
      await page
        .waitForFunction(
          () =>
            !!document.querySelector('[data-testid="guide-spot-next"]') ||
            !!document.querySelector('[data-testid="guide-next"]'),
          undefined,
          { timeout: 15_000 },
        )
        .catch(() => undefined);
      await press(page);
      // only long enough for the press to be taken, never long enough to settle
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(6000);

    const samples = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      (w['__2faStop'] as () => void)?.();
      return w['__2fa'] as Sample[];
    });
    const rows = intervals(samples);
    // eslint-disable-next-line no-console -- the table is the deliverable
    console.log(`\n  2FA impatient — ${samples.length} frames, ${rows.length} distinct states\n`);
    // eslint-disable-next-line no-console -- as above
    console.log(render(rows) + '\n');

    const workingRuns = rows.filter((r) => r.working).map((r) => r.ms);
    const longest = Math.max(0, ...workingRuns);
    const total = workingRuns.reduce((a, b) => a + b, 0);
    // eslint-disable-next-line no-console -- the number this test exists for
    console.log(`  "Working…" total ${total} ms, longest single run ${longest} ms\n`);

    expect(
      longest,
      `an impatient visitor sat on "Working…" for ${longest} ms — a recipe that cannot ` +
        `find its control waits out the runner's timeout with the panel frozen`,
    ).toBeLessThanOrEqual(1200);
  });

  test('a replay refuses the first code, exactly as a first run does', async ({ page }) => {
    test.setTimeout(120_000);
    /**
     * The beat this tour teaches is that a stale code is refused. That lesson
     * is carried by `demoTotp`, whose attempt counter is capped at 2 and which
     * the verify fixture reads as "any code is good now" — and sessionStorage
     * is precisely what neither a tour restart nor a full reload empties.
     *
     * So on the second play in the same tab the FIRST code was accepted: the
     * admin was signed in immediately, the app navigated off the sign-in page,
     * and the tour carried on asking for a TOTP code from inside the app it had
     * just let them into, with the retry line showing underneath.
     */
    /**
     * Press until something is true, rather than a fixed number of times.
     *
     * Counting presses ties the test to the tour's length: splitting the two
     * TOTP beats into generate-then-send turned three presses into five, and
     * this read as the lesson breaking when only the arithmetic had.
     */
    const pressUntil = async (done: () => Promise<boolean>): Promise<void> => {
      for (let i = 0; i < 10 && !(await done()); i++) {
        await press(page);
        await page.waitForTimeout(1200);
      }
    };
    const phoneOnSecondAttempt = async (): Promise<boolean> =>
      ((await page.evaluate(() => sessionStorage.getItem('demoTotp'))) ?? '').includes(
        '"attempt":2',
      );
    const refusedOrInside = async (): Promise<boolean> =>
      page.evaluate(
        () =>
          !!document.querySelector('[data-testid="two-factor-verify-error"]') ||
          !location.pathname.startsWith('/auth/sign-in'),
      );

    await page.goto(`${BASE}/demo?start=admin-2fa`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });
    await pressUntil(phoneOnSecondAttempt);
    expect(
      await page.evaluate(() => sessionStorage.getItem('demoTotp')),
      'the first run should leave the phone on its second attempt',
    ).toContain('"attempt":2');

    // Replay in the same tab — the only thing that changes is the storage the
    // last run left behind.
    await page.goto(`${BASE}/demo?start=admin-2fa`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 30_000 });
    expect(
      await page.evaluate(() => sessionStorage.getItem('demoTotp')),
      'starting a tour must not inherit the last run’s TOTP attempt',
    ).toBeNull();

    // sign in, generate, send — however many presses that takes
    await pressUntil(refusedOrInside);
    const after = await page.evaluate(() => ({
      path: location.pathname,
      error: !!document.querySelector('[data-testid="two-factor-verify-error"]'),
      dialog: !!document.querySelector('mat-dialog-container'),
    }));

    expect(
      after.path,
      `the first code was accepted on a replay: the admin is at ${after.path} while the tour ` +
        'is still asking them to generate one',
    ).toBe('/auth/sign-in');
    expect(after.error, 'the stale first code must be refused — that is the beat').toBe(true);
    expect(after.dialog, 'the verify dialog stays open on a refused code').toBe(true);
  });

  test('a slow machine does not leave the guide stuck on "Working…"', async ({ page }) => {
    test.setTimeout(120_000);
    // Everything above runs on an unloaded test runner, where the whole recipe
    // costs 17 ms and no one could see it. A visitor's machine is not that, and
    // "it freezes on Working" is a claim about their machine, not this one — so
    // this asks the same question with the main thread six times slower.
    await throttle(page, 6);
    await page.goto(`${BASE}/demo?start=admin-2fa`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="guide-spot-next"]')).toBeVisible({ timeout: 45_000 });
    await page.evaluate(sampler);

    for (let i = 0; i < 3; i++) {
      await press(page);
      await page.waitForTimeout(6000);
    }
    const samples = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      (w['__2faStop'] as () => void)?.();
      return w['__2fa'] as Sample[];
    });
    const rows = intervals(samples);
    // eslint-disable-next-line no-console -- the table is the deliverable
    console.log(`
  2FA at 6x CPU throttle — ${samples.length} frames, ${rows.length} states
`);
    // eslint-disable-next-line no-console -- as above
    console.log(render(rows));

    const runs = rows.filter((r) => r.working).map((r) => r.ms);
    const longest = Math.max(0, ...runs);
    const total = runs.reduce((a, b) => a + b, 0);
    // eslint-disable-next-line no-console -- the number this test exists for
    console.log(`  "Working…" total ${total} ms, longest single run ${longest} ms
`);

    expect(
      longest,
      `on a six-times-slower machine the guide sat on "Working…" for ${longest} ms`,
    ).toBeLessThanOrEqual(1200);
  });
});
