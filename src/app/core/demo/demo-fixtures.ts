import type { HttpParams } from '@angular/common/http';
import type { AppliedOpportunityStatisticsDto } from '../../api/model/applied-opportunity-statistics-dto';
import {
  buildAddress,
  buildApplication,
  buildCompanyUser,
  buildInfluencerUser,
  buildNotification,
  buildOpportunity,
  buildOpportunityStatus,
  buildPage,
  mergeDto,
} from '../../../testing/builders';
import type { InvoiceRecordDtoOut } from '../api-frozen/hidden-models';
import { InvoiceStatus } from '../api-frozen/hidden-models';
import type { NipLookupResponse } from '../../api/model/nip-lookup-response';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import { SubscriptionStatus } from '../api-frozen/hidden-models';
import type { SubscriptionStatusDtoOut } from '../api-frozen/hidden-models';
import type { SupportTicketDtoOut } from '../../api/model/support-ticket-dto-out';
import { TicketCategory } from '../../api/model/ticket-category';
import { TicketStatus } from '../../api/model/ticket-status';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { readLangChoice } from '../i18n/lang-preference';
import { currentDemoRole, type DemoRole } from './demo-mode';

/**
 * In-memory demo fixtures (ported from the legacy demo build, REBUILT on
 * `src/testing/builders` — the same typed fixture source the L1-L4 test
 * layers use, so demo data is contract-correct by construction and there
 * is exactly ONE place DTO shapes live).
 *
 * Keyed by HTTP method + path matcher. `matchDemoFixture` returns the
 * response body for a matched (method, path), or `undefined` for an
 * unmapped call (the interceptor answers a benign empty 200). A rule that
 * deliberately returns null KEEPS null — some endpoints mean "no data
 * yet" by it. All data is fictitious.
 */

// ── Personas (one per demo role; builders guarantee greenfield shapes) ──────
const DEMO_COMPANY = buildCompanyUser({
  id: 1001,
  email: 'demo@checkitout.app',
  firstName: 'Demo',
  lastName: 'Brand',
  name: 'Demo Brand Sp. z o.o.',
  companyDescription: 'Marka demo — pokazujemy, jak wygląda praca w checkItOut.',
  premium: true,
});

const DEMO_INFLUENCER = buildInfluencerUser({
  id: 501,
  email: 'ola.kowalska@example.com',
  firstName: 'Ola',
  lastName: 'Kowalska',
  name: 'Ola Kowalska',
  // The shell's completeness probe flags a missing phone with a red banner —
  // the demo personas are meant to be complete profiles.
  phoneNumber: '+48 600 214 870',
});

const DEMO_ADMIN: UserDtoOut = mergeDto(
  buildCompanyUser({
    id: 1,
    email: 'admin@checkitout.app',
    firstName: 'Admin',
    lastName: 'checkItOut',
    name: 'Admin checkItOut',
    nip: undefined,
    companyDescription: undefined,
  }),
  { userType: { value: 'ADMIN', label: 'Administrator' } },
);

const DEMO_USERS: Record<DemoRole, UserDtoOut> = {
  COMPANY: DEMO_COMPANY,
  INFLUENCER: DEMO_INFLUENCER,
  ADMIN: DEMO_ADMIN,
};

/**
 * Enum labels the profile page renders verbatim. The real backend
 * localises them per Accept-Language; the fixtures do the same from the
 * stored switcher choice so an English session never leaks "Firma" or
 * "Aktywne".
 */
const ENUM_LABELS: Record<'en' | 'pl', Record<string, string>> = {
  pl: { COMPANY: 'Firma', INFLUENCER: 'Twórca', ADMIN: 'Administrator', ACTIVE: 'Aktywne' },
  en: { COMPANY: 'Company', INFLUENCER: 'Creator', ADMIN: 'Administrator', ACTIVE: 'Active' },
};

export function currentDemoUser(): UserDtoOut {
  const user = DEMO_USERS[currentDemoRole()];
  const labels = ENUM_LABELS[readLangChoice() ?? 'pl'];
  return mergeDto(user, {
    userType: user.userType?.value
      ? { label: labels[user.userType.value] ?? user.userType.label }
      : undefined,
    accountStatus: user.accountStatus?.value
      ? { label: labels[user.accountStatus.value] ?? user.accountStatus.label }
      : undefined,
  });
}

