# The sandbox, before it goes to production — what is done and what is left

The tracking list for the end-to-end pass over the whole sandbox. Kept here rather than in a
session's own todo panel because it has to outlive the session: this arc has already spanned
several, and a list that dies with a conversation is not a list.

**The discipline, from §13 of the methodology.** A defect found in one place is a _class_, and a
class is closed only when it has been swept across all seven tours — never fixed where it was seen
and left there. Two of the owner's own reports (the 2FA tour signing him in on the first code, the
checkout handing over a tier in 101 ms) were generalised that way into six classes. The reviewed
round of 2026-09-06 produced three more, and this is the list of closing them the same way.

Status is one of: **open** (nothing yet), **swept** (a machine check covers every tour, and it has
been made to catch a planted instance of the fault), **closed** (swept and every instance fixed).

---

## The three classes the reviewed round produced

| #                | Class                                                                                             | Where it was found                                                                                                                                                           | The general question                                                                                                                      | Instrument                                                     | Status    |
| ---------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------- |
| **E-BLINK**      | a beat's payoff is on screen for about a tenth of a second, because one press does several things | the threaded reply (101 ms), the deletion receipt (91 ms), the published campaign (18 ms), the checkout (101 ms), the ticket reference (56 ms), the step-up code (one frame) | for _every_ step: once the application confirms the step, how long does the thing that proves it stay on screen before the tour moves on? | `demo-payoffs.spec.ts`                                         | **swept** |
| **E-CONTINUITY** | a tour whose beats are each about something real and, together, about different things            | applied to the trekking campaign, congratulated on a protein one; raised ticket CIO-2026-0190, sent to CIO-2026-0189                                                         | for every tour that creates something: does the identity it creates appear on the screen of every later beat that claims to be about it?  | `demo-continuity.spec.ts`                                      | **swept** |
| **E-PROMISE**    | the guide says pressing will do something the beat cannot do                                      | "kliknij podświetlony element — wykona ten krok" over a reading beat and over a form field                                                                                   | for every step: does the footer's promise match what the step's recipe can actually perform?                                              | `core/demo/guide-hint.spec.ts` (unit, total over the registry) | **swept** |

**What the continuity sweep cost to get right, because it is the reusable part.** Its first version
asked only that a carrier beat name the subject _at some point while it was the current beat_. The
old ticket defect was re-planted underneath it — `read-response` pointed back at the seeded ticket
CIO-2026-0189 — and the sweep stayed green, because the ticket list it starts from prints every
reference including the right one. A beat that opens something is making a claim about what opens,
so the map now declares which screen carries the subject (`'screen'` or `'result'`), and with the
same defect planted the sweep fails on the sentence it should: _"the screen this beat opens is
supposed to be about CIO-2026-0190 and never names it"_. That is the second time this week a green
sweep turned out to be asking a weaker question than the one it was written for (T24, T31).

Coverage as it stands: five of the seven tours mint something with a name (a campaign twice, a
company, a ticket reference, an address the tour supplies) and are held to it across eight carrier
beats. `admin-2fa` creates a session, which has no name to get wrong. `admin-ops` keeps both of its
subjects on screen by construction — the reply threads onto the ticket's own page, and the cascade
dialog prints the campaign in its header in every state from preview to receipt. Both are recorded
in the map as decisions, not omissions.

## The six from the first round

All closed on 2026-09-06 and still asserted every run: E-LEAK, E-PHANTOM, E-FLASH, E-DISAGREE,
E-COVER, E-TWOWAYS. See §13 of `BROWSER-QA-METHODOLOGY.md` for the register and the instruments.

---

## Open, by decision rather than by neglect

Each of these is recorded with the measurement, because the decision should be made against the
number and not against an impression.

| #   | What                                                                                                                  | Measured                                                                                                                                           | Why it is open                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O4  | Every deep link paints the public marketing homepage for about 100 ms, then a blank frame, then the application       | five reviewers reported it independently; the demo build prerenders one route into `index.html`, so any URL serves the landing page's markup first | it is production behaviour, not a filming artefact, and fixing it means prerendering per route and matching the nginx config on the VPS — a deploy-side decision for the owner                                                           |
| O5  | On a short page the guide panel covers the marketplace paginator, cutting "Wiersze na stronie" mid-word               | the grid ends at y 626 and the panel's band starts at 569, so no amount of reserved space below moves it                                           | a fixed overlay covers something, and the panel's corner is the owner's explicit design call (2026-09-04). The reservation now follows the panel's own height, which fixes the long-page case                                            |
| O6  | After the server refuses a code as expired, the phone still captions it "Kod jest ważny tylko kilka sekund" for 5.3 s | two reviewers, on both paths of admin-2fa                                                                                                          | the obvious fix — letting the phone know the code is spent — re-creates F128/F135, where the phone knew the outcome before the server had given it. Any fix has to be gated on the server's answer, not on the phone's own attempt count |
| O7  | The worst single animation frame is reported, not asserted                                                            | 222–267 ms idle, 338 ms inside the tier's own run; 102 of its 104 ms is forced style and layout in the ring's loop                                 | a budget that fails a third of the time is a reading of the machine (T38). The three that describe answerability are still asserted                                                                                                      |

---

## The standing rules this list is kept under

- A class is closed across all seven tours or it is not closed.
- Every sweep plants the defect it hunts and must catch it, before "nothing found" counts for
  anything (§13).
- Nine of the first round's findings and six of the second were the _instrument_, not the
  application. An agent reading a JPEG is one more instrument: every finding it raises is
  re-measured against `dom.jsonl` or a probe before it is called a defect.
- The by-hand path is the primary case, not the variant. Of the defects found so far, the worst were
  invisible on the guided path.
