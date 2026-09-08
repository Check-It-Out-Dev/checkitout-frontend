import { expect, test, type Page } from '@playwright/test';
import { TOURS, open, press, ready, still, turned } from './walk';

/**
 * E-COVER, swept across every tour: does the guide's own furniture sit on top
 * of what the visitor is being asked to look at?
 *
 * The pill did, on a phone — 131x8 px across the sentence the inbox beat was
 * telling the visitor to read, and 34x7 px across the KSeF "Status" label. That
 * was fixed and is guarded at 390 px by `demo-phone.spec.ts`. This asks the
 * same question of every armed state in every tour at desktop width, where the
 * pill usually has room and therefore nobody has been looking.
 *
 * Two rules, both about the guide staying out of its own way:
 *
 *   • the pill may not be drawn over words — it is allowed to rest on the
 *     control the ring is already pointing at, since pressing the pill does
 *     that step anyway, but not on anything the visitor has to read;
 *   • the panel may not cover the ring's target — being told to press
 *     something the panel is sitting on is the same defect wearing a hat.
 *
 * Run: `npm run test:perf -- e2e-tests/perf/demo-covering.spec.ts`
 */

interface Cover {
  step: number | undefined;
  /** Text the pill is drawn over, with how much of it. */
  pillOver: { text: string; overlap: [number, number] }[];
  /** True while a dialog is up, so only its own text was considered. */
  modal: boolean;
  /** True when the panel overlaps the control the ring points at. */
  panelOverRing: boolean;
  done: boolean;
  way: 'pill' | 'next' | 'none';
  /** Where the pill was, so a complaint can be placed: left, top, width, height. */
  pillBox: number[] | null;
}

async function look(page: Page): Promise<Cover> {
  return page
    .evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
      };
      const overlap = (a: DOMRect, b: DOMRect): [number, number] => [
        Math.round(Math.min(a.right, b.right) - Math.max(a.left, b.left)),
        Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
      ];

      const pill = document.querySelector('[data-testid="guide-spot-next"]');
      const ring = document.querySelector('[data-testid="guide-spotlight"]');
      const panel = document.querySelector('.guide-pop');
      const ringBox = ring?.getBoundingClientRect();

      // While a dialog is up the page behind it is dimmed by a backdrop and is
      // explicitly not what the visitor is reading — so only the top layer
      // counts. Without this the sweep reports the pill covering a heading two
      // layers down that nobody can read anyway.
      // A centred world simulator is the same shape: it draws a scrim over the
      // whole page and the card on it is the only thing being read. The
      // checkout, invoice and KSeF beats all sit over the plan page, and
      // without this the sweep named the "Faktury" heading and the downgrade
      // note under the scrim, dimmed to half and read by nobody.
      const modal = document.querySelector('.cdk-overlay-backdrop-showing')
        ? document.querySelector('mat-dialog-container')
        : document.querySelector('app-world-sim-shell [role="dialog"] .sim-pop');

      const pillOver: { text: string; overlap: [number, number] }[] = [];
      const q = pill?.getBoundingClientRect();
      if (q && q.width > 0) {
        (modal ?? document.body).querySelectorAll('*').forEach((el) => {
          if (el.childElementCount > 0) return;
          // the guide's own text is not the page's
          if (el.closest('.guide-pop, [data-testid="guide-spot-next"]')) return;
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!text) return;
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return;
          // A dialog on its way out still has a box for a few frames. Nothing
          // you cannot see is being covered.
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.1) return;
          // resting on the highlighted control itself is allowed
          if (
            ringBox &&
            b.left >= ringBox.left &&
            b.right <= ringBox.right &&
            b.top >= ringBox.top &&
            b.bottom <= ringBox.bottom
          )
            return;
          const [ox, oy] = overlap(q, b);
          if (ox > 2 && oy > 2) pillOver.push({ text: text.slice(0, 44), overlap: [ox, oy] });
        });
      }

      let panelOverRing = false;
      const p = panel?.getBoundingClientRect();
      if (p && ringBox && ringBox.width > 0) {
        const [ox, oy] = overlap(p, ringBox);
        // The ring is drawn 6 px outside the control it points at, so an
        // overlap smaller than that lands on the halo, not on the button. Only
        // past the inset is the panel actually sitting on something.
        panelOverRing = ox > 6 && oy > 6;
      }

      return {
        step: s.step,
        done: s.done === true,
        modal: modal !== null,
        pillOver,
        panelOverRing,
        pillBox: q ? [q.left, q.top, q.width, q.height].map(Math.round) : null,
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
      modal: false,
      pillOver: [],
      panelOverRing: false,
      pillBox: null,
      way: 'none' as const,
    }));
}

