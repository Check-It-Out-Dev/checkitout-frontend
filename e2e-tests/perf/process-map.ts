/**
 * What each process in the sandbox is supposed to do, said twice.
 *
 * Every defect found in this demo so far was found by asking the DOM a
 * question: did the step advance, did the plan get stored, was the dialog in
 * the document. That has a floor. The DOM is not what the visitor sees — a
 * dialog can be in the document and covered, a narration can be correct and
 * unreadable, a state can be true for 112 ms — and the two most recent findings
 * (the cascade preview, the pill drawn across a sentence) live exactly in that
 * gap.
 *
 * So each phase of each tour is written down in two layers:
 *
 *   • `requires` — what a person must be able to SEE, in the visitor's own
 *     terms. Read by agents against timestamped frames. These are not invented:
 *     they are the claims the tour's own narration already makes, which is how
 *     the cascade preview was recognised as a defect at all — the copy said
 *     "read the preview" and the tour gave a tenth of a second.
 *
 *   • `atomic` — what the DOM must show, declaratively, so a machine can check
 *     it against the per-frame sample stream with no agent in the loop.
 *
 * The two are deliberately redundant. Where they disagree — the DOM says the
 * state held and the frames do not show it, or the reverse — that disagreement
 * is the finding.
 *
 * The technical phases are uniform and generated: every step passes through
 * armed → performing → awaiting → confirmed, which are the director's own
 * states. The business phases below are per step and hand-written, with `says`
 * quoted verbatim from `demo.sandboxes.<tour>.steps.<step>` in `en.json`, so a
 * copy change that breaks a promise shows up as a map that no longer matches.
 */

export type Tour =
  | 'admin-2fa'
  | 'stepup-email'
  | 'company-campaign'
  | 'influencer-collab'
  | 'nip-to-ksef'
  | 'support-ticket'
  | 'admin-ops';

/** The director's own states, as modelled in Neo4j `DemoSandbox`. */
export type DirectorState =
  | 'idle'
  | 'performing'
  | 'awaiting'
  | 'stalled'
  | 'advanced'
  | 'finished';

/** One thing a person has to be able to see, checked against frames. */
export interface Requirement {
  id: string;
  /** Written for someone looking at a screenshot, not at the code. */
  see: string;
  /**
   * How long it must stay legible, when it carries something to read. Absent
   * means "present at some point in the phase" — a control, not a sentence.
   */
  readableMs?: number;
  /**
   * The element whose visible lifetime answers `readableMs`.
   *
   * Without this the budget is a wish. The prompt used to tell the reviewing
   * agent that the machine was timing these separately, and the machine was
   * not — `readableMs` only decided which phases got a magnified crop. An agent
   * noticed the claim, checked the source, and said so in its self-report,
   * which is the whole reason that block exists.
   */
  via?: string;
}

/** One thing the DOM must show, checked against the per-frame sample stream. */
export type AtomicCheck =
  | { id: string; kind: 'visible'; testid: string }
  | { id: string; kind: 'absent'; testid: string }
  | { id: string; kind: 'route'; pattern: string }
  | { id: string; kind: 'storage'; key: string }
  | { id: string; kind: 'ring'; testid: string }
  | { id: string; kind: 'narration'; contains: string };

export interface Phase {
  /** `<tour>/<step>#<name>`. */
  id: string;
  step: string;
  layer: 'business' | 'technical';
  /** The claim, in the visitor's terms. Verbatim narration for business phases. */
  says: string;
  requires: Requirement[];
  atomic: AtomicCheck[];
  /** Director states this phase may legally occupy. */
  allows: DirectorState[];
  /**
   * This beat claims to be about the tour's subject, so it must name it — and
   * WHICH screen has to name it is the whole question.
   *
   *   'screen' — the screen this beat settles into. Reading beats: the ring
   *     goes on something already there and the press only moves the tour on.
   *   'result' — the screen this beat's own action produces. A beat that opens
   *     something is making a claim about what opens, not about the list it was
   *     launched from.
   *
   * The distinction is not pedantry. `read-response` was first written as a
   * beat that merely had to name the reference somewhere while it was live —
   * and the ticket list names every ticket, including the right one, so the
   * check passed with the beat opening the wrong ticket. The old defect was
   * re-planted deliberately and the sweep did not see it.
   */
  carries?: 'screen' | 'result';
}