// ── Campaign world (three campaigns, one application mid-lifecycle) ─────────
const CAMPAIGNS = [
  buildOpportunity(),
  buildOpportunity({
    id: 502,
    name: 'FitFuel S.A.',
    city: 'Warszawa',
    title: 'Premiera linii przekąsek proteinowych',
    details:
      'Szukamy twórców fitness i food do szczerych recenzji nowej linii — trening, przepis, ' +
      'test smaku. Ton naturalny, bez skryptu.',
    requirements: 'Min. 8 000 obserwujących, nisza fitness/food, treści po polsku.',
    followersMin: 8000,
    followersMax: 120000,
    compensationType: { value: 'CASH' as never, label: 'Płatna' },
    compensationDescription: '800-1500 zł za zaakceptowaną publikację.',
    compensationAmountMin: 800,
    compensationAmountMax: 1500,
  }),
  buildOpportunity({
    id: 503,
    name: 'Górski Szlak sp. j.',
    city: 'Zakopane',
    title: 'Weekendowe testy sprzętu trekkingowego',
    details: 'Zapraszamy twórców outdoor na testy plecaków i butów — relacja ze szlaku.',
    requirements: 'Nisza outdoor/travel, dyspozycyjność w weekendy.',
    compensationDescription: 'Testowany zestaw zostaje u twórcy + relacja partnerska na sezon.',
    followersMin: 5000,
    followersMax: 80000,
  }),
];

// Ola's fresh application (the "Zgłoszenia" bucket is APPLIED-only — the
// company tour's decide-applicant beat plays on this row)...
const APPLICATION_OLA = buildApplication({
  id: 8101,
  influencer: {
    id: 501,
    name: 'Ola Kowalska',
    firstName: 'Ola',
    lastName: 'Kowalska',
    email: 'ola.kowalska@example.com',
  } as never,
});

// ...and her already-accepted collab on the FitFuel campaign — the
// in-progress beat for the company, the green "accepted" beat for Ola.
const APPLICATION_ACTIVE = buildApplication({
  id: 8102,
  opportunityStatus: buildOpportunityStatus(OpportunityStatus.ACCEPTED_BY_COMPANY),
  note: 'Trenuję i gotuję — chętnie sprawdzę linię proteinową w prawdziwym planie dnia.',
  influencer: {
    id: 501,
    name: 'Ola Kowalska',
    firstName: 'Ola',
    lastName: 'Kowalska',
    email: 'ola.kowalska@example.com',
  } as never,
  partnershipOpportunity: {
    id: 502,
    title: 'Premiera linii przekąsek proteinowych',
    name: 'FitFuel S.A.',
    city: 'Warszawa',
  },
});

const APPLICATIONS = [APPLICATION_OLA, APPLICATION_ACTIVE];

// ── Classification dictionaries (the campaign form's selects) ───────────────
// PL-market rows, id+name is all the form binds; the guided campaign tour
// dies in an empty required select without them.
const PLATFORMS = [
  { id: 1, name: 'Instagram', active: true },
  { id: 2, name: 'TikTok', active: true },
  { id: 3, name: 'YouTube', active: true },
  { id: 4, name: 'Facebook', active: true },
];
const CONTENT_TYPES = [
  { id: 1, name: 'Post' },
  { id: 2, name: 'Reels' },
  { id: 3, name: 'Stories' },
  { id: 4, name: 'Wideo' },
  { id: 5, name: 'Relacja na żywo' },
];
const SERVICE_TYPES = [
  { id: 1, name: 'Recenzja produktu' },
  { id: 2, name: 'Udział w evencie' },
  { id: 3, name: 'Ambasador marki' },
  { id: 4, name: 'Konkurs' },
];
const CURRENCIES = [
  { id: 1, name: 'Polski złoty', isoCode: 'PLN', sign: 'zł' },
  { id: 2, name: 'Euro', isoCode: 'EUR', sign: '€' },
];

// ── Writable campaign store ─────────────────────────────────────────────────
// The engineering chapter's meta card promises this exact mechanic: "POST
// /partnership-opportunity -> stores YOUR campaign, returns it; paged ->
// includes what you just created". Create navigates to /collaborations/:id,
// so the stored row must resolve by id too. Session-scoped, wiped by reset.
let nextCreatedCampaignId = 90001;
const CREATED_CAMPAIGNS: ReturnType<typeof buildOpportunity>[] = [];

/** Campaigns removed by the admin-ops cascade — lists stop serving them. */
const DELETED_CAMPAIGN_IDS = new Set<number>();

