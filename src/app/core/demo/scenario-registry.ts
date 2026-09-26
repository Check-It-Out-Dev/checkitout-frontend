/**
 * Scenario registry — the guided-demo scenarios as data (ported from the
 * legacy demo build's sandbox-registry; routes remapped to the greenfield
 * URL surface).
 *
 * A scenario drives the REAL app with a step machine: the DemoGuide
 * overlay narrates each step and the SandboxDirectorService advances on
 * the guide's "next" (manual) or when a demo-mode hook inside a real
 * component reports the user's action (event, matched by step id). World
 * simulators (phone TOTP / inbox / Fakturownia / KSeF) open per step.
 *
 * Step ids + step STRUCTURE are the legacy demo's verbatim — the i18n
 * narration corpus keys off them; only routes are remapped to the
 * greenfield URL surface.
 *
 * Every step ships `advanceOn: 'manual'`. Since 2026-09-04 a step may also
 * carry a `perform` recipe — the guide's pill then does the step for the
 * visitor (fills the form, presses the button, fires the simulator) before
 * advancing, so someone who only clicks Next still sees every screen
 * populated — a `target` selector the guide spotlights with that pill, and a
 * `done` condition: how the DOM shows the step happened. The director watches
 * it, so a visitor who does the step by hand moves on without touching the
 * guide, and a recipe waits for the app to catch up instead of guessing.
 *
 * i18n contract per scenario `<key>`:
 *   demo.sandboxes.<key>.title / tagline / proves
 *   demo.sandboxes.<key>.steps.<stepId>
 *   demo.sandboxes.<key>.recap.{f1,f2,f3}
 */
export type ScenarioKey =
  | 'admin-2fa'
  | 'stepup-email'
  | 'company-campaign'
  | 'influencer-collab'
  | 'nip-to-ksef'
  | 'support-ticket'
  | 'admin-ops';

export type ScenarioRole = 'COMPANY' | 'INFLUENCER' | 'ADMIN';

export type WorldSim = 'totp' | 'inbox-verify' | 'inbox-code' | 'fakturownia' | 'ksef';

/**
 * One instruction of a step's `perform` recipe, executed by the
 * GuideRunnerService against the live DOM. Selectors are the components'
 * `data-testid` hooks — the same ones the e2e tiers use.
 */
export type GuideAction =
  /** Wait until the element exists and is rendered (default 4 s). */
  | { kind: 'waitFor'; selector: string; timeoutMs?: number }
  /** Type into an input/textarea through the native setter + `input` event.
   * A value the visitor already typed is kept unless `overwrite` is set. */
  | { kind: 'fill'; selector: string; value: string; overwrite?: boolean }
  /** Type a value the demo minted earlier (sessionStorage; `field` for JSON). */
  | { kind: 'fillFromStorage'; selector: string; key: string; field?: string }
  | { kind: 'click'; selector: string }
  /** Navigate to `url` first when the control is not on the current page. */
  | { kind: 'ensure'; selector: string; url: string }
  | { kind: 'wait'; ms: number };

/**
 * How the DOM shows a step is done — by the visitor's own hands or by the
 * recipe. All given clauses must hold. `route` is a regular expression
 * matched against the current path (no query string).
 *
 * A `disappears` clause only counts once the element has been on screen: the
 * step arms while the next route is still rendering, when "not there" would
 * otherwise read as "already done".
 */
export interface StepDone {
  appears?: string;
  disappears?: string;
  route?: string;
  /** A key the demo writes once the step's outcome is real (sessionStorage).
   * The plan upgrade is the case: whoever clicks through the checkout, the
   * chosen plan is what proves it happened. */
  storage?: string;
}

export interface ScenarioStep {
  /** Stable id — also the i18n suffix and the notify() event key. */
  id: string;
  /** Route this step plays on; the director navigates when it changes. */
  route: string;
  /** manual = guide shows "next"; event = a demo hook calls notify(id). */
  advanceOn: 'manual' | 'event';
  /** Optional world simulator opened alongside this step. */
  sim?: WorldSim;
  /** Control the guide spotlights ("Kliknij tutaj") while the step waits. */
  target?: string;
  /** What "Dalej" does for the visitor before advancing. */
  perform?: GuideAction[];
  /** The recipe ends in a full page reload: persist the next step first. */
  reloads?: boolean;
  /** How the app itself confirms this step happened. */
  done?: StepDone;
}

