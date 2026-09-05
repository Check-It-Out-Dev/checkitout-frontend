/**
 * Walking a guided tour, done once.
 *
 * Four sweeps drive the tours the same way — press the way forward, wait for
 * the beat to turn over, look at what is on screen — and each of them grew its
 * own copy of that loop. Each copy then made the same two mistakes: guessing
 * how long a recipe takes (T23), and pressing again the instant the step index
 * changed, before the next beat's control had been mounted. The second one is
 * the more expensive, because it does not look like a mistake: the press lands
 * on nothing, the step never moves, and the sweep reports the tour as stuck.
 *
 * `company-campaign` step 0 ends with a route change to the applicants list.
 * The step index is persisted the moment the tour advances; the list arrives
 * later. Two separate sweeps concluded the tour was broken there, on the same
 * day, for that reason alone.
 *
 * So the loop lives here, once, and every sweep waits for the same three
 * things: the beat turned over, something is pressable, and the ring has
 * stopped moving.
 */
import { expect, type Page } from '@playwright/test';

export const BASE = process.env['PERF_BASE_URL'] ?? 'http://localhost:4300';

export const TOURS = [
  'admin-2fa',
  'stepup-email',
  'company-campaign',
  'influencer-collab',
  'nip-to-ksef',
  'support-ticket',
  'admin-ops',
] as const;

export type Tour = (typeof TOURS)[number];

/** The longest any single beat may take before the walk gives up on it. */
export const GIVE_UP_MS = 20_000;

export interface Beat {
  step: number | undefined;
  done: boolean;
  path: string;
  /** `data-testid` of the control the ring is drawn around, if any. */
  ring: string | null;
  /** The retry line — the guide saying the step did not confirm. */
  stalled: boolean;
  /** What the panel is currently saying, trimmed. */
  narration: string;
  /** Which way forward is on offer. */
  way: 'pill' | 'next' | 'none';
}

/**
 * Where the tour is right now.
 *
 * The ring is found by its inset rather than by consulting the registry: it is
 * drawn 6 px outside the control it points at, so the control is whichever
 * testid'd element sits at that offset. A sweep that carried its own copy of
 * the step list would drift from the registry the first time a step was split.
 */
export async function beat(page: Page): Promise<Beat> {
  return page
    .evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
      };
      let ring: string | null = null;
      const r = document.querySelector('[data-testid="guide-spotlight"]');
      if (r) {
        const b = r.getBoundingClientRect();
        // Where the ring is drawn is asked of `__drawnBox`, installed by
        // `open()`. It used to be recomputed here, and that made four copies of
        // one rule across the tier; the rule then moved twice in a day and each
        // time a copy was left behind — the smoothness budgets called a correct
        // ring 48 px of drift, the phantom sweep silently halved its coverage,
        // and this walk stopped being able to see a field at all. The fallback
        // is the raw rectangle, for a page that navigated without `open()`; it
        // resolves plain controls and misses fields, which is the old behaviour
        // and is better than throwing.
        const drawn =
          (window as unknown as Record<string, ((el: Element) => DOMRect) | undefined>)[
            '__drawnBox'
          ] ?? ((el: Element): DOMRect => el.getBoundingClientRect());
        for (const el of document.querySelectorAll('[data-testid]')) {
          const e = drawn(el);
          if (
            e.width > 0 &&
            Math.abs(e.left - (b.left + 6)) < 3 &&
            Math.abs(e.top - (b.top + 6)) < 3
          ) {
            ring = el.getAttribute('data-testid');
            break;
          }
        }
      }
      return {
        step: s.step,
        done: s.done === true,
        path: location.pathname,
        ring,
        stalled: !!document.querySelector('[data-testid="guide-retry"]'),
        narration: (document.querySelector('[data-testid="guide-narration"]')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
        way: document.querySelector('[data-testid="guide-spot-next"]')
          ? ('pill' as const)
          : document.querySelector('[data-testid="guide-next"]')
            ? ('next' as const)
            : ('none' as const),
      };
    })
    .catch(() => ({
      step: undefined,
      done: false,
      path: '?',
      ring: null,
      stalled: false,
      narration: '',
      way: 'none' as const,
    }));
}