/**
 * Reset in-memory tour stores. Called by SandboxDirector.start() so a
 * replayed tour begins from the canonical seed state — without this, a
 * cascade-deleted campaign stays gone and byId()'s list[0] fallback would
 * serve a DIFFERENT campaign under the deleted id's route on replay.
 */
export function resetDemoTourStores(): void {
  DELETED_CAMPAIGN_IDS.clear();
}

/** All campaigns the demo serves — user-created rows first, then seeds. */
function allCampaigns(): ReturnType<typeof buildOpportunity>[] {
  return [...CREATED_CAMPAIGNS, ...CAMPAIGNS].filter((c) => !DELETED_CAMPAIGN_IDS.has(c.id ?? -1));
}

/** Build the DtoOut echo for a campaign the visitor just created. */
function storeCreatedCampaign(body: unknown): ReturnType<typeof buildOpportunity> {
  const dto = (body ?? {}) as {
    name?: string;
    title?: string;
    city?: string;
    details?: string;
    requirements?: string;
    compensationType?: string;
    compensationDescription?: string;
    compensationAmountMin?: number;
    compensationAmountMax?: number;
    followersMin?: number;
    followersMax?: number;
    startDate?: string;
    endDate?: string;
    currency?: number;
    platforms?: number[];
    contentTypes?: number[];
    photos?: { url?: string; orderNumber?: number; isCover?: boolean }[];
  };
  const created = buildOpportunity({
    id: nextCreatedCampaignId++,
    name: dto.name,
    title: dto.title,
    city: dto.city,
    details: dto.details,
    requirements: dto.requirements,
    compensationDescription: dto.compensationDescription,
    compensationAmountMin: dto.compensationAmountMin,
    compensationAmountMax: dto.compensationAmountMax,
    followersMin: dto.followersMin,
    followersMax: dto.followersMax,
    startDate: dto.startDate,
    endDate: dto.endDate,
    compensationType: dto.compensationType
      ? ({
          value: dto.compensationType,
          label: dto.compensationType === 'BARTER' ? 'Barter' : 'Płatna',
        } as never)
      : undefined,
    currency: (CURRENCIES.find((c) => c.id === dto.currency) ?? CURRENCIES[0]) as never,
    platforms: (dto.platforms ?? [])
      .map((id) => PLATFORMS.find((p) => p.id === id))
      .filter(Boolean) as never,
    contentTypes: (dto.contentTypes ?? [])
      .map((id) => CONTENT_TYPES.find((c) => c.id === id))
      .filter(Boolean) as never,
    photos: (dto.photos ?? []).map((p, i) => ({
      id: 62000 + i,
      url: p.url,
      orderNumber: p.orderNumber ?? i,
      isCover: p.isCover ?? i === 0,
    })) as never,
  });
  CREATED_CAMPAIGNS.unshift(created);
  return created;
}

/**
 * Campaign-photo placeholder the demo upload pipeline resolves to — a tiny
 * inline SVG so the thumbnail renders offline, no bucket involved.
 */
