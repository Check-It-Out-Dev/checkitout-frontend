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
        says: 'A campaign brief is one form. Fill it in - the internal name, the public title, where you are meeting, and what you want from the creator.',
        requires: [
          { id: 'form-visible', see: 'the campaign form' },
          {
            id: 'fields-filled',
            see: 'the form carrying its values, each one legible and not printed under its own label',
            readableMs: 2000,
            via: 'opp-form-name',
          },
        ],
        atomic: [{ id: 'form', kind: 'visible', testid: 'opp-form-name' }],
      },
      {
        step: 'publish-campaign',
        says: 'The form is complete, so the publish button has come alive. Publish it - the campaign gets a page of its own.',
        requires: [
          { id: 'enabled', see: 'the publish button no longer greyed out' },
          { id: 'lands-on-detail', see: "the saved campaign's own page once it is published" },
        ],
        atomic: [{ id: 'saved', kind: 'route', pattern: '^/collaborations/\\d+$' }],
      },
      {
        step: 'campaign-live',
        carries: 'screen',
        says: 'This is the published campaign: the public title, the location and the brief, exactly as a creator will see it.',
        requires: [
          {
            id: 'names-it',
            see: 'the published campaign naming the public title that was typed into the form',
            readableMs: 3000,
            via: 'opportunity-detail-card',
          },
          { id: 'brief-there', see: 'the brief text on it' },
        ],
        atomic: [{ id: 'on-detail', kind: 'route', pattern: '^/collaborations/\\d+$' }],
      },
      {
        step: 'decide-applicant',
        says: "Once published, a campaign starts collecting applications right away. These are your campaign's applicants: decide on Ola's application — accept it or pass.",
        requires: [
          { id: 'applicants-list', see: 'the applicants list for this campaign, with Ola on it' },
          {
            id: 'both-choices',
            see: 'both an accept and a decline control — the visitor is being given a decision',
          },
          { id: 'decision-lands', see: 'the accept control gone once the decision is made' },
        ],
        atomic: [
          { id: 'on-applicants', kind: 'route', pattern: '^/collaborations/\\d+/applicants' },
          { id: 'accept-gone', kind: 'absent', testid: 'applicant-accept-8101' },
        ],
      },
      {
        step: 'lifecycle',
        says: 'Accepted — the collaboration moved to In Progress. Every state you have just walked is the same machine the survey draws.',
        requires: [{ id: 'in-progress', see: 'the collaboration listed as in progress' }],
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
        says: 'One thing left: prove the e-mail is yours. The branded mail just landed — open the inbox and click.',
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
        step: 'activated',
        says: 'That click auto-activated the account — no human in the loop. You are on the plan page now: see the campaign limits per plan.',
        requires: [
          { id: 'plan-page', see: 'the plan and billing page' },
          {
            id: 'limits-legible',
            see: 'the campaign limits for each plan, readable side by side',
            readableMs: 3000,
            via: 'plan-billing-upgrade-enterprise',
          },
        ],
        atomic: [{ id: 'on-plan', kind: 'route', pattern: '^/user/settings/plan-billing' }],
      },
      {
        step: 'upgrade',
        says: 'Need more room? Open the plan change — we show the price and the terms before you confirm anything.',
        requires: [
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
        says: 'The card is already attached — confirm, and the payment and activation run themselves.',
        requires: [
          {
            id: 'enabled',
            see: 'the payment button no longer greyed out, now that the box is ticked',
          },
          { id: 'card', see: 'the attached test card' },
          {
            id: 'new-tier-after',
            see: 'the new tier active on the plan page once the checkout returns',
          },
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
    subject: { from: 'ticket-created', read: 'ticket-reference', extract: 'CIO-[0-9]{4}-[0-9]{4}' },
    phases: [
      {
        step: 'ticket-created',
        says: 'Something is not right? Describe it and send — you will get a reference code on the spot.',
        requires: [
          { id: 'form', see: 'a ticket form with a subject and a description' },
          { id: 'described', see: 'both actually filled in before it is sent' },
          { id: 'reference', see: 'a reference code shown once it is sent', readableMs: 2000 },
        ],
        atomic: [{ id: 'subject', kind: 'visible', testid: 'create-ticket-subject' }],
      },
      {
        step: 'reference-issued',
        carries: 'screen',
        says: 'That is the ticket reference - keep it. In production the same number goes out by mail, so the conversation has one identifier on both sides.',
        requires: [
          {
            id: 'reference-readable',
            see: 'the ticket reference code, readable',
            readableMs: 2500,
            via: 'ticket-reference',
          },
        ],
        atomic: [{ id: 'reference', kind: 'visible', testid: 'ticket-reference' }],
      },
      {
        step: 'read-response',
        carries: 'result',
        says: 'Support has already answered. This is your tickets view — open it and read the reply. In production a mail lands too, with the same reference.',
        requires: [
          { id: 'ticket-list', see: "the visitor's own tickets, with the new one on it" },
          { id: 'reply-readable', see: 'the support reply, in full', readableMs: 4000 },
          {
            id: 'same-reference',
            see: 'the same reference code as the one given when it was sent',
          },
        ],
        atomic: [{ id: 'on-status', kind: 'route', pattern: '^/support/tickets' }],
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
        step: 'admin-respond',
        says: 'This is the admin queue. Open a ticket and answer the user — your reply threads onto it instantly.',
        requires: [
          { id: 'queue', see: 'the admin ticket queue' },
          { id: 'reply-posted', see: 'the reply submitted on the open ticket' },
        ],
        atomic: [{ id: 'on-admin', kind: 'route', pattern: '^/support/admin/tickets' }],
      },
      {
        step: 'reply-threaded',
        says: 'The reply is on the thread already — under the customer’s message, signed and dated. In production a mail goes out at the same moment, carrying the same reference.',
        requires: [
          {
            id: 'on-the-thread',
            see: 'the admin reply on the ticket thread, under the customer’s message, with who wrote it and when',
            readableMs: 3000,
            via: 'admin-ticket-response-2',
          },
          {
            id: 'still-the-ticket',
            see: 'the ticket still open — the tour has not navigated away',
          },
        ],
        atomic: [{ id: 'reply-there', kind: 'visible', testid: 'admin-ticket-response-2' }],
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
        says: 'The cascade ran through Postgres, Firestore and Storage in one orchestrated flow — the campaign is gone from the marketplace, and the audit trail remains. That is GDPR as engineering.',
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