export interface ScenarioDef {
  key: ScenarioKey;
  role: ScenarioRole;
  minutes: number;
  /** Material ligature for compact contexts. */
  icon: string;
  /** Native emoji for the hub card tile. */
  emoji: string;
  startRoute: string;
  /** Survey cross-link shown on the recap (chapter route + fragment). */
  surveyPath: string;
  surveyFragment: string;
  steps: ScenarioStep[];
}

const t = (id: string): string => `[data-testid="${id}"]`;

/** Where the demo records the plan the visitor chose (see demo-fixtures). */
const DEMO_PLAN_KEY = 'demoPlan';

export const SCENARIOS: ScenarioDef[] = [
  {
    key: 'admin-2fa',
    role: 'ADMIN',
    minutes: 3,
    icon: 'smartphone',
    emoji: '📱',
    startRoute: '/auth/sign-in',
    surveyPath: 'security',
    surveyFragment: 'auth-depth',
    steps: [
      {
        id: 'login',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        target: t('sign-in-submit'),
        perform: [{ kind: 'click', selector: t('sign-in-submit') }],
        done: { appears: t('two-factor-verify-code') },
      },
      // Generating a code and spending it are two beats, and they used to be
      // one press. The narration says "wygeneruj kod i przyjrzyj mu się
      // uważnie" — generate one and watch it closely — and then the guide
      // generated, typed and submitted in a single motion, so the code stood on
      // its own for 33 ms before the refusal landed on top of it. The story the
      // next beat tells, that the first code went stale before it could be
      // used, was narrated but never shown.
      //
      // The phone's own state is what confirms these, not the stored code: the
      // code survives the first generate, so `storage` would make the second
      // beat look done before it started.
      {
        id: 'first-code',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        sim: 'totp',
        target: t('totp-sim-generate'),
        done: { appears: t('totp-sim-stale') },
        perform: [{ kind: 'click', selector: t('totp-sim-generate') }],
      },
      {
        id: 'first-code-refused',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        sim: 'totp',
        target: t('two-factor-verify-code'),
        // The refusal IS this step's proof: the fixture rejects the first code
        // that is submitted, whatever the phone has been asked to produce.
        done: { appears: t('two-factor-verify-error') },
        perform: [
          {
            kind: 'fillFromStorage',
            selector: t('two-factor-verify-code'),
            key: 'demoTotp',
            field: 'code',
          },
          { kind: 'click', selector: t('two-factor-verify-submit') },
        ],
      },
      {
        id: 'fresh-code',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        sim: 'totp',
        target: t('totp-sim-generate'),
        done: { appears: t('totp-sim-fresh') },
        perform: [{ kind: 'click', selector: t('totp-sim-generate') }],
      },
      {
        id: 'signed-in',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        sim: 'totp',
        target: t('two-factor-verify-code'),
        // "The admin is in" — and that means the application they are now inside
        // has actually arrived, not merely that the dialog went away.
        //
        // Waiting only for the dialog let the tour declare itself finished 45 ms
        // before the router moved and about a tenth of a second before the
        // marketplace painted, so its "GOTOWE" panel sat congratulating the
        // visitor on top of the sign-in form they were supposed to have left.
        // Both clauses have to hold, so the recap arrives with the screen it
        // describes. No timer: the page says when it is ready.
        done: {
          disappears: t('two-factor-verify-code'),
          appears: '[data-testid^="opportunity-card-"]',
        },
        perform: [
          {
            kind: 'fillFromStorage',
            selector: t('two-factor-verify-code'),
            key: 'demoTotp',
            field: 'code',
          },
          { kind: 'click', selector: t('two-factor-verify-submit') },
        ],
      },
    ],
  },
  {
    key: 'stepup-email',
    role: 'COMPANY',
    minutes: 2,
    icon: 'mail',
    emoji: '📧',
    startRoute: '/user/settings/account',
    surveyPath: 'security',
    surveyFragment: 'auth-depth',
    steps: [
      {
        id: 'change-email',
        route: '/user/settings/account',
        advanceOn: 'manual',
        target: t('email-change-start'),
        perform: [
          { kind: 'click', selector: t('email-change-start') },
          { kind: 'fill', selector: t('email-change-input'), value: 'nowy.adres@zloteziarno.pl' },
          { kind: 'click', selector: t('email-change-submit') },
        ],
        done: { appears: t('step-up-code-input') },
      },
      {
        id: 'enter-code',
        route: '/user/settings/account',
        advanceOn: 'manual',
        sim: 'inbox-code',
        target: t('step-up-code-input'),
        perform: [
          { kind: 'fillFromStorage', selector: t('step-up-code-input'), key: 'demoStepUpCode' },
          { kind: 'click', selector: t('step-up-verify') },
        ],
        done: { disappears: t('step-up-code-input') },
      },
      { id: 'saved', route: '/user/settings/account', advanceOn: 'manual' },
    ],
  },
  {
    key: 'company-campaign',
    role: 'COMPANY',
    minutes: 4,
    icon: 'campaign',
    emoji: '🚀',
    startRoute: '/collaborations/create',
    surveyPath: 'platform',
    surveyFragment: 'stack',
    steps: [
      {
        id: 'create-campaign',
        route: '/collaborations/create',
        advanceOn: 'manual',
        target: t('opp-form-name'),
        perform: [
          { kind: 'fill', selector: t('opp-form-name'), value: 'Letnia karta kawowa' },
          {
            kind: 'fill',
            selector: t('opp-form-title-input'),
            value: 'Recenzje nowej karty kawowej',
          },
          { kind: 'fill', selector: t('opp-form-street'), value: 'ul. Kawowa 12' },
          { kind: 'fill', selector: t('opp-form-city'), value: 'Warszawa' },
          { kind: 'fill', selector: t('opp-form-postal-code'), value: '00-001' },
          { kind: 'fill', selector: t('opp-form-country'), value: 'Polska' },
          {
            kind: 'fill',
            selector: t('opp-form-details'),
            value: 'Krótki reel z wizyty w kawiarni, dwa zdjęcia produktu i oznaczenie profilu.',
          },
        ],
        // The submit is disabled while the form is invalid, so it going live is
        // how the application says the brief is complete.
        done: { appears: `${t('opp-form-submit')}:not([disabled])` },
      },
      // Filling the brief and publishing it are two things, and doing both on
      // one press left the published campaign - the only screen in the film that
      // names it - alive for a single frame, about 18 ms, before the applicants
      // page replaced it. Two reviewers, one on each path, reported the same:
      // the tour's three beats are about three different campaigns and the
      // narration treats them as one.
      {
        id: 'publish-campaign',
        route: '/collaborations/create',
        advanceOn: 'manual',
        target: t('opp-form-submit'),
        perform: [{ kind: 'click', selector: t('opp-form-submit') }],
        // A saved campaign lands on its own detail page.
        done: { route: '^/collaborations/\\d+$' },
      },
      // Same route string as the beat before, so nothing navigates: the tour
      // stays on the page the publish landed it on and lets it be read.
      {
        id: 'campaign-live',
        route: '/collaborations/create',
        advanceOn: 'manual',
        target: t('opportunity-detail-card'),
      },
      // The company's decide UI lives on the campaign's applicants page —
      // /collaborations/registrations is the influencer-shaped list and has
      // no accept/decline controls. 501 is the seeded campaign the demo
      // company owns, with Ola's fresh application waiting.
      {
        id: 'decide-applicant',
        route: '/collaborations/501/applicants',
        advanceOn: 'manual',
        target: '[data-testid^="applicant-accept-"]',
        perform: [{ kind: 'click', selector: '[data-testid^="applicant-accept-"]' }],
        done: { disappears: '[data-testid^="applicant-accept-"]' },
      },
      { id: 'lifecycle', route: '/collaborations/in-progress', advanceOn: 'manual' },
    ],
  },
  {
    key: 'influencer-collab',
    role: 'INFLUENCER',
    minutes: 3,
    icon: 'handshake',
    emoji: '🤝',
    startRoute: '/collaborations/list',
    surveyPath: 'platform',
    surveyFragment: 'subscription-fsm',
    steps: [
      {
        id: 'browse',
        route: '/collaborations/list',
        advanceOn: 'manual',
        // 503 is the seeded campaign Ola has not applied to yet, so the next
        // step's apply button is on the page the recipe lands on.
        target: '[data-testid="opportunity-card-503"]',
        perform: [{ kind: 'click', selector: '[data-testid="opportunity-card-503"]' }],
        done: { route: '^/collaborations/\\d+$' },
      },
      // The apply button lives on the campaign detail; after a refresh the
      // definition route restores the list, so the recipe finds its way to a
      // seeded campaign first.
      {
        id: 'apply',
        route: '/collaborations/list',
        advanceOn: 'manual',
        target: t('opportunity-detail-apply-button'),
        perform: [
          {
            kind: 'ensure',
            selector: t('opportunity-detail-apply-button'),
            url: '/collaborations/503',
          },
          { kind: 'click', selector: t('opportunity-detail-apply-button') },
        ],
        done: { appears: t('opportunity-detail-applied') },
      },
      // …and then stop on it. The confirmation of the visitor's own application
      // was on screen for zero frames: the next beat's route replaced it in the
      // same press. Same route string as the beat before, so the tour stays on
      // the campaign it just applied to.
      {
        id: 'applied',
        route: '/collaborations/list',
        advanceOn: 'manual',
        target: t('opportunity-detail-applied'),
      },
      // ?tab=in-progress: accepted rows live in the "W trakcie" bucket — the
      // narration promises a green status, so land where it is visible.
      {
        id: 'accepted',
        route: '/collaborations/registrations?tab=in-progress',
        advanceOn: 'manual',
      },
    ],
  },
  {
    key: 'nip-to-ksef',
    role: 'COMPANY',
    minutes: 4,
    icon: 'credit_card',
    emoji: '🧾',
    startRoute: '/company/setup',
    surveyPath: 'platform',
    surveyFragment: 'billing-saga',
    steps: [
      {
        id: 'nip-lookup',
        route: '/company/setup',
        advanceOn: 'manual',
        target: t('company-setup-nip'),
        perform: [
          { kind: 'fill', selector: t('company-setup-nip'), value: '5260250995' },
          { kind: 'click', selector: t('company-setup-verify') },
        ],
        done: { appears: t('company-setup-confirm') },
      },
      {
        id: 'company-confirmed',
        route: '/company/setup',
        advanceOn: 'manual',
        target: t('company-setup-confirm'),
        perform: [{ kind: 'click', selector: t('company-setup-confirm') }],
        done: { appears: t('company-setup-done') },
      },
      {
        id: 'verify-mail',
        route: '/company/setup',
        advanceOn: 'manual',
        sim: 'inbox-verify',
        target: t('inbox-sim-cta'),
        perform: [{ kind: 'click', selector: t('inbox-sim-cta') }],
      },
      { id: 'activated', route: '/subscription', advanceOn: 'manual' },
      // Checkout hands off through a full reload (plan-billing redirects after
      // the fixture stores the plan) — the director persists the next step
      // before the recipe runs so the guide resumes on the invoice beat.
      // Opening the checkout is a beat of its own. It used to be the first of
      // three clicks in one recipe, and the dialog carrying the plan, the price,
      // the terms and the consent box was measured on production as living for
      // 101 ms — no time at all to read what you are agreeing to. The tour now
      // stops here, with the dialog open, until the visitor asks for the rest.
      {
        id: 'upgrade',
        route: '/subscription',
        advanceOn: 'manual',
        target: t('plan-billing-upgrade-enterprise'),
        done: { appears: t('upgrade-confirm-submit') },
        perform: [{ kind: 'click', selector: t('plan-billing-upgrade-enterprise') }],
      },
      // Ticking the box is its own beat, because the button below it is dead
      // until you do.
      //
      // The ring used to point straight at "Przejdź do płatności" while it was
      // grey and disabled, with the consent checkbox above it unticked and
      // unmentioned by the narration. On the guided path that was invisible —
      // the recipe ticked the box on the visitor's behalf on its way past. By
      // hand it is a dead end: you click the thing the tour is pointing at and
      // nothing happens. Found by a reviewer looking at frames of the checkout,
      // and it is the third time the by-hand path has held a defect the guided
      // path could not show.
      {
        id: 'upgrade-terms',
        route: '/subscription',
        advanceOn: 'manual',
        target: t('upgrade-consent-checkbox'),
        done: { appears: `${t('upgrade-consent-checkbox')} input:checked` },
        perform: [
          // Only when it is not already ticked — pressing the pill after doing
          // it by hand would otherwise untick it. The wait that follows is what
          // lets the runner skip the click: an action whose selector is gone
          // while a later one's is on screen has already happened.
          { kind: 'click', selector: `${t('upgrade-consent-checkbox')} input:not(:checked)` },
          { kind: 'waitFor', selector: `${t('upgrade-consent-checkbox')} input:checked` },
        ],
      },
      {
        id: 'upgrade-confirm',
        route: '/subscription',
        advanceOn: 'manual',
        target: t('upgrade-confirm-submit'),
        reloads: true,
        // Whoever clicks through the checkout — the guide or the visitor — the
        // stored plan is the proof. Without it the tour kept asking someone to
        // buy a tier they had already bought.
        done: { storage: DEMO_PLAN_KEY },
        perform: [
          // Re-opens the checkout if the visitor closed it, and is skipped when
          // the dialog is already up: a click on a control a modal covers is a
          // click a person could not make, so the runner passes over it.
          { kind: 'click', selector: t('plan-billing-upgrade-enterprise') },
          // A closed and reopened dialog comes back with the box unticked, so
          // the consent still has to be recoverable here — but only then.
          { kind: 'click', selector: `${t('upgrade-consent-checkbox')} input:not(:checked)` },
          { kind: 'click', selector: t('upgrade-confirm-submit') },
        ],
      },
      {
        id: 'invoice-sent',
        route: '/subscription',
        advanceOn: 'manual',
        sim: 'fakturownia',
        target: t('fakturownia-sim-send'),
        perform: [{ kind: 'click', selector: t('fakturownia-sim-send') }],
      },
      {
        id: 'ksef-done',
        route: '/subscription',
        advanceOn: 'manual',
        sim: 'ksef',
        target: t('ksef-sim-done'),
        perform: [{ kind: 'click', selector: t('ksef-sim-done') }],
      },
    ],
  },
  {
    key: 'support-ticket',
    role: 'COMPANY',
    minutes: 2,
    icon: 'support_agent',
    emoji: '🛟',
    startRoute: '/support/tickets/create',
    surveyPath: 'operations',
    surveyFragment: 'observability',
    steps: [
      {
        id: 'ticket-created',
        route: '/support/tickets/create',
        advanceOn: 'manual',
        target: t('create-ticket-subject'),
        // No e-mail fill: a signed-in visitor gets the read-only variant of that
        // field, so waiting for the editable one cost four seconds of shielded
        // page before the rest of the recipe ran (measured 2026-09).
        perform: [
          {
            kind: 'fill',
            selector: t('create-ticket-subject'),
            value: 'Pytanie o fakturę za wrzesień',
          },
          {
            kind: 'fill',
            selector: t('create-ticket-description'),
            value:
              'Czy mogę otrzymać fakturę na inne dane niż te w profilu firmy? Zmieniliśmy adres siedziby w sierpniu.',
          },
          { kind: 'click', selector: t('create-ticket-submit') },
        ],
        done: { appears: t('ticket-reference') },
      },
      // The reference is the whole point of raising a ticket, and it lived 56 ms
      // — E-BLINK, measured by demo-payoffs across every step of every tour. The
      // beat that produced it navigated away in the same press. Same route
      // string, so nothing moves; the ring goes on the code and waits.
      {
        id: 'reference-issued',
        route: '/support/tickets/create',
        advanceOn: 'manual',
        target: t('ticket-reference'),
      },
      // The newest row, which is the ticket the beat before just raised — the
      // list puts a created ticket first, and it now carries an answer of its
      // own. It used to ring the seeded ticket, because that was the only one
      // with a reply on it, so the beat sent the visitor to a different ticket
      // from the one whose reference they had just been given.
      {
        id: 'read-response',
        route: '/support/tickets/my-tickets',
        advanceOn: 'manual',
        target: '[data-testid^="my-ticket-row-"]',
        perform: [{ kind: 'click', selector: '[data-testid^="my-ticket-row-"]' }],
        done: { route: '^/support/tickets/status' },
      },
    ],
  },
  {
    key: 'admin-ops',
    role: 'ADMIN',
    minutes: 3,
    icon: 'shield',
    emoji: '🛡️',
    startRoute: '/support/admin/tickets',
    surveyPath: 'operations',
    surveyFragment: 'immutability',
    steps: [
      {
        id: 'admin-respond',
        route: '/support/admin/tickets',
        advanceOn: 'manual',
        target: '[data-testid^="admin-ticket-row-"]',
        perform: [
          { kind: 'click', selector: '[data-testid^="admin-ticket-row-"]' },
          {
            kind: 'fill',
            selector: t('admin-response-content'),
            value:
              'Dziękujemy za zgłoszenie. Opublikowaną kampanię edytuje się z poziomu „Moje kampanie” → „Edytuj”; zmiany zapisują się natychmiast.',
          },
          { kind: 'click', selector: t('admin-response-submit') },
        ],
        // The seeded ticket 9001 carries one reply; the admin's is the second.
        done: { appears: t('admin-ticket-response-2') },
      },
      // And then stop, so that the thing the beat above promises can be seen.
      //
      // One press opened the ticket, typed the reply, submitted it and moved on:
      // measured across every frame of a filmed run, the threaded reply existed
      // in exactly one frame, 101 ms, between a ticket list and a campaign page.
      // The narration says "Twoja odpowiedź trafia do wątku natychmiast" to a
      // visitor who never sees a ticket, a reply or a thread. Same route as the
      // beat before it, so nothing navigates; the ring simply moves to the reply
      // and waits. This is the third beat in the sandbox to be split for this
      // reason — the cascade preview at 112 ms and the checkout at 101 ms were
      // the first two.
      {
        id: 'reply-threaded',
        route: '/support/admin/tickets',
        advanceOn: 'manual',
        target: t('admin-ticket-response-2'),
      },
      // The RODO cascade affordance lives on the campaign detail (admin-only
      // control; the user directory is a read-only approval queue — legacy
      // parity, PARITY iter-101). 502 is a seeded campaign with real data.
      // Opening the preview and acting on it are two beats, for the same
      // reason the checkout is: this dialog itemises every record about to be
      // destroyed, per system, and says in red that none of it comes back. Run
      // as one recipe it was on screen for 112 ms — while the narration was
      // telling the visitor to review it.
      {
        id: 'cascade-delete',
        route: '/collaborations/502',
        advanceOn: 'manual',
        target: t('opportunity-admin-delete'),
        done: { appears: t('cascade-confirm') },
        perform: [{ kind: 'click', selector: t('opportunity-admin-delete') }],
      },
      {
        id: 'cascade-confirm',
        route: '/collaborations/502',
        advanceOn: 'manual',
        target: t('cascade-confirm'),
        // `disappears` is only meaningful once the element has been seen, and
        // the close button appears mid-recipe — so a swallowed confirm leaves
        // it unseen and the step holds, instead of reading "not there yet" as
        // "already done".
        done: { appears: t('cascade-success') },
        perform: [
          // re-opens the dialog if the visitor closed it; skipped when it is
          // already up, since a click a modal covers is one nobody could make
          { kind: 'click', selector: t('opportunity-admin-delete') },
          { kind: 'click', selector: t('cascade-confirm') },
        ],
      },
      // The receipt is the only proof the preview told the truth.
      //
      // "Usunięto 9 rekordów. Archiwum audytowe zapisane." against the preview's
      // "Łącznie rekordów 9" is the whole argument of this tour, and it is the
      // only place the audit trail is ever evidenced — the closing beat then
      // asserts it. Confirming and closing were one recipe, so that panel was
      // opaque in a single frame, 91 ms, and dissolving in the next. Exactly the
      // defect that split the preview off, one screen later.
      {
        id: 'cascade-receipt',
        route: '/collaborations/502',
        advanceOn: 'manual',
        target: t('cascade-success'),
        done: { disappears: t('cascade-close') },
        perform: [{ kind: 'click', selector: t('cascade-close') }],
      },
      // After the cascade the marketplace list proves the point: 502 is gone.
      { id: 'by-the-book', route: '/collaborations/list', advanceOn: 'manual' },
    ],
  },
];

export function scenarioByKey(key: ScenarioKey): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

export const SCENARIO_COUNT = SCENARIOS.length;
