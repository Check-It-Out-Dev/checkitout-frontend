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
 * INTERIM (demo-port slice C): every step ships `advanceOn: 'manual'` —
 * the in-component event hooks land as their own follow-up slice; the
 * guide's "Dalej" button walks every tour end-to-end today.
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

export interface ScenarioStep {
  /** Stable id — also the i18n suffix and the notify() event key. */
  id: string;
  /** Route this step plays on; the director navigates when it changes. */
  route: string;
  /** manual = guide shows "next"; event = a demo hook calls notify(id). */
  advanceOn: 'manual' | 'event';
  /** Optional world simulator opened alongside this step. */
  sim?: WorldSim;
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
      { id: 'login', route: '/auth/sign-in', advanceOn: 'manual' },
      { id: 'first-code', route: '/auth/sign-in', advanceOn: 'manual', sim: 'totp' },
      { id: 'fresh-code', route: '/auth/sign-in', advanceOn: 'manual', sim: 'totp' },
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
      { id: 'change-email', route: '/user/settings/account', advanceOn: 'manual' },
      { id: 'enter-code', route: '/user/settings/account', advanceOn: 'manual', sim: 'inbox-code' },
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
      { id: 'create-campaign', route: '/collaborations/create', advanceOn: 'manual' },
      // The company's decide UI lives on the campaign's applicants page —
      // /collaborations/registrations is the influencer-shaped list and has
      // no accept/decline controls. 501 is the seeded campaign the demo
      // company owns, with Ola's fresh application waiting.
      { id: 'decide-applicant', route: '/collaborations/501/applicants', advanceOn: 'manual' },
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
      { id: 'browse', route: '/collaborations/list', advanceOn: 'manual' },
      { id: 'apply', route: '/collaborations/list', advanceOn: 'manual' },
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
      { id: 'nip-lookup', route: '/company/setup', advanceOn: 'manual' },
      { id: 'company-confirmed', route: '/company/setup', advanceOn: 'manual' },
      { id: 'verify-mail', route: '/company/setup', advanceOn: 'manual', sim: 'inbox-verify' },
      { id: 'activated', route: '/subscription', advanceOn: 'manual' },
      { id: 'upgrade', route: '/subscription', advanceOn: 'manual' },
      { id: 'invoice-sent', route: '/subscription', advanceOn: 'manual', sim: 'fakturownia' },
      { id: 'ksef-done', route: '/subscription', advanceOn: 'manual', sim: 'ksef' },
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
      { id: 'ticket-created', route: '/support/tickets/create', advanceOn: 'manual' },
      { id: 'read-response', route: '/support/tickets/my-tickets', advanceOn: 'manual' },
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
      { id: 'admin-respond', route: '/support/admin/tickets', advanceOn: 'manual' },
      // The RODO cascade affordance lives on the campaign detail (admin-only
      // control; the user directory is a read-only approval queue — legacy
      // parity, PARITY iter-101). 502 is a seeded campaign with real data.
      { id: 'cascade-delete', route: '/collaborations/502', advanceOn: 'manual' },
      // After the cascade the marketplace list proves the point: 502 is gone.
      { id: 'by-the-book', route: '/collaborations/list', advanceOn: 'manual' },
    ],
  },
];

export function scenarioByKey(key: ScenarioKey): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

export const SCENARIO_COUNT = SCENARIOS.length;