/** Open a tour and wait for its first way forward. */
export async function open(page: Page, tour: string): Promise<void> {
  await installRingRule(page);
  await page.goto(`${BASE}/demo?start=${tour}`, { waitUntil: 'networkidle' });
  await expect(
    page.locator('[data-testid="guide-spot-next"], [data-testid="guide-next"]').first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Press whichever way forward the guide is offering. */
export async function press(page: Page): Promise<void> {
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
 * Wait for the ring and the pill to hold still.
 *
 * They are positioned per frame during a scroll, so a fixed pause either reads
 * them mid-flight or wastes the difference. Two identical readings mean they
 * have landed.
 */
export async function still(page: Page, ms = 6000): Promise<void> {
  const deadline = Date.now() + ms;
  let last = '';
  let same = 0;
  while (Date.now() < deadline && same < 2) {
    const now = await page
      .evaluate(() => {
        const box = (sel: string): string => {
          const b = document.querySelector(sel)?.getBoundingClientRect();
          return b ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}` : '-';
        };
        return `${box('[data-testid="guide-spotlight"]')}|${box('[data-testid="guide-spot-next"]')}`;
      })
      .catch(() => '');
    same = now && now === last ? same + 1 : 0;
    last = now;
    if (same < 2) await page.waitForTimeout(150);
  }
}

/**
 * Wait until the tour is ready to be driven again: something to press, and the
 * furniture holding still. Without this a sweep presses into the gap between a
 * step being persisted and its screen arriving, and reports the tour as stuck.
 */
export async function ready(page: Page): Promise<Beat> {
  const deadline = Date.now() + GIVE_UP_MS;
  let at = await beat(page);
  while (Date.now() < deadline && !at.done && at.way === 'none') {
    await page.waitForTimeout(200);
    at = await beat(page);
  }
  if (!at.done) await still(page);
  return beat(page);
}

/**
 * Wait for the beat to turn over — a new step, the recap, or the guide saying
 * it did not confirm — then for the next beat to be ready to drive.
 */
export async function turned(page: Page, from: number | undefined): Promise<Beat> {
  const deadline = Date.now() + GIVE_UP_MS;
  let at = await beat(page);
  while (Date.now() < deadline && !at.done && at.step === from && !at.stalled) {
    await page.waitForTimeout(200);
    at = await beat(page);
  }
  // The retry line can be painted a frame before the state settles; give it one
  // more look before taking a stall as the verdict.
  if (at.stalled && at.step === from) {
    await page.waitForTimeout(600);
    at = await beat(page);
    if (at.step === from && !at.done) return at;
  }
  return at.done ? at : ready(page);
}

/**
 * The rectangle a control actually shows in: its own box, cut down by the
 * nearest ancestor that clips overflow and by the window.
 *
 * Injected as source rather than imported, because `page.evaluate` sends only
 * the function it is given — anything that function calls has to already be in
 * the page. The rule is the guide's own (`guide-spotlight.component.ts`,
 * `clipper`), deliberately recomputed here instead of asked for: an instrument
 * that takes the component's word for where it is cannot catch the component
 * being wrong.
 *
 * Two budgets encode "the ring is drawn 6 px outside its control" and both
 * broke the day the ring learned to stop at the edge of a scrolling card. The
 * contract they check is now: the ring surrounds the VISIBLE part of its
 * control.
 */
export const INSTALL_VISIBLE_BOX = `
window.__visibleBox = (el) => {
  const b = el.getBoundingClientRect();
  let clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let n = el.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
      const c = n.getBoundingClientRect();
      clip = {
        left: Math.max(clip.left, c.left),
        top: Math.max(clip.top, c.top),
        right: Math.min(clip.right, c.right),
        bottom: Math.min(clip.bottom, c.bottom),
      };
      break;
    }
  }
  const left = Math.max(b.left, clip.left);
  const top = Math.max(b.top, clip.top);
  const right = Math.min(b.right, clip.right);
  const bottom = Math.min(b.bottom, clip.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

// The element the ring will actually surround, given the element a step names.
// A step points at a field by its input's testid, because that is what a recipe
// can type into; the guide rings the outlined wrapper around it, which starts
// 16 px higher. Same rule as guide-spotlight.component.ts, recomputed here.
window.__ringed = (el) => el.closest('.mat-mdc-text-field-wrapper, mat-form-field') || el;

// The two composed: the rectangle the ring is actually drawn around, given the
// element a step names. This is the whole rule, and it is the only copy of it
// in the tier. Every instrument that asks "where is the ring" asks this.
window.__drawnBox = (el) => window.__visibleBox(window.__ringed(el));
`;

/**
 * Teach a page the rule, before it navigates.
 *
 * An init script rather than an `evaluate`, because `upgrade-confirm` reloads
 * the document and an evaluated function does not survive that — the tour would
 * carry on and every instrument would go blind halfway through, silently.
 */
export async function installRingRule(page: Page): Promise<void> {
  await page.addInitScript(INSTALL_VISIBLE_BOX);
}