/**
 * The thing a tour creates, and where it must still be named — E-CONTINUITY.
 *
 * Three tours were found telling a story about one thing and showing another:
 * you applied to the trekking campaign and were congratulated on a protein one;
 * you raised ticket CIO-2026-0190, were handed its reference, and were sent to
 * CIO-2026-0189. Every assertion passed in both cases, because nothing was
 * broken — the tour simply changed its subject halfway through. So the subject
 * is declared: read it off the screen where the tour creates it, and require it
 * on every later beat that claims to be about it.
 */
export interface Subject {
  /**
   * The step whose ACTION produces the identity. Most subjects here are minted
   * by a press — a published campaign's own page, the campaign a click opened,
   * the reference a submit issued — so the identity is read off the screen that
   * beat LANDS on, not off the screen it starts from.
   */
  from?: string;
  /** How to read it: a testid whose text is the identity. */
  read?: string;
  /** A pattern to pull the identity out of that text, when it is embedded. */
  extract?: string;
  /**
   * The other shape: the tour supplies the identity instead of the application
   * minting it — the e-mail address the step-up recipe types. Nothing has to be
   * read, but the sweep checks the literal really is in that tour's recipe, so
   * this cannot quietly drift from the registry.
   */
  literal?: string;
}

export interface Process {
  tour: Tour;
  /** What this tour creates, if it creates anything with a name. */
  subject?: Subject;
  /** Business phases, in order. Technical ones are generated per step. */
  phases: Omit<Phase, 'id' | 'layer' | 'allows'>[];
}

/**
 * The seven processes.
 *
 * Where the narration names specific facts — "GUS, VAT status, PKD, even the
 * bank account" — those become the requirements, because that is the promise
 * being made. `readableMs` is on anything the visitor is told to read: 200
 * words a minute with a one-second floor, the rule the flash sweep already
 * uses, applied to the actual copy and rounded down.
 */
