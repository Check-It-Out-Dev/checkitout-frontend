import { expect, test } from '@playwright/test';
import { SCENARIOS } from '../../src/app/core/demo/scenario-registry';
import { PROCESSES } from './process-map';
import { TOURS, open, press, ready, turned } from './walk';

/**
 * E-CONTINUITY — a tour must keep talking about the same thing.
 *
 * Two tours were found telling a story about one subject and showing another,
 * and every assertion in the suite passed while they did it, because nothing
 * was broken. You applied to "Weekendowe testy sprzętu trekkingowego" and the
 * closing beat congratulated you on a protein-bar collaboration. You raised a
 * ticket, were handed the reference CIO-2026-0190, and the next beat opened
 * CIO-2026-0189 under a caption saying it was the same one.
 *
 * Neither is a broken control, a missing element or a bad timing, so no
 * geometric or temporal check can see it — and a reader catches it at once. The
 * subject is therefore declared in the process map: the beat whose action
 * creates the identity, where to read it, and which later beats claim to be
 * about it. This walks every tour and holds them to it.
 *
 * A carrier beat names WHICH screen has to carry the subject: the one it settles
 * into, or the one its own action produces. Leniency here is fatal — the first
 * version accepted either, and the ticket list happens to print every reference,
 * so `read-response` passed with the old defect re-planted underneath it. It
 * opens a ticket; the ticket that opens is the claim.
 *
 * A tour that creates nothing declares no subject, and says so rather than
 * passing quietly.
 */

test.describe('A tour keeps talking about the same thing', () => {
  for (const tour of TOURS) {
    test(`${tour}: what it makes is what it goes on to show`, async ({ page }) => {
      test.setTimeout(300_000);

      const map = PROCESSES.find((p) => p.tour === tour);
      const subject = map?.subject;
      const steps = SCENARIOS.find((s) => s.key === tour)?.steps ?? [];
      const carriers = new Map(
        (map?.phases ?? []).flatMap((ph) => (ph.carries ? [[ph.step, ph.carries] as const] : [])),
      );

      if (!subject) {
        // eslint-disable-next-line no-console -- the coverage is the deliverable
        console.log(`  ${tour}: creates nothing with a name — nothing to carry`);
        expect(
          carriers.size,
          `${tour}: beats claim to carry a subject the tour never declares`,
        ).toBe(0);
        return;
      }
      expect(
        carriers.size,
        `${tour}: declares a subject that no later beat is required to name`,
      ).toBeGreaterThan(0);

      /** Everything readable on screen right now, whitespace flattened. */
      const onScreen = (): Promise<string> =>
        page
          .evaluate(() => (document.body.textContent ?? '').replace(/\s+/g, ' ').trim())
          .catch(() => '');

      // Two shapes of subject. Most are minted by the application and read off
      // a screen; one is supplied by the tour itself, and the guard below is
      // what keeps that copy honest — a literal the recipe no longer types is a
      // sweep quietly checking a string nothing produces.
      let identity: string | null = null;
      if (subject.literal) {
        const typed = steps.some((st) =>
          (st.perform ?? []).some((a) => 'value' in a && a.value === subject.literal),
        );
        expect(
          typed,
          `${tour}: the map says the tour supplies "${subject.literal}", and no step's ` +
            'recipe types it. The map has drifted from the registry.',
        ).toBe(true);
        identity = subject.literal;
      } else {
        expect(
          Boolean(subject.from && subject.read),
          `${tour}: a subject the application mints needs both the step that makes it and ` +
            'where to read it',
        ).toBe(true);
      }

      await open(page, tour);
      let at = await ready(page);

      const carried: string[] = [];

      /** Assert the screen showing right now is about the subject. */
      const mustName = async (id: string, which: string): Promise<void> => {
        expect(
          identity,
          `${tour}/${id}: carries the subject before anything created it`,
        ).toBeTruthy();
        const named = (await onScreen()).includes(identity ?? '');
        carried.push(`${id} ${named ? 'names it' : 'DOES NOT'} (${which})`);
        expect(
          named,
          `${tour}/${id}: the ${which} is supposed to be about "${String(identity)}" ` +
            'and never names it. The tour changed its subject.',
        ).toBe(true);
      };

      for (let i = 0; i < 16 && !at.done; i++) {
        const from = at.step;
        const id = steps[from ?? -1]?.id;
        const carrier = id ? carriers.get(id) : undefined;

        if (id && carrier === 'screen') await mustName(id, 'screen this beat settles into');

        await press(page);
        at = await turned(page, from);

        // The identity is read off the screen the creating beat LANDS on: every
        // one of the three subjects is produced by that beat's action — a
        // published campaign's own page, the campaign a click opened, the
        // reference a submit issued — so it does not exist until the press has
        // gone through.
        if (subject.read && id === subject.from && identity === null) {
          const raw = await page
            .evaluate(
              (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
              `[data-testid="${subject.read}"]`,
            )
            .catch(() => '');
          const found = subject.extract ? (new RegExp(subject.extract).exec(raw)?.[0] ?? '') : raw;
          identity = found.slice(0, 120).trim() || null;
          expect(
            identity,
            `${tour}: the beat that creates the subject leaves nothing to read it from ` +
              `(looked in [data-testid="${String(subject.read)}"] after "${String(id)}")`,
          ).toBeTruthy();
        }

        if (id && carrier === 'result') await mustName(id, 'screen this beat opens');

        if (at.step === from && !at.done) break;
      }

      // eslint-disable-next-line no-console -- the coverage is the deliverable
      console.log(`  ${tour}: "${String(identity)}" — ${carried.join(' · ')}`);
      expect(
        carried.length,
        `${tour}: the walk never reached a beat that carries the subject, so nothing was proven`,
      ).toBe(carriers.size);
    });
  }

  /**
   * The planted defect. A sweep that has never caught anything has not been
   * shown to work (methodology §13), and the rule here is "the identity read at
   * one beat is present in the text of a later one" — so the fault is planted in
   * exactly that.
   */
  test('the rule catches a tour that changes its subject', () => {
    const names = (screen: string, identity: string): boolean => screen.includes(identity);

    // What the influencer tour used to do.
    const chose = 'Weekendowe testy sprzętu trekkingowego';
    expect(names('Moje aplikacje W trakcie (1) Premiera linii przekąsek proteinowych', chose)).toBe(
      false,
    );
    expect(
      names('Moje aplikacje W trakcie (2) Weekendowe testy sprzętu trekkingowego', chose),
    ).toBe(true);

    // A reference one digit away from the one issued must still fail.
    expect(names('Zgłoszenie CIO-2026-0189 · odpowiedź', 'CIO-2026-0190')).toBe(false);

    // And the extract pattern must pull a reference out of its label rather
    // than matching the label — an identity of "" would pass everything.
    const extracted = /CIO-[0-9]{4}-[0-9]{4}/.exec('Numer zgłoszenia: CIO-2026-0190')?.[0];
    expect(extracted).toBe('CIO-2026-0190');
  });
});
