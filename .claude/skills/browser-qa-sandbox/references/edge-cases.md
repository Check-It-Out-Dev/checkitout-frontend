# Edge cases to force on purpose

Generated from Neo4j namespace `DemoSandbox`. Each was forced against the live
demo; the verdict column is what happened the last time it ran.

Force each in a fresh tour — several leave the tour in a mess deliberately.

## Contents

- **E1** — Half-typed value
- **E2** — Refused code
- **E3** — Visitor does the step by hand
- **E4** — Control behind a dialog
- **E5** — Reload mid-tour
- **E6** — Window resized mid-step
- **E7** — Scrolled away from the target
- **E8** — Tab backgrounded and returned
- **E9** — Escape during a recipe
- **E10** — Second press on a stalled step
- **E11** — Language switch mid-tour
- **E12** — Simulator closed by the visitor

## E1 — Half-typed value

**Force it:** Type 526 into the NIP field, then press the pill

**Must hold:** Sample typed over it, step advances, no dead end

**Last verdict:** PASS

> Typed 526 into the NIP field on production, pressed the pill: value became 5260250995, company card fetched, step advanced 1/7 -> 2/7, no dead end. Pre-press probe confirmed ng-invalid present so rejected() engaged.

## E2 — Refused code

**Force it:** Type 000000 into the 2FA or step-up field and submit

**Must hold:** Caret returns to the field; the 2FA dialog selects the refused digits

**Last verdict:** PASS

> Typed 000000 by hand into the 2FA dialog and pressed Verify. Focus returned to the field (activeElement = two-factor-verify-code), selection 0-6 so the refused digits are pre-selected for overtyping, error 'That code didn't match. Try again.' shown, dialog stays open. The tour advanced because this step's done IS the error appearing - the refused code is the lesson.

## E3 — Visitor does the step by hand

**Force it:** Type the full NIP and click the application's own button

**Must hold:** The tour advances without the guide being touched

**Last verdict:** PASS

> Typed the full valid NIP and pressed the application's own Verify button, never touching the guide. The tour advanced by itself to 2/7 with the ring re-placed on 'Potwierdzam - to moja firma' and the matching narration.

## E4 — Control behind a dialog

**Force it:** Reach the upgrade step

**Must hold:** Ring hides, panel offers the way forward

**Last verdict:** PASS

> Verified live. Ring hides, pill goes, panel offers Dalej with an adapted hint; no second dialog stacks when the offer is taken.

## E5 — Reload mid-tour

**Force it:** Complete the upgrade step

**Must hold:** The tour resumes on the invoice beat

**Last verdict:** PASS

> Verified live twice. Checkout hands off through a full page reload and the tour resumes on the invoice beat with the plan stored as ENTERPRISE.

## E6 — Window resized mid-step

**Force it:** Resize while a step is armed

**Must hold:** Ring re-places on its control; the way forward does not change identity

**Last verdict:** PASS

> PASS via chrome-devtools-mcp (claude-in-chrome cannot resize - T2). Real viewport change 390 -> 1100 while the KSeF step was armed: step held at 6, way forward kept its identity (pill), ring re-placed at exactly (-6,-6), pill on screen. It also moved back beside the target and stopped covering anything, which is what proves finding F127 is narrow-viewport only.

## E7 — Scrolled away from the target

**Force it:** Scroll the target out of view

**Must hold:** After 0.5 s the panel offers a Next; the ring returns on scroll back

**Last verdict:** PASS

> On the long plan-billing page: scrolled the target to top -262 (off screen) - ring hid and the way forward switched from pill to the panel's Next; scrolled back - ring returned at exactly (-6,-6) with the pill. Pressing the panel Next while the target was off screen performed the whole step (plan ENTERPRISE, reload, resumed on the invoice beat), so it is a real way forward, not decoration.

## E8 — Tab backgrounded and returned

**Force it:** Switch tabs and back

**Must hold:** The ring is correct on return

**Last verdict:** PARTIAL

> The invariant holds - after a tab-focus excursion the ring is still exactly (-6,-6) on its target, same way forward, same step. But genuine backgrounding cannot be observed through this extension: reading the background tab makes it visible (document.hidden came back false). New tool law T15. The visibilitychange path is exercised by the chaos spec.

## E9 — Escape during a recipe

**Force it:** Press Escape while the shield is up

**Must hold:** Escape passes; nothing else does

**Last verdict:** PASS

> Instrumented the shield with a MutationObserver and a capture-phase keydown log, then clicked the pill and pressed Escape twice back to back. Shield up t=39650, down t=39660 - a 10 ms window; both Escapes landed inside it with shieldUp true and target BODY. No page errors, no shield left up, step still completed. Also confirms the B4.3 split: the shield covers the recipe only, far under the 400 ms budget.

## E10 — Second press on a stalled step

**Force it:** Press twice where done cannot arrive

**Must hold:** The retry line shows, then the second press advances

**Last verdict:** PASS

> Forced a genuinely stalled step by removing company-setup-verify so nip-lookup's done (appears company-setup-confirm) could never arrive. First press: NIP filled, no confirm card, step held at 1/7, retry line shown - 'The step was not confirmed - check the data and try again.' Second press advanced anyway to 2/7 and fell back to the panel Next, so a wrong condition cannot trap anyone.

## E11 — Language switch mid-tour

**Force it:** Switch PL to EN on an armed step

**Must hold:** Narration and controls stay coherent

**Last verdict:** PASS

> Switched PL to EN on an armed step. Position held (4/7), tour title, narration, hint and control all translated, app chrome translated, nothing overflows the panel, way forward preserved. The choice persists across a tour restart.

## E12 — Simulator closed by the visitor

**Force it:** Interact around an open simulator

**Must hold:** The tour still offers a way forward

**Last verdict:** PASS

> The simulator has no dismiss control and Escape does not close it - but it is not a trap. Its scrim covers the whole viewport (the toolbar language control is correctly unclickable while it is up), while the tour's own controls sit above it: pill (z-99986), panel, the panel's close button and the sim CTA all hit-test reachable. Escape leaves the pill and the step intact.