export const PROCESSES: Process[] = [
  {
    tour: 'admin-2fa',
    // No subject: signing in creates a session, and a session has no name the
    // later beats could get wrong. The codes are checked by demo-payoffs.

    phases: [
      {
        step: 'login',
        says: 'You are the admin — this is the standard sign-in screen. In the sandbox you do not need to type anything; let us get to the codes.',
        requires: [
          {
            id: 'sign-in-visible',
            see: 'the sign-in form, with e-mail and password already filled in',
          },
          {
            id: 'nothing-to-type',
            see: 'no empty required field the visitor is being asked to complete',
          },
        ],
        atomic: [
          { id: 'on-sign-in', kind: 'route', pattern: '^/auth/sign-in' },
          { id: 'ring-on-submit', kind: 'ring', testid: 'sign-in-submit' },
        ],
      },
      {
        step: 'first-code',
        says: 'The server wants a TOTP code. That is the admin phone in the corner - generate the first one.',
        requires: [
          {
            id: 'dialog-asks',
            see: 'the two-factor dialog asking for a code',
            readableMs: 2000,
            via: 'two-factor-verify-code',
          },
          {
            id: 'phone-visible',
            see: 'the phone simulator in the corner, not covered by the dialog or by the guide',
          },
          {
            id: 'code-legible',
            see: 'a six-digit code on the phone, large enough to read',
            readableMs: 1500,
            via: 'totp-sim-code',
          },
          {
            id: 'not-yet-sent',
            see: 'the dialog field still empty and no refusal on screen — the code has not been spent yet',
          },
        ],
        atomic: [
          { id: 'code-field', kind: 'visible', testid: 'two-factor-verify-code' },
          { id: 'phone', kind: 'visible', testid: 'totp-sim-generate' },
          { id: 'stale-hint', kind: 'visible', testid: 'totp-sim-stale' },
          { id: 'no-refusal-yet', kind: 'absent', testid: 'two-factor-verify-error' },
        ],
      },
      {
        step: 'first-code-refused',
        says: 'The code is on the phone. Look at it, then send it to the server - and watch what comes back.',
        requires: [
          {
            id: 'refusal-shown',
            see: 'the dialog refusing that code, with the reason',
            readableMs: 1500,
            via: 'two-factor-verify-error',
          },
          { id: 'code-in-field', see: 'the code the phone showed, now in the dialog field' },
          {
            id: 'still-signed-out',
            see: 'the sign-in page still behind the dialog — the admin is NOT inside the app',
          },
        ],
        atomic: [
          { id: 'refusal', kind: 'visible', testid: 'two-factor-verify-error' },
          { id: 'not-inside', kind: 'route', pattern: '^/auth/sign-in' },
        ],
      },
      {
        step: 'fresh-code',
        says: 'The first code expired before it could be used — that is real TOTP behaviour: the window is seconds. Generate a fresh one.',
        requires: [
          {
            id: 'explains-why',
            see: 'the narration explaining that the first code expired',
            readableMs: 3000,
            via: 'guide-narration',
          },
          {
            id: 'second-code',
            see: 'a new, different six-digit code on the phone',
            readableMs: 1500,
            via: 'totp-sim-code',
          },
        ],
        atomic: [
          { id: 'fresh-hint', kind: 'visible', testid: 'totp-sim-fresh' },
          { id: 'still-out', kind: 'route', pattern: '^/auth/sign-in' },
        ],
      },
      {
        step: 'signed-in',
        says: 'This one is current. Send it — the dialog closes and the admin is in.',
        requires: [
          { id: 'dialog-closes', see: 'the dialog gone once the fresh code is accepted' },
          { id: 'now-inside', see: 'the admin inside the app, no longer on the sign-in page' },
        ],
        atomic: [
          { id: 'dialog-gone', kind: 'absent', testid: 'two-factor-verify-code' },
          { id: 'left-sign-in', kind: 'route', pattern: '^/(?!auth/sign-in)' },
        ],
      },
    ],
  },
  {
    tour: 'stepup-email',
    // The address the visitor is asked to move the account to. The closing beat
    // says a confirmation link "has gone to the new address"; which address is
    // the whole claim, and only this tour's subject can check it.
    subject: { literal: 'nowy.adres@zloteziarno.pl' },
    phases: [
      {
        step: 'change-email',
        says: "These are the company's account settings. Enter any new e-mail address and send the verification email.",
        requires: [
          { id: 'settings-visible', see: 'the account settings page with an e-mail field' },
          {
            id: 'address-typed',
            see: 'a new address actually typed into the field, not an empty box',
          },
        ],
        atomic: [
          { id: 'on-account', kind: 'route', pattern: '^/user/settings/account' },
          { id: 'ring-on-start', kind: 'ring', testid: 'email-change-start' },
        ],
      },
      {
        step: 'enter-code',
        says: 'The platform will not just trust the session — a one-time code went to the verified address. Check the inbox in the corner and type it in.',
        requires: [
          {
            id: 'inbox-visible',
            see: 'the inbox simulator in the corner with the code mail in it',
          },
          { id: 'code-legible', see: 'the one-time code, readable', readableMs: 1500 },
          { id: 'code-field', see: 'the step-up dialog asking for that code', readableMs: 2000 },
        ],
        atomic: [{ id: 'step-up', kind: 'visible', testid: 'step-up-code-input' }],
      },
      {
        step: 'verify-code',
        says: 'The code is in the field. Verify it — the server checks it is the one it sent, and only then does the change begin.',
        requires: [
          {
            id: 'code-in-field',
            see: 'the one-time code already in the dialog field, legible',
            readableMs: 1500,
            via: 'step-up-verify',
          },
          { id: 'verify-live', see: 'the verify button no longer greyed out' },
        ],
        atomic: [{ id: 'dialog-gone', kind: 'absent', testid: 'step-up-code-input' }],
      },
      {
        step: 'saved',
        says: 'The code went through, so the change is under way: a confirmation link has gone to the new address and clicking it is what finishes the job. And here is a product decision: companies share accounts, so everyday actions need only a session - sensitive ones ask for fresh proof. That is our answer to 2FA for shared accounts.',
        requires: [
          { id: 'new-address-shown', see: 'the new e-mail address on the settings page, saved' },
          {
            id: 'rationale-readable',
            see: 'the narration explaining the shared-account decision',
            readableMs: 8000,
            via: 'guide-narration',
          },
        ],
        atomic: [{ id: 'on-account', kind: 'route', pattern: '^/user/settings/account' }],
        carries: 'screen',
      },
    ],
  },
  {
    tour: 'company-campaign',
    // The public title typed into the brief, which the published page then shows.
    subject: { from: 'publish-campaign', read: 'opportunity-detail-title' },
    phases: [
      {
        step: 'create-campaign',
        says: 'A campaign brief is one form. Start at the top: the internal name, the public title and where you are meeting — press, and we fill them in for you.',
        requires: [
          { id: 'form-visible', see: 'the campaign form' },
          {
            id: 'top-filled',
            see: 'the name, the title and the address carrying their values, each legible and not printed under its own label',
            readableMs: 2000,
            via: 'opp-form-name',
          },
        ],
        atomic: [{ id: 'form', kind: 'visible', testid: 'opp-form-name' }],
      },
      {
        step: 'complete-brief',
        says: 'Below it, the rest of the brief: the description, the requirements, the budget, the platforms, the dates and the photos. One press completes it all, and the page glides down to the photos.',
        requires: [
          {
            id: 'rest-filled',
            see: 'the brief, the budget, the platforms and the dates carrying their values',
          },
          {
            id: 'photos-in',
            see: 'two photo thumbnails under the brief, the page having glided down to them',
            readableMs: 1500,
            via: 'opp-form-photo-1',
          },
        ],
        atomic: [{ id: 'second-photo', kind: 'visible', testid: 'opp-form-photo-1' }],
      },
      {
        step: 'publish-campaign',
        says: 'The form is complete, so the publish button has come alive. Publish it — the campaign gets a page of its own.',
        requires: [
          { id: 'enabled', see: 'the publish button no longer greyed out' },
          { id: 'lands-on-detail', see: "the saved campaign's own page once it is published" },
        ],
        atomic: [{ id: 'saved', kind: 'route', pattern: '^/collaborations/\\d+$' }],
      },
      {
        step: 'campaign-live',
        carries: 'screen',
        says: 'This is the published campaign: the title, the location, the brief and the photos, exactly as a creator will see it. Go to the applications — the first one is already waiting.',
        requires: [
          {
            id: 'names-it',
            see: 'the published campaign naming the public title that was typed into the form',
            readableMs: 3000,
            via: 'opportunity-detail-card',
          },
          { id: 'brief-there', see: 'the brief text and the two photos on it' },
          {
            id: 'way-onward',
            see: 'a control leading to the applications, with the guide sitting beside it',
          },
        ],
        atomic: [{ id: 'on-detail', kind: 'route', pattern: '^/collaborations/\\d+$' }],
      },
      {
        step: 'decide-applicant',
        says: 'The inbox of applications to your campaigns. Piotr was accepted a week ago for the summer campaign; Ola has just applied to the new one. Decide — accept her or pass.',
        requires: [
          {
            id: 'inbox',
            see: 'the applications inbox with two people on it, each with a coloured avatar and the campaign they applied to',
          },
          {
            id: 'both-choices',
            see: "both an accept and a decline control on Ola's row — the visitor is being given a decision",
          },
          { id: 'decision-lands', see: 'the accept control gone once the decision is made' },
        ],
        atomic: [
          { id: 'on-applicants', kind: 'route', pattern: '^/collaborations/applicants' },
          { id: 'accept-gone', kind: 'absent', testid: 'applicant-accept-8101' },
        ],
      },
      {
        step: 'lifecycle',
        says: 'Accepted — Ola is now under the new campaign among the collaborations in progress. Below it, the summer campaign with three creators, each at a different point of the process. Every one of those states is the same machine the survey draws.',
        requires: [
          {
            id: 'two-campaigns',
            see: 'two campaigns: the new one with Ola accepted, and the summer one with three creators, each with a status',
          },
        ],
        atomic: [{ id: 'on-in-progress', kind: 'route', pattern: '^/collaborations/in-progress' }],
      },
    ],
  },
  {
    tour: 'influencer-collab',
    // The campaign the visitor chose off the list and opened.
    subject: { from: 'browse', read: 'opportunity-detail-title' },
    phases: [
      {
        step: 'browse',
        says: 'You are Ola now — a creator. These are real campaigns from companies. Open one that suits you.',
        requires: [
          { id: 'persona-changed', see: "the app showing a creator's view, not the company's" },
          { id: 'campaigns-listed', see: 'a list of campaigns with names and companies' },
        ],
        atomic: [{ id: 'on-list', kind: 'route', pattern: '^/collaborations/list' }],
      },
      {
        step: 'apply',
        says: "Found something? Apply from the campaign's page — add a note if you like.",
        requires: [
          { id: 'campaign-detail', see: "the campaign's own page, with what it is asking for" },
          { id: 'apply-control', see: 'an apply control' },
        ],
        atomic: [{ id: 'on-detail', kind: 'route', pattern: '^/collaborations/\\d+$' }],
      },
      {
        step: 'applied',
        carries: 'screen',
        says: 'The application is in. The company sees it on their applicant list straight away, and you have the confirmation here.',
        requires: [
          {
            id: 'confirmed',
            see: 'the confirmation that the application was sent',
            readableMs: 2500,
            via: 'opportunity-detail-applied',
          },
        ],
        atomic: [{ id: 'applied', kind: 'visible', testid: 'opportunity-detail-applied' }],
      },
      {
        step: 'accepted',
        carries: 'screen',
        says: 'Good news travels fast: the company has just accepted you. This is your applications view — the status is already green.',
        requires: [
          { id: 'applications-view', see: "the creator's own applications list" },
          {
            id: 'status-green',
            see: 'the application showing an accepted status, visibly distinct from a pending one',
          },
        ],
        atomic: [
          { id: 'on-registrations', kind: 'route', pattern: '^/collaborations/registrations' },
        ],
      },
    ],
  },
  {
    tour: 'nip-to-ksef',
    // The company the registries answered with. The tour then confirms it,
    // activates it, buys a plan for it and issues an invoice to it — four
    // screens that are only one story if they all name the same company.
    subject: { from: 'nip-lookup', read: 'company-setup-company-name' },
    phases: [
      {
        step: 'nip-lookup',
        says: 'Company onboarding starts with one number. Type a NIP (try 5260250995) and search.',
        requires: [
          { id: 'nip-field', see: 'a NIP field on the company setup page' },
          { id: 'nip-typed', see: 'a ten-digit NIP actually in the field' },
        ],
        atomic: [
          { id: 'on-setup', kind: 'route', pattern: '^/company/setup' },
          { id: 'field', kind: 'visible', testid: 'company-setup-nip' },
        ],
      },
      {
        step: 'company-confirmed',
        carries: 'screen',
        says: 'Everything arrived from the registries by itself — GUS, VAT status, PKD, even the bank account. Confirm the data.',
        requires: [
          {
            id: 'company-name',
            see: "the company's name, fetched rather than typed",
            readableMs: 2000,
            via: 'company-setup-confirm',
          },
          { id: 'vat-status', see: 'a VAT status', readableMs: 2000 },
          { id: 'pkd', see: 'a PKD code', readableMs: 2000 },
          { id: 'bank-account', see: 'a bank account number', readableMs: 2000 },
        ],
        atomic: [{ id: 'confirm', kind: 'visible', testid: 'company-setup-confirm' }],
      },
      {
        step: 'verify-mail',
        says: 'One thing left: prove the e-mail is yours. The branded mail has just landed in the inbox on the left — the account is waiting for that one click.',
        requires: [
          { id: 'inbox', see: 'the inbox simulator with the verification mail' },
          {
            id: 'mail-branded',
            see: 'the mail looking like a real branded message, not a placeholder',
            readableMs: 2000,
            via: 'inbox-sim-cta',
          },
        ],
        atomic: [{ id: 'cta', kind: 'visible', testid: 'inbox-sim-cta' }],
      },
      {
        step: 'account-active',
        says: 'That click activated the account by itself — no human in the loop. Company confirmed, e-mail verified. Go to the subscription: you will see the campaign limits per plan.',
        requires: [
          {
            id: 'active-card',
            see: 'the setup page saying the account is active',
            readableMs: 2000,
          },
          {
            id: 'way-onward',
            see: 'a control leading to the subscription, with the guide beside it',
            via: 'company-setup-subscription',
          },
        ],
        atomic: [{ id: 'cta', kind: 'visible', testid: 'company-setup-subscription' }],
      },
      {
        step: 'upgrade',
        says: 'Need more room? Open the plan change — we show the price and the terms before you confirm anything.',
        requires: [
          {
            id: 'plans-side-by-side',
            see: 'the three plans side by side with their campaign limits, the current one marked',
            readableMs: 2500,
            via: 'plan-billing-upgrade-enterprise',
          },
          { id: 'checkout-opens', see: 'the plan-change dialog open' },
          {
            id: 'waits',
            see: 'the dialog still open and unconfirmed — nothing was bought by opening it',
          },
        ],
        atomic: [{ id: 'submit-present', kind: 'visible', testid: 'upgrade-confirm-submit' }],
      },
      {
        step: 'upgrade-terms',
        says: 'Before you pay — the subscription terms and the consent. Tick it; without it the payment button stays disabled.',
        requires: [
          { id: 'price', see: 'the price of the plan', readableMs: 4000 },
          { id: 'terms', see: 'the terms', readableMs: 4000 },
          {
            id: 'consent',
            see: 'a consent box the visitor has to tick, with the ring on the box and not on the button below it',
            via: 'upgrade-consent-checkbox',
          },
        ],
        atomic: [{ id: 'ticked', kind: 'visible', testid: 'upgrade-consent-checkbox' }],
      },
      {
        step: 'upgrade-confirm',
        says: 'Price, terms and consent in one place. Confirm — you go on to Stripe Checkout; in the demo its simulator opens instead.',
        requires: [
          {
            id: 'enabled',
            see: 'the payment button no longer greyed out, now that the box is ticked',
          },
          { id: 'dialog-goes', see: 'the dialog gone once confirmed, with no flash of the page' },
        ],
        atomic: [{ id: 'dialog-gone', kind: 'absent', testid: 'upgrade-confirm-submit' }],
      },
      {
        step: 'pay',
        says: 'Stripe Checkout in test mode: the details and the 4242 test card are already in. Pay — the successful-payment webhook activates the plan and starts the billing saga.',
        requires: [
          {
            id: 'checkout',
            see: 'a checkout page in test mode: the order on one side, the payment form on the other',
            readableMs: 2500,
            via: 'checkout-sim-pay',
          },
          { id: 'card-filled', see: 'the test card 4242 already typed into the form' },
          { id: 'new-tier-after', see: 'the new tier active on the plan page once paid' },
        ],
        atomic: [{ id: 'plan-stored', kind: 'storage', key: 'demoPlan' }],
      },
      {
        step: 'invoice-sent',
        says: 'The payment succeeded, so the billing saga has already issued the invoice in Fakturownia. Send it on to KSeF — one click, one flag.',
        requires: [
          { id: 'invoice-shown', see: 'the issued invoice, with its number', readableMs: 2500 },
          { id: 'matches-plan', see: 'the invoice naming the tier that was just bought' },
        ],
        atomic: [{ id: 'sim', kind: 'visible', testid: 'fakturownia-sim-send' }],
        // The buyer on the invoice is the company the NIP resolved to, six
        // beats and one checkout earlier. The sim prints it as a constant, so
        // the day either side moves this is what says so.
        carries: 'screen',
      },
      {
        step: 'ksef-done',
        says: 'And there it is — registered in the national e-invoice system, with its KSeF number.',
        requires: [{ id: 'ksef-number', see: 'a KSeF reference number', readableMs: 2500 }],
        atomic: [{ id: 'sim', kind: 'visible', testid: 'ksef-sim-done' }],
      },
    ],
  },
  {
    tour: 'support-ticket',
    // The reference issued when the ticket is raised.
    subject: { from: 'send', read: 'ticket-reference', extract: 'CIO-[0-9]{4}-[0-9]{4}' },
    phases: [
      {
        step: 'describe',
        says: "Something's not right? Describe it: a subject and the details. Press, and we type an example for you.",
        requires: [
          { id: 'form', see: 'a ticket form with a subject and a description' },
          {
            id: 'described',
            see: 'both actually filled in, legible in their fields',
            readableMs: 1500,
            via: 'create-ticket-subject',
          },
        ],
        atomic: [{ id: 'subject', kind: 'visible', testid: 'create-ticket-subject' }],
      },
      {
        step: 'send',
        says: 'The form is ready and the send button has come alive. Send — you get a reference code on the spot.',
        requires: [
          { id: 'send-live', see: 'the send button no longer greyed out' },
          { id: 'reference', see: 'a reference code shown once it is sent', readableMs: 2000 },
        ],
        atomic: [{ id: 'reference-shown', kind: 'visible', testid: 'ticket-reference' }],
      },
      {
        step: 'reference-issued',
        carries: 'screen',
        says: "That is the ticket reference — keep it. In production the same number goes out by mail, so the conversation has one identifier on both sides. Check the ticket's status.",
        requires: [
          {
            id: 'reference-readable',
            see: 'the ticket reference code, readable, with the ring on the status button beside it and not on the code',
            readableMs: 2500,
            via: 'create-ticket-view-status',
          },
        ],
        atomic: [{ id: 'on-status', kind: 'route', pattern: '^/support/tickets/status' }],
      },
      {
        step: 'read-response',
        carries: 'result',
        says: "Support has already answered. This is your ticket's status page — the same reference, the reply on the thread. In production a mail lands too, with the same number.",
        requires: [
          {
            id: 'reply-readable',
            see: 'the support reply, in full',
            readableMs: 4000,
            via: 'ticket-response-1',
          },
          {
            id: 'same-reference',
            see: 'the same reference code as the one given when it was sent',
          },
        ],
        atomic: [{ id: 'reply', kind: 'visible', testid: 'ticket-response-1' }],
      },
    ],
  },
  {
    tour: 'admin-ops',
    // No subject either, and for a better reason: both of its stories keep
    // their identity on screen by construction. The reply threads onto the
    // ticket the admin opened, on that ticket's own page; the cascade dialog
    // prints the campaign's title and company in its header in every state,
    // preview through receipt. There is nowhere for the subject to change.
    // What this tour DOES claim and nothing checks is a number - "exactly the
    // number the preview promised" - which is a different class, not this one.
    phases: [
      {
        step: 'admin-open',
        says: "This is the admin queue. Open the ticket — the customer's message is waiting on the thread.",
        requires: [
          { id: 'queue', see: 'the admin ticket queue with the ring on the ticket row' },
          { id: 'opened', see: "the ticket's own page once pressed" },
        ],
        atomic: [{ id: 'on-ticket', kind: 'route', pattern: '^/support/admin/tickets/[0-9]+' }],
      },
      {
        step: 'admin-draft',
        says: "Only the customer's message, no reply yet. Press, and we type the reply into the form.",
        requires: [
          {
            id: 'only-customer',
            see: "the thread holding only the customer's message — no reply yet",
          },
          {
            id: 'drafted',
            see: 'the reply typed into the form, legible',
            readableMs: 1500,
            via: 'admin-response-content',
          },
        ],
        atomic: [{ id: 'field', kind: 'visible', testid: 'admin-response-content' }],
      },
      {
        step: 'admin-send',
        says: 'The reply is ready and the button has come alive. Send — it threads onto the ticket at once, and the customer gets a mail with the same reference.',
        requires: [
          { id: 'send-live', see: 'the send button no longer greyed out' },
          { id: 'reply-posted', see: 'the reply on the thread once sent', readableMs: 2000 },
        ],
        atomic: [{ id: 'reply-there', kind: 'visible', testid: 'admin-ticket-response-1' }],
      },
      {
        step: 'to-campaigns',
        says: "The reply is on the thread — under the customer's message, signed and dated. That is how people and tickets are handled. Now we take you to collaboration management.",
        requires: [
          {
            id: 'on-the-thread',
            see: "the admin reply on the ticket thread, under the customer's message, with who wrote it and when",
            readableMs: 3000,
            via: 'admin-ticket-campaigns',
          },
          {
            id: 'sent-panel',
            see: 'a panel saying the reply went out, with the way to the campaigns and the guide beside it',
          },
        ],
        atomic: [{ id: 'cta', kind: 'visible', testid: 'admin-ticket-campaigns' }],
      },
      {
        step: 'cascade-delete',
        says: 'Now the serious one: a GDPR erasure request. You are on the campaign it concerns — open the cascade delete.',
        requires: [
          { id: 'preview-open', see: 'the cascade-delete dialog open' },
          {
            id: 'preview-arrives',
            see: 'the cascade-delete dialog open, with its itemised list',
          },
          { id: 'total', see: 'the total number of records' },
          {
            id: 'irreversible',
            see: 'the warning that this cannot be undone',
            readableMs: 2000,
            via: 'cascade-confirm',
          },
          {
            id: 'not-yet-deleted',
            see: 'nothing deleted yet — the dialog is waiting, not working',
          },
        ],
        atomic: [
          { id: 'confirm-present', kind: 'visible', testid: 'cascade-confirm' },
          { id: 'on-campaign', kind: 'route', pattern: '^/collaborations/502' },
        ],
      },
      {
        step: 'cascade-confirm',
        says: 'The counts in the preview are the real state of the database, not an estimate: records per system, and a warning for what cannot be undone. Confirm — the cascade runs through every layer.',
        requires: [
          {
            id: 'still-readable',
            see: 'the breakdown still on screen while the visitor decides',
            readableMs: 3000,
            via: 'cascade-confirm',
          },
        ],
        atomic: [{ id: 'result-shown', kind: 'visible', testid: 'cascade-success' }],
      },
      {
        step: 'cascade-receipt',
        says: 'Exactly the number the preview promised, and an audit-archive entry nobody can delete. Read the receipt before you close it.',
        requires: [
          {
            id: 'count-matches',
            see: 'a result panel naming how many records went, and the number matching the preview’s total',
            readableMs: 3000,
            via: 'cascade-success',
          },
          { id: 'audit-kept', see: 'the audit archive named as kept' },
        ],
        atomic: [{ id: 'close-gone', kind: 'absent', testid: 'cascade-close' }],
      },
      {
        step: 'by-the-book',
        says: "The cascade ran through Postgres, Firestore and Storage in one orchestrated flow — the campaign is gone from the marketplace, and the audit trail remains. That's GDPR as engineering. And that was the last sandbox — press Next for the wrap-up.",
        requires: [
          { id: 'gone-from-list', see: 'the marketplace list without campaign 502 on it' },
          {
            id: 'others-remain',
            see: 'the other campaigns still there — this was one erasure, not a wipe',
          },
        ],
        atomic: [{ id: 'on-list', kind: 'route', pattern: '^/collaborations/list' }],
      },
    ],
  },
];