const DEMO_PHOTO_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="%23f8e8e0"/><rect x="12" y="12" width="296" height="216" rx="14" fill="none" stroke="%23e2543e" stroke-width="3"/><text x="160" y="128" text-anchor="middle" font-family="monospace" font-size="22" fill="%23e2543e">demo photo</text></svg>`.replace(
      /%23/g,
      '#',
    ),
  );

const NOTIFICATIONS = [
  buildNotification(),
  buildNotification({
    id: 7002,
    title: 'Współpraca zaakceptowana',
    message: 'Kawiarnia Złote Ziarno zaakceptowała Twoje zgłoszenie.',
    isRead: true,
    createdAt: '2026-09-01T09:15:00',
  }),
];

// ── Support ticket (one answered thread — feeds the support + admin tours) ──
const TICKET: SupportTicketDtoOut = {
  id: 9001,
  contactEmail: 'demo@checkitout.app',
  subject: 'Nie mogę edytować opublikowanej kampanii',
  description:
    'Po publikacji kampanii przycisk edycji jest nieaktywny. Czy mogę jeszcze poprawić budżet?',
  status: TicketStatus.WAITING_FOR_CUSTOMER,
  statusDisplay: 'Czeka na Twoją odpowiedź',
  category: TicketCategory.TECHNICAL_PROBLEM,
  categoryDisplay: 'Problem techniczny',
  ticketReference: 'CIO-2026-0189',
  adminAssignee: 'Zespół checkItOut',
  createdTime: '2026-09-01T10:05:00',
  lastUpdateTime: '2026-09-01T12:41:00',
  responses: [
    {
      id: 1,
      ticketId: 9001,
      content:
        'Dzień dobry! Opublikowaną kampanię można edytować do pierwszego zgłoszenia — potem ' +
        'warunki są zamrożone, bo influencerzy aplikują na konkretną ofertę. Budżet zmienisz, ' +
        'duplikując kampanię (przycisk „Duplikuj") i publikując poprawioną wersję.',
      fromAdmin: true,
      adminName: 'Zespół checkItOut',
      createdTime: '2026-09-01T12:41:00',
    },
  ],
  attachments: [],
  resolved: false,
};

// ── Subscription plan store (the nip-to-ksef tour's paid beat) ──────────────
// The REAL upgrade dialog records consent, then redirects to the returned
// Stripe Checkout sessionUrl via window.location.href. In the demo the
// "checkout" is instant: the session URL points straight back at the plan
// page and the chosen plan is persisted in sessionStorage so it survives
// that full-page reload — the status rule reads it back, playing the role
// of the completed payment webhook.
export const DEMO_PLAN_KEY = 'demoPlan';
/** Session key for the step-up tour's one-time e-mail code. */
export const DEMO_STEP_UP_KEY = 'demoStepUpCode';
const PLAN_PRESETS = {
  BUSINESS: { name: 'Business', price: 29, limit: 5, status: SubscriptionStatus.BUSINESS_ACTIVE },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 99,
    limit: 10,
    status: SubscriptionStatus.ENTERPRISE_ACTIVE,
  },
} as const;

function demoPlan(): keyof typeof PLAN_PRESETS {
  const stored =
    typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(DEMO_PLAN_KEY);
  return stored === 'ENTERPRISE' ? 'ENTERPRISE' : 'BUSINESS';
}

// ── Rule engine ─────────────────────────────────────────────────────────────
interface DemoRule {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Matches the path portion after /api (query string already stripped). */
  match: RegExp;
  respond: (path: string, body: unknown, params?: HttpParams) => unknown;
}

const RULES: DemoRule[] = [
  // Identity + session — the whole app keys off /users/me.
  { method: 'GET', match: /\/users\/me$/, respond: () => currentDemoUser() },
  { method: 'POST', match: /\/auth\/exchange-token$/, respond: () => ({ status: 'ok' }) },
  { method: 'POST', match: /\/auth\/sign-out$/, respond: () => ({}) },
  // AdminGuard admits the admin persona (2FA "already configured" in demo).
  {
    method: 'GET',
    match: /\/twofactor\/status$/,
    respond: () => ({ enabled: currentDemoRole() === 'ADMIN', configured: true }),
  },

  // Legal — consents all accepted; the clickwrap never nags in the demo.
  {
    method: 'GET',
    match: /\/legal\/current$/,
    respond: () => [],
  },
  { method: 'GET', match: /\/legal\/consent\/status$/, respond: () => ({ upToDate: true }) },

  // Notifications.
  {
    method: 'GET',
    match: /\/notification\/unread-count$/,
    respond: () => ({ count: NOTIFICATIONS.filter((n) => !n.isRead).length }),
  },
  { method: 'GET', match: /\/notification(\/paged)?$/, respond: () => buildPage(NOTIFICATIONS) },
  { method: 'PATCH', match: /\/notification\/.+/, respond: () => ({}) },

  // Campaigns — reads serve created rows first (the meta card's promise),
  // writes land in the in-memory store so create → detail → list all agree.
  {
    method: 'GET',
    match: /\/partnership-opportunity\/\d+$/,
    respond: (p) => byId(allCampaigns(), p),
  },
  {
    method: 'GET',
    match: /\/partnership-opportunity(\/paged)?$/,
    respond: () => buildPage(allCampaigns()),
  },
  {
    method: 'POST',
    match: /\/partnership-opportunity$/,
    respond: (_p, body) => storeCreatedCampaign(body),
  },
  {
    method: 'PUT',
    match: /\/partnership-opportunity\/\d+$/,
    respond: (p, body) => {
      const existing = byId(allCampaigns(), p);
      return mergeDto(existing ?? buildOpportunity(), (body ?? {}) as never);
    },
  },
  {
    method: 'GET',
    match: /\/partnership-opportunity\/compensation\/type$/,
    respond: () => [
      { value: 'CASH', label: 'Płatna' },
      { value: 'BARTER', label: 'Barter' },
    ],
  },

  // Classification dictionaries — the create form fetches all four whole.
  { method: 'GET', match: /\/platform(\/paged)?$/, respond: () => buildPage(PLATFORMS) },
  { method: 'GET', match: /\/content-type(\/paged)?$/, respond: () => buildPage(CONTENT_TYPES) },
  { method: 'GET', match: /\/service-type(\/paged)?$/, respond: () => buildPage(SERVICE_TYPES) },
  { method: 'GET', match: /\/currency(\/paged)?$/, respond: () => buildPage(CURRENCIES) },

  // Campaign-photo upload — the real three-step pipeline, demo-resolved:
  // the signed PUT target stays under /api so the interceptor answers it
  // (unmapped → benign 200), and the public URL is an inline SVG.
  {
    method: 'POST',
    match: /\/upload\/signed-url$/,
    respond: () => ({
      uploadUrl: '/api/demo/upload-sink',
      publicUrl: DEMO_PHOTO_URL,
      uploadId: 'demo-upload-1',
      filePath: 'demo/campaign-photo.svg',
    }),
  },
  { method: 'POST', match: /\/upload\/confirm\//, respond: () => ({ status: 'CONFIRMED' }) },

  // Deciding an application (accept/decline) echoes the row with the new
  // status — the detail page re-renders from the response.
  {
    method: 'PATCH',
    match: /\/applied-opportunity\/\d+$/,
    respond: (p, body) => {
      const existing = byId(APPLICATIONS, p) ?? APPLICATIONS[0];
      return mergeDto(existing, (body ?? {}) as never);
    },
  },

  // Influencer apply — echoes a fresh application for the chosen campaign.
  {
    method: 'POST',
    match: /\/applied-opportunity$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as { partnershipOpportunityId?: number; note?: string };
      const campaign = allCampaigns().find((c) => c.id === dto.partnershipOpportunityId);
      return buildApplication({
        id: 8200,
        note: dto.note,
        partnershipOpportunity: campaign
          ? {
              id: campaign.id,
              title: campaign.title,
              name: campaign.name,
              city: campaign.city as never,
            }
          : undefined,
      });
    },
  },

  // Applications / collaborations.
  {
    method: 'GET',
    match: /\/applied-opportunity\/statistics$/,
    respond: () =>
      ({
        total: 2,
        newOpportunities: 1,
        inProgress: 1,
        done: 0,
      }) satisfies AppliedOpportunityStatisticsDto,
  },
  {
    // The service contract is a BARE array (not a page) — a page-shaped
    // body made the detail's sortNewestFirst throw "not iterable" and hang
    // the loader. One row keeps the audit strip alive.
    method: 'GET',
    match: /\/applied-opportunity\/\d+\/status-history/,
    respond: () => [
      {
        id: 1,
        appliedOpportunityId: 8101,
        newStatus: OpportunityStatus.APPLIED,
        changedByUserName: 'Ola Kowalska',
        changedAt: '2026-09-01T10:00:00',
      },
    ],
  },
  { method: 'GET', match: /\/applied-opportunity\/\d+$/, respond: (p) => byId(APPLICATIONS, p) },
  {
    // The campaign-applicants page filters by partnershipOpportunity.id —
    // honour it so campaign 501's applicants view shows only Ola's row.
    method: 'GET',
    match: /\/applied-opportunity(\/paged)?$/,
    respond: (_p, _b, params) => {
      const campaignId = params?.get('filters.partnershipOpportunity.id');
      const rows = campaignId
        ? APPLICATIONS.filter((a) => String(a.partnershipOpportunity?.id) === campaignId)
        : APPLICATIONS;
      return buildPage(rows);
    },
  },
  {
    // The company's accept/decline: PATCH …/status/update/:id?accept=true|false
    // echoes the row at its new status so the applicants page updates in place.
    method: 'PATCH',
    match: /\/applied-opportunity\/status\/update\/\d+$/,
    respond: (p, _b, params) => {
      const existing = byId(APPLICATIONS, p) ?? APPLICATIONS[0];
      const accept = params?.get('accept') !== 'false';
      // State-aware, mirroring the BE's getNextStatus: on an APPLIED row the
      // company decides; on ACCEPTED_BY_COMPANY the influencer counter-signs.
      const influencerTurn =
        existing.opportunityStatus?.value === OpportunityStatus.ACCEPTED_BY_COMPANY;
      const next = accept
        ? influencerTurn
          ? OpportunityStatus.ACCEPTED_BY_INFLUENCER
          : OpportunityStatus.ACCEPTED_BY_COMPANY
        : influencerTurn
          ? OpportunityStatus.REJECTED_BY_INFLUENCER
          : OpportunityStatus.REJECTED_BY_COMPANY;
      return mergeDto(existing, { opportunityStatus: buildOpportunityStatus(next) } as never);
    },
  },
  {
    method: 'GET',
    match: /\/activecoop\/inprogress$/,
    respond: () => buildPage([APPLICATION_ACTIVE]),
  },

  // Step-up re-auth — the change-email / sensitive-action sandboxes drive
  // the REAL StepUpDialogComponent, so the fixtures must speak its whole
  // contract. One session-scoped code is the single source of truth:
  // `/step-up/request` mints it into sessionStorage (never overwriting, so
  // the inbox sim and the validator always agree — the sim reads the same
  // key), and `/step-up/verify` exchanges exactly that code for a token.
  // A wrong code returns a token-less body, which the dialog already
  // renders as "Invalid code" — no error plumbing needed.
  {
    method: 'GET',
    match: /\/step-up\/check/,
    respond: () => ({ required: true, challengeType: 'EMAIL_CODE' }),
  },
  {
    method: 'POST',
    match: /\/step-up\/request$/,
    respond: () => {
      if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(DEMO_STEP_UP_KEY)) {
        sessionStorage.setItem(
          DEMO_STEP_UP_KEY,
          String(Math.floor(100000 + Math.random() * 900000)),
        );
      }
      return { success: true, required: true, challengeType: 'EMAIL_CODE' };
    },
  },
  {
    method: 'POST',
    match: /\/step-up\/verify$/,
    respond: (_p, body) => {
      const code =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DEMO_STEP_UP_KEY) : null;
      const sent = (body as { code?: string } | undefined)?.code;
      return code && sent === code
        ? { success: true, token: 'demo-step-up-token' }
        : { success: false };
    },
  },

  // Profile satellites. The primary-address probe must answer with a real
  // address object — the shell computes the "profile incomplete" banner
  // from it, and an empty or list-shaped body reads as "no primary
  // address", contradicting the persona's complete profile.
  { method: 'GET', match: /\/address\/user\/\d+\/primary$/, respond: () => buildAddress() },
  { method: 'GET', match: /\/address\/user\/\d+$/, respond: () => [buildAddress()] },
  {
    method: 'GET',
    match: /\/user-preferences\/user\/\d+$/,
    respond: () => ({ darkMode: false, communicationFrequency: 'WEEKLY' }),
  },

  // Payments visible but mocked — no real charge can exist here. The status
  // shape is the generated SubscriptionStatusDtoOut; the plan page renders
  // limits and usage straight from it.
  { method: 'GET', match: /\/public-config$/, respond: () => ({ paymentsEnabled: true }) },
  {
    method: 'GET',
    match: /\/subscription\/status$/,
    respond: () => {
      const plan = PLAN_PRESETS[demoPlan()];
      return {
        currentPlanName: plan.name,
        currentPlanPrice: plan.price,
        campaignLimit: plan.limit,
        campaignsUsedThisPeriod: 3,
        status: plan.status,
        billingPeriodStart: '2026-06-15T00:00:00',
        billingPeriodEnd: '2026-09-02T00:00:00',
        trialEligible: false,
        trialUsed: true,
        hasStripeSubscription: true,
      } satisfies SubscriptionStatusDtoOut;
    },
  },
  {
    method: 'GET',
    match: /\/subscription\/invoices$/,
    respond: () => {
      const rows: InvoiceRecordDtoOut[] = [
        {
          id: 42,
          invoiceType: 'SUBSCRIPTION',
          amountPln: 29,
          status: InvoiceStatus.SENT,
          retryCount: 0,
          maxRetries: 5,
          createdTime: '2026-06-15T08:12:00',
        },
      ];
      if (demoPlan() === 'ENTERPRISE') {
        // The upgrade's invoice — the billing saga "already issued" it.
        rows.unshift({
          id: 43,
          invoiceType: 'SUBSCRIPTION',
          amountPln: 99,
          status: InvoiceStatus.SENT,
          retryCount: 0,
          maxRetries: 5,
          createdTime: '2026-09-02T02:30:00',
        });
      }
      return rows satisfies InvoiceRecordDtoOut[];
    },
  },

  // Upgrade trio — consent proof lands, then the "checkout": the sessionUrl
  // is same-origin, so the real window.location.href redirect simply reloads
  // the plan page with the new plan already active (see PLAN_PRESETS above).
  { method: 'POST', match: /\/subscription\/consent$/, respond: () => ({ recorded: true }) },
  {
    method: 'POST',
    match: /\/subscription\/upgrade$/,
    respond: (_p, body) => {
      const target = (body as { targetPlan?: string } | null)?.targetPlan;
      if (
        (target === 'ENTERPRISE' || target === 'BUSINESS') &&
        typeof sessionStorage !== 'undefined'
      ) {
        sessionStorage.setItem(DEMO_PLAN_KEY, target);
      }
      return { sessionUrl: '/user/settings/plan-billing' };
    },
  },
  // Customer portal — in the demo it "opens" right back on the plan page.
  {
    method: 'POST',
    match: /\/subscription\/portal$/,
    respond: () => ({ url: '/user/settings/plan-billing' }),
  },

  // Company onboarding — the NIP-lookup beat: GUS + Biała Lista VAT arrive
  // in one response, echoing whatever NIP the visitor typed.
  {
    method: 'POST',
    match: /\/registry\/lookup$/,
    respond: (_p, body) =>
      ({
        nip: (body as { nip?: string } | null)?.nip ?? '5260250995',
        regon: '012100784',
        krs: '0000019193',
        companyName: 'Demo Brand Sp. z o.o.',
        legalFormName: 'Spółka z ograniczoną odpowiedzialnością',
        street: 'Rynek Główny',
        buildingNumber: '12',
        city: 'Kraków',
        postalCode: '31-042',
        voivodeship: 'małopolskie',
        pkdMainCode: '73.11.Z',
        pkdMainDescription: 'Działalność agencji reklamowych',
        vatStatus: 'Czynny',
        bankAccounts: ['PL61 1090 1014 0000 0712 1981 2874'],
        companyActive: true,
        companySuspended: false,
        sourceGus: true,
        sourceVat: true,
        sourceCeidg: false,
      }) satisfies NipLookupResponse,
  },

  // Support — one answered thread; the user's my-tickets and the admin queue
  // read the same fixture, so both tour beats show a real conversation.
  // Creating a ticket echoes the same reference the answered thread carries —
  // the "watch the answer arrive" beat rides one coherent story.
  {
    method: 'POST',
    match: /\/support\/ticket$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as { subject?: string; description?: string };
      return {
        ...TICKET,
        subject: dto.subject ?? TICKET.subject,
        description: dto.description ?? TICKET.description,
      };
    },
  },
  { method: 'GET', match: /\/support\/ticket\/my-tickets$/, respond: () => buildPage([TICKET]) },
  { method: 'GET', match: /\/support\/ticket\/\d+$/, respond: () => TICKET },
  { method: 'GET', match: /\/support\/ticket$/, respond: () => buildPage([TICKET]) },
  // By-reference lookup — the "check your ticket" page (works logged-out on
  // prod; the my-tickets rows deep-link here with ref + email).
  { method: 'GET', match: /\/support\/ticket\/status$/, respond: () => TICKET },
  // Customer reply — threads onto the same TICKET the status page re-reads.
  {
    method: 'POST',
    match: /\/support\/ticket\/response$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as { content?: string };
      const response = {
        id: (TICKET.responses?.length ?? 0) + 1,
        ticketId: TICKET.id,
        content: dto.content ?? '',
        fromAdmin: false,
        createdTime: '2026-09-02T02:50:00',
      };
      TICKET.responses = [...(TICKET.responses ?? []), response];
      TICKET.lastUpdateTime = response.createdTime;
      return response;
    },
  },

  // Admin reply — threads onto the shared TICKET so the component's
  // refetch (it re-GETs the ticket after POSTing) shows the new response;
  // honors the optional status transition the admin picked.
  {
    method: 'POST',
    match: /\/support\/ticket\/\d+\/admin-response$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as {
        content?: string;
        newStatus?: TicketStatus;
        adminName?: string;
      };
      const response = {
        id: (TICKET.responses?.length ?? 0) + 1,
        ticketId: TICKET.id,
        content: dto.content ?? '',
        fromAdmin: true,
        adminName: dto.adminName || 'Zespół checkItOut',
        createdTime: '2026-09-02T02:45:00',
      };
      TICKET.responses = [...(TICKET.responses ?? []), response];
      TICKET.lastUpdateTime = response.createdTime;
      if (dto.newStatus) {
        TICKET.status = dto.newStatus;
        TICKET.statusDisplay =
          {
            OPEN: 'Otwarty',
            IN_PROGRESS: 'W trakcie',
            WAITING_FOR_CUSTOMER: 'Czeka na Twoją odpowiedź',
            RESOLVED: 'Rozwiązany',
            CLOSED: 'Zamknięty',
          }[dto.newStatus as string] ?? TICKET.statusDisplay;
      }
      return response;
    },
  },

  // Reference data.
  { method: 'GET', match: /\/faq-category/, respond: () => buildPage([]) },
  { method: 'GET', match: /\/faq/, respond: () => buildPage([]) },
  { method: 'GET', match: /\/dictionary\/categories$/, respond: () => [] },
  {
    method: 'GET',
    match: /\/upload\/limits$/,
    respond: () => ({ maxFileSizeMb: 10, dailyRemaining: 20 }),
  },

  // Admin directory (the admin persona's user list).
  {
    method: 'GET',
    match: /\/users\/paged$/,
    respond: () => buildPage(Object.values(DEMO_USERS)),
  },

  // Admin cascade delete — the RODO beat of the admin-ops tour drives the
  // REAL two-step dialog: preview (counts + warnings + one-time code) then
  // the destructive call echoing code + expected total. The deleted campaign
  // vanishes from every list via DELETED_CAMPAIGN_IDS.
  {
    method: 'GET',
    match: /\/admin\/cascade-delete\/partnership-opportunities\/\d+\/preview$/,
    respond: (p) => {
      const id = Number(p.split('/').slice(-2)[0]);
      const pl = (readLangChoice() ?? 'pl') === 'pl';
      return {
        userId: 1001,
        userEmail: 'demo@checkitout.app',
        userType: 'COMPANY',
        userName: 'Demo Brand Sp. z o.o.',
        totalEntityCount: 9,
        entityBreakdown: [
          {
            entityType: 'PartnershipOpportunity',
            count: 1,
            description: pl ? 'Kampania' : 'Campaign',
          },
          {
            entityType: 'AppliedOpportunity',
            count: 2,
            description: pl ? 'Zgłoszenia twórców' : 'Creator applications',
          },
          {
            entityType: 'Photo',
            count: 3,
            description: pl ? 'Zdjęcia (Storage)' : 'Photos (Storage)',
          },
          {
            entityType: 'Notification',
            count: 3,
            description: pl ? 'Powiadomienia' : 'Notifications',
          },
        ],
        systemsToClean: ['PostgreSQL', 'Firestore', 'Firebase Storage'],
        warnings: [
          pl
            ? 'Zgłoszenia twórców zostaną odpięte i zanonimizowane.'
            : 'Creator applications will be detached and anonymised.',
        ],
        hasFirebaseStorageData: true,
        confirmationCode: `DEL-${id}-DEMO`,
      };
    },
  },
  {
    method: 'DELETE',
    match: /\/admin\/cascade-delete\/partnership-opportunities\/\d+$/,
    respond: (p) => {
      const id = Number(p.split('/').pop());
      DELETED_CAMPAIGN_IDS.add(id);
      return {
        success: true,
        totalDeleted: 9,
        deletedByType: [
          { entityType: 'PartnershipOpportunity', count: 1 },
          { entityType: 'AppliedOpportunity', count: 2 },
          { entityType: 'Photo', count: 3 },
          { entityType: 'Notification', count: 3 },
        ],
        auditTrailId: `AUD-2026-0902-${id}`,
        startedAt: '2026-09-02T02:41:00',
        completedAt: '2026-09-02T02:41:03',
        warnings: [],
        canRetry: false,
        partialSuccess: false,
      };
    },
  },
];

function byId<T extends { id?: number }>(list: readonly T[], path: string): T | undefined {
  const id = Number(path.split('/').pop());
  return list.find((x) => x.id === id) ?? list[0];
}

/**
 * Resolve a demo response. `undefined` = unmapped (interceptor answers
 * empty 200); `null` is a legitimate body some endpoints return.
 */
export function matchDemoFixture(
  method: string,
  path: string,
  body: unknown,
  params?: HttpParams,
): unknown {
  const clean = path.replace(/^.*\/api(?=\/)/, '').split('?')[0];
  const rule = RULES.find((r) => r.method === method && r.match.test(clean));
  return rule ? rule.respond(clean, body, params) : undefined;
}