test.describe('The guide stays out of its own way', () => {
  test('no armed state has the guide covering what it points at', async ({ page }) => {
    test.setTimeout(420_000);
    const complaints: string[] = [];
    let looked = 0;

    for (const tour of TOURS) {
      await open(page, tour);
      await ready(page);

      for (let i = 0; i < 14; i++) {
        await still(page);
        const at = await look(page);
        if (at.done) break;
        looked++;
        const from = at.step;

        for (const hit of at.pillOver) {
          complaints.push(
            `${tour} step ${String(at.step)}: the pill covers "${hit.text}" ` +
              `by ${hit.overlap[0]}x${hit.overlap[1]} px (pill at ${String(at.pillBox)})`,
          );
        }
        if (at.panelOverRing) {
          complaints.push(
            `${tour} step ${String(at.step)}: the panel is sitting on the control the ring points at`,
          );
        }

        await press(page);
        const next = await turned(page, from);
        if (next.step === from && !next.done) break; // held — nothing more to walk
        if (next.done) break;
      }
    }

    // eslint-disable-next-line no-console -- the survey is the deliverable
    console.log(
      `\n  looked at ${looked} armed states across ${TOURS.length} tours\n` +
        (complaints.length ? complaints.map((c) => `    ${c}`).join('\n') : '    nothing covered') +
        '\n',
    );

    expect(looked, 'the walk should have judged some armed states').toBeGreaterThan(10);
    expect(complaints, 'the guide must not cover what it is pointing at').toEqual([]);
  });

  /**
   * The instrument, falsified. This sweep is pure geometry, which is the kind
   * that looks obviously right and quietly measures nothing — the phone
   * version of it missed a 44 px word for three attempts because it sampled
   * three columns 64 px apart. So a sentence is planted directly under the
   * pill and the sweep has to name it, and a second one is planted just clear
   * of it and must not be named.
   */
  test('the sweep can see the pill covering a word', async ({ page }) => {
    await open(page, 'support-ticket');
    await ready(page);

    const planted = await page.evaluate(() => {
      const q = document.querySelector('[data-testid="guide-spot-next"]')!.getBoundingClientRect();
      const put = (id: string, top: number, text: string): void => {
        const el = document.createElement('div');
        el.id = id;
        el.textContent = text;
        el.style.cssText =
          `position:fixed;left:${q.left + 4}px;top:${top}px;` +
          'width:120px;height:14px;font:12px sans-serif;z-index:1;color:#000';
        document.body.appendChild(el);
      };
      // squarely under the pill, and well clear of it
      put('under', q.top + q.height / 2 - 7, 'covered sentence');
      put('clear', q.bottom + 40, 'untouched sentence');
      return true;
    });
    expect(planted).toBe(true);

    const at = await look(page);
    expect(at.modal, 'the plant goes in the page, so no dialog may be up').toBe(false);
    const texts = at.pillOver.map((h) => h.text);

    expect(texts, 'a sentence squarely under the pill must be named').toContain('covered sentence');
    expect(texts, 'and one clear of it must not be').not.toContain('untouched sentence');
  });
});