/**
 * The technical half, derived rather than written down.
 *
 * Every step passes through the same four beats, because those are the
 * director's own states: armed (ring, pill, narration, nothing running),
 * performing (the recipe runs, the shield is up, the ring is hidden), awaiting
 * (the recipe is done and the application has not confirmed yet — deliberately
 * NOT shielded) and confirmed. Writing these out per step by hand would be 104
 * entries that could drift from `sandbox-director.service.ts`; deriving them
 * cannot.
 *
 * What the registry adds per step is which of them are reachable: a step with
 * no recipe never performs, and a step with no `done` never awaits.
 */
export function technicalPhases(
  tour: Tour,
  step: { id: string; perform?: readonly unknown[]; done?: unknown; sim?: string },
): Phase[] {
  const out: Phase[] = [];
  const phase = (
    name: string,
    says: string,
    allows: DirectorState[],
    atomic: AtomicCheck[] = [],
  ): void => {
    out.push({
      id: `${tour}/${step.id}#${name}`,
      step: step.id,
      layer: 'technical',
      says,
      requires: [],
      atomic,
      allows,
    });
  };

  phase(
    'armed',
    'the step is waiting for the visitor: ring on its control, a way forward offered, nothing running',
    ['idle'],
  );
  if (step.perform?.length) {
    phase('performing', 'the recipe is running: the shield takes input and the ring is hidden', [
      'performing',
    ]);
  }
  if (step.done || step.sim) {
    phase(
      'awaiting',
      'the recipe is finished and the application has not confirmed yet — the page must NOT be shielded here',
      ['awaiting'],
    );
  }
  phase('confirmed', 'the application has shown the step happened and the tour has moved on', [
    'advanced',
    'finished',
  ]);
  return out;
}
