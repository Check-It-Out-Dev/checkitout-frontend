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

export type WorldSim = 'totp' | 'inbox-verify' | 'inbox-code' | 'checkout' | 'fakturownia' | 'ksef';

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
  /** Pick options in a mat-select by their visible text: opens the panel,
   * presses each option, presses the backdrop when the panel stays open. */
  | { kind: 'select'; selector: string; options: string[] }
  /** Hand files to a hidden file input the way a picker would. `button` is
   * the visible control the person would press; `selector` is the input. */
  | {
      kind: 'attach';
      selector: string;
      button: string;
      files: { url: string; name: string; type: string }[];
    }
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
      // The phone and the form are two beats, and the split has moved once
      // already. First the guide generated, typed and submitted in one motion,
      // so the code stood on its own for 33 ms before the refusal landed on top
      // of it. Then generating was a beat and typing-and-sending the next — and
      // the visitor watched a code sit on the phone while the ring asked them
      // to press a text field (owner, 2026-09-07: the "click here" is meant to
      // do what a person would do; we are doing it for them). Now the phone's
      // press generates the code AND types it into the form — what anyone does
      // with a code they have just read off a phone — and the form's press
      // sends it. The refusal, and later the welcome, still arrive on a press
      // of their own, and stay readable.
      //
      // The phone's own state confirms the generate beats, not the stored code:
      // the code survives the first generate, so `storage` would make the
      // second beat look done before it started. The send beats keep the fill
      // in their recipe, so a visitor who generated by hand and typed nothing
      // is not handed a disabled button.
      {
        id: 'first-code',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        sim: 'totp',
        target: t('totp-sim-generate'),
        done: { appears: t('totp-sim-stale') },
        perform: [
          { kind: 'click', selector: t('totp-sim-generate') },
          {
            kind: 'fillFromStorage',
            selector: t('two-factor-verify-code'),
            key: 'demoTotp',
            field: 'code',
          },
        ],
      },
      {
        id: 'first-code-refused',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        sim: 'totp',
        target: t('two-factor-verify-submit'),
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
        perform: [
          { kind: 'click', selector: t('totp-sim-generate') },
          {
            kind: 'fillFromStorage',
            selector: t('two-factor-verify-code'),
            key: 'demoTotp',
            field: 'code',
          },
        ],
      },
      {
        id: 'signed-in',
        route: '/auth/sign-in',
        advanceOn: 'manual',
        sim: 'totp',
        target: t('two-factor-verify-submit'),
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
      // Typing the code and sending it are two presses (owner, 2026-09-07):
      // the press on the field copies the code out of the inbox into it, the
      // way a person would, and the ring then moves to the verify button. One
      // press used to do both, so the visitor never saw the code in the field.
      // The field's press is confirmed by the verify button going live — the
      // dialog disables it until six digits are in — which also carries a
      // visitor who reads the inbox and types the code by hand.
      {
        id: 'enter-code',
        route: '/user/settings/account',
        advanceOn: 'manual',
        sim: 'inbox-code',
        target: t('step-up-code-input'),
        perform: [
          { kind: 'fillFromStorage', selector: t('step-up-code-input'), key: 'demoStepUpCode' },
        ],
        done: { appears: `${t('step-up-verify')}:not([disabled])` },
      },
      {
        id: 'verify-code',
        route: '/user/settings/account',
        advanceOn: 'manual',
        sim: 'inbox-code',
        target: t('step-up-verify'),
        // The fill stays in front of the click for a visitor who generated the
        // step by hand and typed nothing: a minted code replaces what is there.
        perform: [
          { kind: 'fillFromStorage', selector: t('step-up-code-input'), key: 'demoStepUpCode' },
          { kind: 'click', selector: t('step-up-verify') },
        ],
        done: { disappears: t('step-up-code-input') },
      },
      // The payoff has something to look at: the card that says the link went
      // to the new address — the one the recipe typed, or the visitor's own.
      {
        id: 'saved',
        route: '/user/settings/account',
        advanceOn: 'manual',
        target: t('email-change-sent'),
      },
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
      // The brief is one long form. Filling all of it on one press and then
      // pointing at the publish button 1500 px lower read as a jump, not a
      // scroll (owner, 2026-09-07): two presses now, the top of the form and the
      // rest of it, with the page gliding down between them.
      {
        id: 'create-campaign',
        route: '/collaborations/create',
        advanceOn: 'manual',
        target: t('opp-form-name'),
        perform: [
          { kind: 'fill', selector: t('opp-form-name'), value: 'Nowa karta kawowa' },
          {
            kind: 'fill',
            selector: t('opp-form-title-input'),
            value: 'Recenzje nowej karty kawowej',
          },
          { kind: 'fill', selector: t('opp-form-street'), value: 'ul. Kawowa 12' },
          { kind: 'fill', selector: t('opp-form-city'), value: 'Warszawa' },
          { kind: 'fill', selector: t('opp-form-postal-code'), value: '00-001' },
          { kind: 'fill', selector: t('opp-form-country'), value: 'Polska' },
        ],
        // The top of the form carrying values the form accepts — whoever typed
        // them.
        done: {
          appears:
            `${t('opp-form')}:has(${t('opp-form-name')}.ng-valid.ng-dirty)` +
            `:has(${t('opp-form-title-input')}.ng-valid.ng-dirty)` +
            `:has(${t('opp-form-city')}.ng-valid.ng-dirty)` +
            `:has(${t('opp-form-country')}.ng-valid.ng-dirty)`,
        },
      },
      {
        id: 'complete-brief',
        route: '/collaborations/create',
        advanceOn: 'manual',
        target: t('opp-form-details'),
        perform: [
          {
            kind: 'fill',
            selector: t('opp-form-details'),
            value:
              'Krótki reel z wizyty w kawiarni, dwa zdjęcia nowej karty i oznaczenie profilu. ' +
              'Pokaż kawę tak, jak ją pijesz — bez skryptu.',
          },
          {
            kind: 'fill',
            selector: t('opp-form-requirements'),
            value: 'Profil lifestyle lub food, treści po polsku, publikacja do końca października.',
          },
          { kind: 'click', selector: `${t('opp-form-comp-type')} input[value="CASH"]` },
          { kind: 'fill', selector: t('opp-form-amount-min'), value: '600' },
          { kind: 'fill', selector: t('opp-form-amount-max'), value: '1200' },
          { kind: 'select', selector: t('opp-form-currency'), options: ['PLN'] },
          {
            kind: 'fill',
            selector: t('opp-form-comp-description'),
            value:
              'Płatność po akceptacji publikacji, do tego nowa karta kawowa na koszt kawiarni.',
          },
          { kind: 'select', selector: t('opp-form-service-type'), options: ['Recenzja produktu'] },
          { kind: 'select', selector: t('opp-form-platforms'), options: ['Instagram', 'TikTok'] },
          { kind: 'select', selector: t('opp-form-content-types'), options: ['Reels', 'Stories'] },
          { kind: 'fill', selector: t('opp-form-followers-min'), value: '5000' },
          { kind: 'fill', selector: t('opp-form-followers-max'), value: '60000' },
          { kind: 'fill', selector: t('opp-form-start-date'), value: '2026-09-21' },
          { kind: 'fill', selector: t('opp-form-end-date'), value: '2026-10-19' },
          {
            kind: 'attach',
            selector: t('opp-form-photo-input'),
            button: t('opp-form-photo-add'),
            files: [
              {
                url: '/assets/demo/campaign/karta-kawowa.png',
                name: 'karta-kawowa.png',
                type: 'image/png',
              },
              { url: '/assets/demo/campaign/latte.png', name: 'latte.png', type: 'image/png' },
            ],
          },
        ],
        // The second photo's thumbnail is the last thing the recipe produces.
        done: { appears: t('opp-form-photo-1') },
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
      // stays on the page the publish landed it on and lets it be read. The
      // way onward is the page's own control — the guide sits beside it.
      {
        id: 'campaign-live',
        route: '/collaborations/create',
        advanceOn: 'manual',
        target: t('opportunity-detail-manage'),
        perform: [{ kind: 'click', selector: t('opportunity-detail-manage') }],
        done: { route: '^/collaborations/applicants$' },
      },
      // The company's decide UI is the applications inbox — every campaign of
      // the company, at the stage where the decision is still the company's.
      // Ola's fresh application waits there under the campaign just published;
      // Piotr, accepted a week ago, sits under the summer one.
      {
        id: 'decide-applicant',
        route: '/collaborations/applicants',
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
        // A page reloaded mid-tour may already be past this beat: the setup
        // page then shows the company as confirmed, and that counts too.
        done: { appears: `${t('company-setup-confirm')}, ${t('company-setup-confirmed')}` },
      },
      {
        id: 'company-confirmed',
        route: '/company/setup',
        advanceOn: 'manual',
        target: t('company-setup-confirm'),
        // Self-sufficient: after a reload the lookup is gone and the form is
        // empty, so the press rebuilds the state it needs before confirming.
        // The runner skips each action whose control has already gone by.
        perform: [
          { kind: 'fill', selector: t('company-setup-nip'), value: '5260250995' },
          { kind: 'click', selector: t('company-setup-verify') },
          { kind: 'waitFor', selector: t('company-setup-confirm') },
          { kind: 'click', selector: t('company-setup-confirm') },
        ],
        done: { appears: `${t('company-setup-done')}, ${t('company-setup-confirmed')}` },
      },
      // The mail lands in the inbox docked bottom-left; the page behind it
      // says the account is waiting for exactly that click.
      {
        id: 'verify-mail',
        route: '/company/setup',
        advanceOn: 'manual',
        sim: 'inbox-verify',
        target: t('inbox-sim-cta'),
        perform: [{ kind: 'click', selector: t('inbox-sim-cta') }],
      },
      // The click flipped the card in the middle of the page to "active", and
      // the way onward is that card's own control — the pill sits beside it.
      {
        id: 'account-active',
        route: '/company/setup',
        advanceOn: 'manual',
        target: t('company-setup-subscription'),
        perform: [{ kind: 'click', selector: t('company-setup-subscription') }],
        done: { route: '^/user/settings/plan-billing' },
      },
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
          // The dialog closed by hand (Cancel) comes back: a click on a control
          // the dialog covers is skipped, so this is a no-op while it is open.
          { kind: 'click', selector: t('plan-billing-upgrade-enterprise') },
          { kind: 'waitFor', selector: t('upgrade-consent-checkbox') },
          // Only when it is not already ticked — pressing the pill after doing
          // it by hand would otherwise untick it. The wait that follows is what
          // lets the runner skip the click: an action whose selector is gone
          // while a later one's is on screen has already happened.
          { kind: 'click', selector: `${t('upgrade-consent-checkbox')} input:not(:checked)` },
          { kind: 'waitFor', selector: `${t('upgrade-consent-checkbox')} input:checked` },
        ],
      },
      // Confirming hands off to the checkout — Stripe's page in production,
      // its simulator here — without leaving the app: the dialog going is
      // what says it happened.
      {
        id: 'upgrade-confirm',
        route: '/subscription',
        advanceOn: 'manual',
        target: t('upgrade-confirm-submit'),
        done: { disappears: t('upgrade-confirm-submit') },
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
      // Stripe Checkout, test mode, the card already typed in. Paying is the
      // completed-payment webhook: whoever presses it, the stored plan is the
      // proof (owner, 2026-09-07: a screen flash where the purchase should be).
      {
        id: 'pay',
        route: '/subscription',
        advanceOn: 'manual',
        sim: 'checkout',
        target: t('checkout-sim-pay'),
        perform: [{ kind: 'click', selector: t('checkout-sim-pay') }],
        done: { storage: DEMO_PLAN_KEY },
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
      // Describing and sending are two presses (owner, 2026-09-07): the first
      // fills the form, the second is the send button coming alive.
      {
        id: 'describe',
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
        ],
        // The send button is disabled until the form is valid.
        done: { appears: `${t('create-ticket-submit')}:not([disabled])` },
      },
      {
        id: 'send',
        route: '/support/tickets/create',
        advanceOn: 'manual',
        target: t('create-ticket-submit'),
        perform: [{ kind: 'click', selector: t('create-ticket-submit') }],
        done: { appears: t('ticket-reference') },
      },
      // The reference is the whole point of raising a ticket, and it lived 56 ms
      // — E-BLINK, measured by demo-payoffs across every step of every tour. The
      // beat that produced it navigated away in the same press. Same route
      // string, so nothing moves; the ring goes on the way onward — the status
      // button, not the code (owner, 2026-09-07) — and waits.
      {
        id: 'reference-issued',
        route: '/support/tickets/create',
        advanceOn: 'manual',
        target: t('create-ticket-view-status'),
        perform: [{ kind: 'click', selector: t('create-ticket-view-status') }],
        done: { route: '^/support/tickets/status' },
      },
      // The status page the button opened carries the reference and the
      // e-mail in its query; the same route string as the beat before keeps
      // the director from navigating to a bare /status and losing them.
      {
        id: 'read-response',
        route: '/support/tickets/create',
        advanceOn: 'manual',
        target: t('ticket-response-1'),
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
        id: 'admin-open',
        route: '/support/admin/tickets',
        advanceOn: 'manual',
        target: '[data-testid^="admin-ticket-row-"]',
        perform: [{ kind: 'click', selector: '[data-testid^="admin-ticket-row-"]' }],
        done: { route: '^/support/admin/tickets/\\d+' },
      },
      // The thread holds only the customer's message; the reply is written and
      // sent in two presses, and the send button coming alive is the first
      // one's proof (owner, 2026-09-07). Same route string throughout, so the
      // director never navigates away from the ticket.
      {
        id: 'admin-draft',
        route: '/support/admin/tickets',
        advanceOn: 'manual',
        target: t('admin-response-content'),
        perform: [
          {
            kind: 'fill',
            selector: t('admin-response-content'),
            value:
              'Dziękujemy za zgłoszenie. Opublikowaną kampanię edytuje się z poziomu „Moje kampanie” → „Edytuj”; zmiany zapisują się natychmiast.',
          },
        ],
        done: { appears: `${t('admin-response-submit')}:not([disabled])` },
      },
      {
        id: 'admin-send',
        route: '/support/admin/tickets',
        advanceOn: 'manual',
        target: t('admin-response-submit'),
        perform: [{ kind: 'click', selector: t('admin-response-submit') }],
        // The reply on the thread — the seeded ticket carries none before it.
        done: { appears: '[data-testid^="admin-ticket-response-"]' },
      },
      // The reply is on the thread and the page says what comes next: the
      // "sent" panel's own control leads to the campaigns, and the pill sits
      // beside it.
      {
        id: 'to-campaigns',
        route: '/support/admin/tickets',
        advanceOn: 'manual',
        target: t('admin-ticket-campaigns'),
        perform: [{ kind: 'click', selector: t('admin-ticket-campaigns') }],
        done: { route: '^/collaborations' },
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
