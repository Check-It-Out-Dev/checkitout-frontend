import type { HttpParams } from '@angular/common/http';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { AppliedOpportunityStatisticsDto } from '../../api/model/applied-opportunity-statistics-dto';
import { ContentApprovalStatus } from '../../api/model/content-approval-status';
import type { DictionaryEntry } from '../../api/model/dictionary-entry';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';
import { LegalDocumentType } from '../../api/model/legal-document-type';
import type { TotpSetupResponse } from '../api-frozen/hidden-models';
import type { AddressDtoOut } from '../../api/model/address-dto-out';
import type { CompanyDataConfirmResponse } from '../../api/model/company-data-confirm-response';
import { CompanyDataConfirmResponseAccountStatusEnum } from '../../api/model/company-data-confirm-response';
import { ConnectionStatus } from '../../api/model/connection-status';
import type { DeletionBlocker } from '../../api/model/deletion-blocker';
import { DeletionBlockerCategory } from '../../api/model/deletion-blocker-category';
import type { DeletionEligibilityDto } from '../../api/model/deletion-eligibility-dto';
import { DeletionEligibilityDtoUserTypeEnum } from '../../api/model/deletion-eligibility-dto';
import type { UserPreferencesDtoOut } from '../../api/model/user-preferences-dto-out';
import {
  UserPreferencesDtoOutCommunicationFrequencyEnum,
  UserPreferencesDtoOutLanguageEnum,
} from '../../api/model/user-preferences-dto-out';
import type { UserSocialConnectionDtoOut } from '../../api/model/user-social-connection-dto-out';
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
import {
  currentDemoRole,
  isDemoSignedIn,
  setDemoRole,
  setDemoSignedIn,
  type DemoRole,
} from './demo-mode';

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

// ── Editable profile satellites ──────────────────────────────────────────────
// The profile card, the address list and the preferences form each replace
// their state with the response of their save call, so an unmapped PATCH
// (the interceptor's `{}`) blanked the profile after "Zapisz" and reset the
// preferences form after every save. These stores are what the responses
// read from; a guided tour reset puts the seeds back.
const EDITABLE_PROFILE_FIELDS = ['firstName', 'lastName', 'name', 'phoneNumber'] as const;
let PROFILE_EDITS: Partial<Record<DemoRole, Partial<UserDtoOut>>> = {};

const SEED_ADDRESSES: readonly AddressDtoOut[] = [
  buildAddress({ id: 41, userId: 101, addressType: 'MAIN', primary: true }),
  buildAddress({
    id: 42,
    userId: 101,
    addressType: 'BILLING',
    primary: false,
    street: 'ul. Długa 3/5',
    postalCode: '31-147',
    additionalInfo: 'Dział księgowości',
    createdTime: '2026-02-14T11:20:00',
    lastUpdateTime: '2026-02-14T11:20:00',
  }),
];
let ADDRESSES: AddressDtoOut[] = SEED_ADDRESSES.map((a) => ({ ...a }));
let nextAddressId = 43;

const SEED_PREFERENCES: UserPreferencesDtoOut = {
  id: 9001,
  userId: 101,
  language: UserPreferencesDtoOutLanguageEnum.PL,
  timezone: 'Europe/Warsaw',
  communicationFrequency: UserPreferencesDtoOutCommunicationFrequencyEnum.WEEKLY_DIGEST,
  darkModeEnabled: false,
  notificationEmailEnabled: true,
  notificationPushEnabled: true,
  notificationSmsEnabled: false,
  notificationPartnershipEnabled: true,
  notificationSupportEnabled: true,
  notificationSystemEnabled: true,
  notificationEmailPartnershipEnabled: true,
  notificationEmailSupportEnabled: false,
  gdprMarketingConsent: false,
  sharePhoneForPayments: false,
  twoFactorAuthenticationEnabled: false,
  createdTime: '2026-01-10T08:05:00Z',
  lastUpdateTime: '2026-06-01T09:00:00Z',
};
let PREFERENCES: UserPreferencesDtoOut = { ...SEED_PREFERENCES };

// Ola's Instagram — the creator persona has a connected account, so the
// "Połączone konta" tab shows the connected row and the disconnect beat
// instead of an eternal empty state (the brand persona has none to show).
const SEED_SOCIAL: readonly UserSocialConnectionDtoOut[] = [
  {
    id: 7001,
    userId: 501,
    socialUserId: '17841400000001',
    displayName: 'ola.kowalska',
    profileUrl: 'https://www.instagram.com/ola.kowalska',
    followersCount: 12000,
    isPrimary: true,
    connectionStatus: ConnectionStatus.CONNECTED,
    platform: { id: 1, name: 'Instagram', active: true, contentTypes: [] as never },
    createdTime: '2026-05-02T09:12:00Z',
    lastSyncTime: '2026-06-15T07:30:00Z',
    lastUpdateTime: '2026-06-15T07:30:00Z',
  },
];
let SOCIAL: UserSocialConnectionDtoOut[] = SEED_SOCIAL.map((c) => ({ ...c }));

/** `/x/{ids}` — the generated batch deletes put a comma list in the path. */
function idsFromPath(path: string): number[] {
  return (path.split('/').pop() ?? '')
    .split(',')
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

/**
 * RODO Art. 17 pre-check. Every persona may deactivate; the brand and the
 * creator cannot be erased while a campaign or a collaboration is live, and
 * the admin is the last one standing — which exercises the blockers dialog.
 */
function deletionEligibility(): DeletionEligibilityDto {
  const user = currentDemoUser();
  const role = currentDemoRole();
  const pl = (readLangChoice() ?? 'pl') === 'pl';
  // The blockers dialog prints `reason` as the row title and `description`
  // as the line under it — a short label and a sentence, never the same text.
  const blocker = (
    category: DeletionBlockerCategory,
    entityType: string,
    entityIds: number[],
    reason: [pl: string, en: string],
    description: [pl: string, en: string],
  ): DeletionBlocker => ({
    category,
    count: entityIds.length,
    entityType,
    entityIds,
    reason: pl ? reason[0] : reason[1],
    description: pl ? description[0] : description[1],
  });
  const permanent =
    role === 'ADMIN'
      ? [
          blocker(
            DeletionBlockerCategory.LAST_ADMIN,
            'User',
            [1],
            ['Jedyne konto administratora', 'The only administrator account'],
            [
              'Najpierw nadaj uprawnienia administratora innej osobie.',
              'Grant the administrator role to someone else first.',
            ],
          ),
        ]
      : role === 'INFLUENCER'
        ? [
            blocker(
              DeletionBlockerCategory.ACTIVE_PARTNERSHIP_OPPORTUNITIES,
              'AppliedOpportunity',
              [8102],
              ['Trwająca współpraca', 'A collaboration in progress'],
              [
                'Współpraca z FitFuel jest w toku — zakończ ją lub zrezygnuj przed usunięciem konta.',
                'The FitFuel collaboration is under way — finish or withdraw from it first.',
              ],
            ),
          ]
        : [
            blocker(
              DeletionBlockerCategory.ACTIVE_PARTNERSHIP_OPPORTUNITIES,
              'PartnershipOpportunity',
              [501, 502, 503],
              ['Aktywne kampanie', 'Active campaigns'],
              [
                'Trzy kampanie mają otwarte zgłoszenia — zamknij je przed usunięciem konta.',
                'Three campaigns have open applications — close them before deleting the account.',
              ],
            ),
          ];
  const soft = role === 'ADMIN' ? permanent : [];
  return {
    userId: user.id,
    userEmail: user.email,
    userType: DeletionEligibilityDtoUserTypeEnum[role],
    canSoftDelete: soft.length === 0,
    canPermanentDelete: false,
    softDeleteBlockers: soft,
    permanentDeleteBlockers: permanent,
    summary: pl
      ? soft.length === 0
        ? 'Konto można dezaktywować. Trwałe usunięcie wymaga wcześniejszego zamknięcia aktywnych spraw.'
        : 'Konta nie można teraz usunąć.'
      : soft.length === 0
        ? 'The account can be deactivated. Permanent deletion needs the open items closed first.'
        : 'The account cannot be deleted right now.',
  };
}

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
  const role = currentDemoRole();
  const user = DEMO_USERS[role];
  const labels = ENUM_LABELS[readLangChoice() ?? 'pl'];
  return {
    ...mergeDto(user, {
      ...PROFILE_EDITS[role],
      userType: user.userType?.value
        ? { label: labels[user.userType.value] ?? user.userType.label }
        : undefined,
      accountStatus: user.accountStatus?.value
        ? { label: labels[user.accountStatus.value] ?? user.accountStatus.label }
        : undefined,
    }),
    // The addresses tab reads the list off the user, not off /address.
    addresses: ADDRESSES.map((a) => ({ ...a })),
  };
}

// ── Campaign world (three campaigns, one application mid-lifecycle) ─────────
/** The demo company on the campaigns it owns — the detail page's owner controls read it. */
const DEMO_OWNER = { id: DEMO_COMPANY.id, name: DEMO_COMPANY.name } as never;

const CAMPAIGNS = [
  buildOpportunity({ company: DEMO_OWNER }),
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

const OLA_ID = 501;
const OLA = {
  id: OLA_ID,
  name: 'Ola Kowalska',
  firstName: 'Ola',
  lastName: 'Kowalska',
  email: 'ola.kowalska@example.com',
} as never;

/** The company's summer campaign — seeded campaign 501, as the rows name it. */
const SUMMER_CAMPAIGN = {
  id: 501,
  title: 'Letnia kampania specjałów kawowych',
  name: 'Kawiarnia Złote Ziarno',
  city: 'Kraków',
  active: true,
  createdTime: '2026-06-15T10:30:00',
} as never;

// Ola's fresh application (the "Zgłoszenia" bucket is APPLIED-only — the
// company tour's decide-applicant beat plays on this row). It waits under the
// summer campaign until the company tour publishes a new one; then it moves
// there (see storeCreatedCampaign)...
const APPLICATION_OLA = buildApplication({
  id: 8101,
  note: 'Dzień dobry! Prowadzę krakowski profil kawowy i chętnie pokażę Waszą nową kartę.',
  createdTime: '2026-09-07T09:40:00',
  lastUpdateTime: '2026-09-07T09:40:00',
  influencer: OLA,
  partnershipOpportunity: SUMMER_CAMPAIGN,
});

// ...and her older collab on the FitFuel campaign, further along: the reel
// is in and waits for FitFuel's review. Next to the row the influencer tour
// creates (accepted, green) it used to carry the same status and the same
// dates, and the two read as one collaboration twice (owner, 2026-09-07).
const APPLICATION_ACTIVE = buildApplication({
  id: 8102,
  opportunityStatus: buildOpportunityStatus(OpportunityStatus.CONTENT_SEND_TO_ACCEPT),
  note: 'Trenuję i gotuję — chętnie sprawdzę linię proteinową w prawdziwym planie dnia.',
  createdTime: '2026-08-20T09:30:00',
  lastUpdateTime: '2026-09-04T17:10:00',
  executionDate: '2026-09-12T18:00:00',
  influencer: OLA,
  partnershipOpportunity: {
    id: 502,
    title: 'Premiera linii przekąsek proteinowych',
    name: 'FitFuel S.A.',
    city: 'Warszawa',
  },
});

// The summer campaign already has three creators, each somewhere else in the
// process: the company's inbox shows the one whose turn is the company's
// (Piotr, accepted, next to Ola's fresh row), and the in-progress list shows
// all three under the campaign with a status each. Two rows that both said
// "Ola Kowalska" used to stand in for all of this (owner, 2026-09-07).
const APPLICATION_PIOTR = buildApplication({
  id: 8103,
  opportunityStatus: buildOpportunityStatus(OpportunityStatus.ACCEPTED_BY_COMPANY),
  note: 'Nagrywam wideo o kawie speciality — chętnie zrobię relację z degustacji letniej karty.',
  createdTime: '2026-08-31T11:20:00',
  lastUpdateTime: '2026-09-01T09:12:00',
  influencer: {
    id: 502,
    name: 'Piotr Nowak',
    firstName: 'Piotr',
    lastName: 'Nowak',
    email: 'piotr.nowak@example.com',
  } as never,
  partnershipOpportunity: SUMMER_CAMPAIGN,
});
const APPLICATION_MARTA = buildApplication({
  id: 8104,
  opportunityStatus: buildOpportunityStatus(OpportunityStatus.CONTENT_SEND_TO_ACCEPT),
  note: 'Zdjęcia z kawiarni i krótki reel — gotowe do sprawdzenia.',
  createdTime: '2026-08-24T16:05:00',
  lastUpdateTime: '2026-09-05T18:40:00',
  influencer: {
    id: 503,
    name: 'Marta Wiśniewska',
    firstName: 'Marta',
    lastName: 'Wiśniewska',
    email: 'marta.wisniewska@example.com',
  } as never,
  partnershipOpportunity: SUMMER_CAMPAIGN,
});
const APPLICATION_KUBA = buildApplication({
  id: 8105,
  opportunityStatus: buildOpportunityStatus(OpportunityStatus.TO_BE_PAID),
  note: 'Reel z degustacji opublikowany, link w treściach.',
  createdTime: '2026-08-18T12:00:00',
  lastUpdateTime: '2026-09-03T10:15:00',
  influencer: {
    id: 504,
    name: 'Kuba Zieliński',
    firstName: 'Kuba',
    lastName: 'Zieliński',
    email: 'kuba.zielinski@example.com',
  } as never,
  partnershipOpportunity: SUMMER_CAMPAIGN,
});

const APPLICATIONS = [
  APPLICATION_OLA,
  APPLICATION_ACTIVE,
  APPLICATION_PIOTR,
  APPLICATION_MARTA,
  APPLICATION_KUBA,
];
/** Where Ola's waiting row sits before a tour publishes a campaign. */
const SEED_OLA_CAMPAIGN = APPLICATION_OLA.partnershipOpportunity;
/** Seed statuses — the company's accept/decline mutates a row in place so
 * the dashboard tabs and counters follow; a new tour puts them back. */
const SEED_APPLICATION_STATUS = new Map(
  APPLICATIONS.map((a) => [a.id, a.opportunityStatus] as const),
);
const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set([
  OpportunityStatus.ACCEPTED_BY_COMPANY,
  OpportunityStatus.ACCEPTED_BY_INFLUENCER,
  OpportunityStatus.CONTENT_SEND_TO_ACCEPT,
  OpportunityStatus.CONTENT_APPROVED,
  OpportunityStatus.CONTENT_REJECTED,
  OpportunityStatus.CONTENT_POSTED,
  OpportunityStatus.CONTENT_POSTED_REJECTED,
  OpportunityStatus.TO_BE_PAID,
]);

/** Campaigns the demo company owns, by id; created ones count too. */
const OWN_CAMPAIGN_IDS: ReadonlySet<number> = new Set([501]);

/**
 * The rows the signed-in persona may see. One store serves both chairs: Ola
 * sees her own applications, the company sees applications to its campaigns,
 * the admin sees all of them — the way the BE scopes the same endpoint.
 */
function mineApplications(): typeof APPLICATIONS {
  const role = currentDemoRole();
  if (role === 'INFLUENCER') return APPLICATIONS.filter((a) => a.influencer?.id === OLA_ID);
  if (role === 'COMPANY') {
    return APPLICATIONS.filter((a) => {
      const id = a.partnershipOpportunity?.id;
      return id != null && (OWN_CAMPAIGN_IDS.has(id) || CREATED_CAMPAIGNS.some((c) => c.id === id));
    });
  }
  return APPLICATIONS;
}

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
  CONTENT_ROWS = SEED_CONTENT.map((row) => ({ ...row }));
  DICTIONARY = SEED_DICTIONARY.map((entry) => ({ ...entry }));
  PROFILE_EDITS = {};
  ADDRESSES = SEED_ADDRESSES.map((a) => ({ ...a }));
  nextAddressId = 43;
  PREFERENCES = { ...SEED_PREFERENCES };
  SOCIAL = SEED_SOCIAL.map((c) => ({ ...c }));
  CREATED_TICKETS = [];
  nextTicketNo = 190;
  totpSubmissions = 0;
  companyMailVerified = false;
  // The application the influencer tour makes is not seed data; a fresh tour
  // starts without it.
  for (let i = APPLICATIONS.length - 1; i >= 0; i--) {
    if (!SEED_APPLICATION_STATUS.has(APPLICATIONS[i].id ?? -1)) APPLICATIONS.splice(i, 1);
  }
  for (const a of APPLICATIONS) {
    const seed = SEED_APPLICATION_STATUS.get(a.id);
    if (seed) a.opportunityStatus = seed;
  }
  APPLICATION_OLA.partnershipOpportunity = SEED_OLA_CAMPAIGN;
  uploadSerial = 0;
  UPLOAD_URLS.clear();
}

// ── Submitted content (the review/submission screens of a collaboration) ────
// Ola's accepted FitFuel collab (application 8102) already carries three
// rows — one per decision state — so the company's "Sprawdź treści" review
// has a pending decision to make; her fresh coffee application (8101) has
// nothing submitted yet. Approve/reject/submit mutate this store so the
// review, the influencer's submission history and the badge counts agree.
const SEED_CONTENT: readonly AppliedOpportunityContentDtoOut[] = [
  {
    id: 8301,
    appliedOpportunityId: 8102,
    contentTypeId: 2,
    contentTypeName: 'Reel',
    contentCount: 1,
    socialMediaLink: 'https://instagram.com/reel/fitfuel-launch',
    description: 'Rolka premierowa — trening + przekąska po sesji.',
    approvalStatus: ContentApprovalStatus.PENDING,
    createdTime: '2026-06-24T10:00:00Z',
    submissionDate: '2026-06-24T10:00:00Z',
  },
  {
    id: 8302,
    appliedOpportunityId: 8102,
    contentTypeId: 1,
    contentTypeName: 'Post',
    contentCount: 2,
    socialMediaLink: 'https://instagram.com/p/fitfuel-teaser',
    description: 'Dwa posty zapowiadające premierę linii proteinowej.',
    approvalStatus: ContentApprovalStatus.APPROVED,
    createdTime: '2026-06-20T14:30:00Z',
    submissionDate: '2026-06-20T14:30:00Z',
    likesCount: 1520,
    commentsCount: 248,
    viewsCount: 11400,
    sharesCount: 77,
  },
  {
    id: 8303,
    appliedOpportunityId: 8102,
    contentTypeId: 3,
    contentTypeName: 'Story',
    contentCount: 3,
    description: 'Zestaw stories — kadry robocze.',
    approvalStatus: ContentApprovalStatus.REJECTED,
    approvalNotes: 'Logo zasłonięte w kadrach 2–3 — poproszę o powtórkę.',
    createdTime: '2026-06-18T09:15:00Z',
    submissionDate: '2026-06-18T09:15:00Z',
  },
];
let CONTENT_ROWS: AppliedOpportunityContentDtoOut[] = SEED_CONTENT.map((row) => ({ ...row }));

function contentRowsFor(path: string): AppliedOpportunityContentDtoOut[] {
  const id = Number(path.match(/applied-opportunity\/(\d+)/)?.[1]);
  return CONTENT_ROWS.filter((row) => row.appliedOpportunityId === id);
}

function contentRowById(path: string): AppliedOpportunityContentDtoOut | undefined {
  const id = Number(path.match(/content\/(\d+)/)?.[1]);
  return CONTENT_ROWS.find((row) => row.id === id);
}

function decideContent(
  path: string,
  status: ContentApprovalStatus,
  approvalNotes?: string,
): AppliedOpportunityContentDtoOut {
  const row = contentRowById(path) ?? CONTENT_ROWS[0];
  row.approvalStatus = status;
  row.lastUpdateTime = new Date().toISOString();
  if (approvalNotes) row.approvalNotes = approvalNotes;
  return { ...row };
}

function storeSubmittedContent(body: unknown): AppliedOpportunityContentDtoOut {
  const dto = (body ?? {}) as {
    appliedOpportunityId?: number;
    contentTypeId?: number;
    contentCount?: number;
    socialMediaLink?: string;
    description?: string;
    tags?: string;
  };
  const type = CONTENT_TYPES.find((t) => t.id === Number(dto.contentTypeId));
  const row: AppliedOpportunityContentDtoOut = {
    id: 8300 + CONTENT_ROWS.length + 1,
    appliedOpportunityId: Number(dto.appliedOpportunityId) || 8102,
    contentTypeId: dto.contentTypeId,
    contentTypeName: type?.name ?? 'Post',
    contentCount: dto.contentCount ?? 1,
    socialMediaLink: dto.socialMediaLink,
    description: dto.description,
    tags: dto.tags,
    approvalStatus: ContentApprovalStatus.PENDING,
    createdTime: new Date().toISOString(),
    submissionDate: new Date().toISOString(),
  };
  CONTENT_ROWS = [row, ...CONTENT_ROWS];
  return { ...row };
}

// ── Dictionary (the admin's translation editor) ─────────────────────────────
const SEED_DICTIONARY: readonly DictionaryEntry[] = [
  {
    id: 'd1',
    key: 'service_type.restaurant',
    value: 'Restauracja',
    languageCode: 'pl',
    category: 'service_type',
  },
  {
    id: 'd2',
    key: 'service_type.restaurant',
    value: 'Restaurant',
    languageCode: 'en',
    category: 'service_type',
  },
  {
    id: 'd3',
    key: 'service_type.cafe',
    value: 'Kawiarnia',
    languageCode: 'pl',
    category: 'service_type',
  },
  {
    id: 'd4',
    key: 'content_type.photo',
    value: 'Zdjęcie',
    languageCode: 'pl',
    category: 'content_type',
  },
  {
    id: 'd5',
    key: 'content_type.reel',
    value: 'Rolka',
    languageCode: 'pl',
    category: 'content_type',
  },
  {
    id: 'd6',
    key: 'platform.instagram',
    value: 'Instagram',
    languageCode: 'pl',
    category: 'platform',
  },
  { id: 'd7', key: 'platform.tiktok', value: 'TikTok', languageCode: 'pl', category: 'platform' },
];
let DICTIONARY: DictionaryEntry[] = SEED_DICTIONARY.map((entry) => ({ ...entry }));

function dictionaryCategories(): string[] {
  return [...new Set(DICTIONARY.map((e) => e.category).filter((c): c is string => !!c))];
}

// ── Legal documents (sign-up clickwrap + reconsent dialog) ──────────────────
// The clickwrap refuses to render unless all three required types arrive;
// links point at the real policy PDFs shipped under assets/docs.
const LEGAL_DOCS: readonly LegalDocumentDtoOut[] = [
  {
    type: LegalDocumentType.TERMS_OF_SERVICE,
    version: 2,
    contentHash: 'demo-tos-v2',
    effectiveFrom: '2026-06-01',
    downloadUrl: '/assets/docs/terms_conditions_v2_EN.pdf',
  },
  {
    type: LegalDocumentType.PRIVACY_POLICY,
    version: 2,
    contentHash: 'demo-pp-v2',
    effectiveFrom: '2026-06-01',
    downloadUrl: '/assets/docs/privacy_policy_v2_EN.pdf',
  },
  {
    type: LegalDocumentType.COOKIE_POLICY,
    version: 2,
    contentHash: 'demo-cp-v2',
    effectiveFrom: '2026-06-01',
    downloadUrl: '/assets/docs/cookie_policy_v2_EN.pdf',
  },
];

// ── TOTP enrolment (/auth/2fa-setup) ────────────────────────────────────────
// A deterministic secret + an inline SVG "QR" — the screen only needs a
// data URL it can put in an <img>; nothing here is scannable on purpose.
const TOTP_SETUP: TotpSetupResponse = {
  secret: 'JBSWY3DPEHPK3PXP',
  secretFormatted: 'JBSW Y3DP EHPK 3PXP',
  issuer: 'CheckItOut',
  email: 'admin@checkitout.app',
  qrCodeImage:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTYwIiB2aWV3Qm94PSIwIDAgMTYgMTYiIHNoYXBlLXJlbmRlcmluZz0iY3Jpc3BFZGdlcyI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZmZmIi8+PHBhdGggZmlsbD0iIzBlMTExNiIgZD0iTTEgMWg1djVIMXptMSAxdjNoM1Yyem03LTFoNXY1SDl6bTEgMXYzaDNWMnpNMSA5aDV2NUgxem0xIDF2M2gzdi0zem03LTFoMXYxSDl6bTIgMGgxdjJoLTF6bTIgMGgxdjFoLTF6bS0yIDJoMXYxaC0xem0yIDBoMnYxaC0yem0tNCAyaDF2MWgtMXptMiAwaDF2MmgtMXptMiAxaDF2MWgtMXpNOCA4aDF2MUg4em0wLTZoMXYxSDh6bTAgMmgxdjJIOHptLTUgNGgxdjFIM3ptMiAwaDF2MUg1em0yIDBoMXYxSDd6Ii8+PC9zdmc+',
  backupCodes: [
    '1111-2222',
    '3333-4444',
    '5555-6666',
    '7777-8888',
    '9999-0000',
    '1212-3434',
    '5656-7878',
    '9090-1212',
  ],
};

/** The key of the guided scenario currently running (SandboxDirector's `demoSandbox`). */
function activeSandboxKey(): string | null {
  try {
    const raw =
      typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('demoSandbox');
    return raw ? ((JSON.parse(raw) as { key?: string }).key ?? null) : null;
  } catch {
    return null;
  }
}

/** admin@… plays the admin, a creator-flavoured address plays Ola, anything else the brand. */
function personaForEmail(email: string | undefined): DemoRole {
  const e = (email ?? '').trim().toLowerCase();
  if (e.startsWith('admin')) return 'ADMIN';
  if (/^(ola|creator|influencer|tworca|twórca)/.test(e) || e.includes('influencer')) {
    return 'INFLUENCER';
  }
  return 'COMPANY';
}

function demoSignIn(body: unknown): Record<string, unknown> {
  const email = (body as { email?: string } | undefined)?.email;
  const role = personaForEmail(email);
  setDemoRole(role);
  setDemoSignedIn(true);
  // The TOTP beat only plays inside the admin-2fa sandbox, where the phone
  // simulator is on screen to hand out codes; a plain admin sign-in
  // elsewhere would otherwise strand the visitor in the code dialog.
  const requires2FA = role === 'ADMIN' && activeSandboxKey() === 'admin-2fa';
  return {
    email,
    displayName: DEMO_USERS[role].name,
    registered: true,
    emailVerified: true,
    requires2FA,
    requires2FASetup: false,
  };
}

function demoRegister(body: unknown): Record<string, unknown> {
  const email = (body as { email?: string } | undefined)?.email;
  const path = typeof window === 'undefined' ? '' : window.location.pathname;
  const role: DemoRole = path.includes('business') ? 'COMPANY' : 'INFLUENCER';
  setDemoRole(role);
  setDemoSignedIn(true);
  return {
    email,
    registered: true,
    emailVerified: true,
    requires2FA: false,
    requires2FASetup: false,
  };
}

/**
 * Whether the visitor has clicked the link in the simulated welcome mail.
 *
 * The company onboarding beat and the e-mail beat are two beats, and the second
 * one is only a story if the first has not already told it.
 */
let companyMailVerified = false;

/** The inbox simulator's verify link, pressed. */
export function markCompanyMailVerified(): void {
  companyMailVerified = true;
}

/**
 * How many codes have been *submitted* to /twofactor/verify this run.
 *
 * The refusal the tour narrates is keyed on this rather than on how many codes
 * the phone has produced. A real server never learns how many codes your phone
 * displayed; it only sees what you send it — and counting generations meant a
 * visitor who pressed "Wygeneruj kod" themselves, which is exactly what the
 * ring is telling them to do, burned the refusal. The guide's own code then
 * became the second one, was accepted, and the admin was signed in on the beat
 * that exists to show a refusal — after which the tour asked for a code from
 * inside the app they had just been let into.
 */
let totpSubmissions = 0;

/** The phone simulator's state — see PhoneTotpSimComponent (`demoTotp`). */
function demoTotpAttempt(): { attempt: number; code: string } | null {
  try {
    const raw =
      typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(DEMO_TOTP_KEY);
    return raw ? (JSON.parse(raw) as { attempt: number; code: string }) : null;
  } catch {
    return null;
  }
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
    photos?: { url?: string; uploadId?: string; orderNumber?: number; isCover?: boolean }[];
  };
  const created = buildOpportunity({
    id: nextCreatedCampaignId++,
    company: DEMO_OWNER,
    createdTime: new Date().toISOString(),
    lastUpdateTime: new Date().toISOString(),
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
      // The form sends the tracked uploadId, never a URL: resolve what the
      // signed-url step handed out for it.
      url: p.url ?? (p.uploadId ? UPLOAD_URLS.get(p.uploadId) : undefined) ?? DEMO_PHOTO_URL,
      orderNumber: p.orderNumber ?? i,
      isCover: p.isCover ?? i === 0,
    })) as never,
  });
  CREATED_CAMPAIGNS.unshift(created);
  // Ola applies to what the company just published: her waiting row moves
  // under the new campaign, so the inbox and the in-progress list both name
  // the campaign the visitor typed.
  APPLICATION_OLA.partnershipOpportunity = {
    id: created.id,
    title: created.title,
    name: created.name,
    city: created.city,
    active: created.active,
    createdTime: created.createdTime,
  } as never;
  return created;
}

/**
 * Campaign-photo placeholder the demo upload pipeline resolves to — a tiny
 * inline SVG so the thumbnail renders offline, no bucket involved.
 */
/** Files the campaign tour attaches — they live in the app's own assets. */
const DEMO_UPLOADS: ReadonlySet<string> = new Set(['karta-kawowa.png', 'latte.png']);
let uploadSerial = 0;
/** uploadId -> public URL, for the campaign the form then creates. */
const UPLOAD_URLS = new Map<string, string>();

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
// Tickets the visitor creates in this session. Creating one used to echo the
// answered seed (same reference CIO-2026-0189, same answer), so every new
// ticket looked already handled; a created ticket now gets its own number
// and starts open and unanswered, and the seeded thread keeps the "read the
// answer" beat of the support tour.
let CREATED_TICKETS: SupportTicketDtoOut[] = [];
let nextTicketNo = 190;
const allTickets = (): SupportTicketDtoOut[] => [...CREATED_TICKETS, TICKET];
const ticketByPathId = (path: string): SupportTicketDtoOut | undefined => {
  const id = Number(path.split('/').pop());
  return allTickets().find((t) => t.id === id);
};

const TICKET: SupportTicketDtoOut = {
  id: 9001,
  contactEmail: 'demo@checkitout.app',
  subject: 'Nie mogę edytować opublikowanej kampanii',
  description:
    'Po publikacji kampanii przycisk edycji jest nieaktywny. Czy mogę jeszcze poprawić budżet?',
  status: TicketStatus.OPEN,
  statusDisplay: 'Otwarte',
  category: TicketCategory.TECHNICAL_PROBLEM,
  categoryDisplay: 'Problem techniczny',
  ticketReference: 'CIO-2026-0189',
  adminAssignee: 'Zespół checkItOut',
  createdTime: '2026-09-01T10:05:00',
  lastUpdateTime: '2026-09-01T10:05:00',
  // No reply yet: the admin tour writes the first one, so the thread the
  // admin opens holds only the customer's message (owner, 2026-09-07). The
  // support tour reads its answer on the ticket it raised, not on this one.
  responses: [],
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
/** Session key for the tier the checkout simulator is asked to sell. */
export const DEMO_CHECKOUT_KEY = 'demoCheckout';
/** Session key for the step-up tour's one-time e-mail code. */
export const DEMO_STEP_UP_KEY = 'demoStepUpCode';
/** Session key for the phone simulator's TOTP attempt — see PhoneTotpSimComponent. */
export const DEMO_TOTP_KEY = 'demoTotp';
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
  // Identity + session — the whole app keys off /users/me. A signed-out
  // persona answers `null` (SessionState caches "anonymous" without an
  // error, so public pages never bounce); sign-in, sign-up and the guided
  // scenarios flip the flag. Any credentials work — the e-mail picks the
  // persona, a sign-up takes the role from the form it came from.
  {
    method: 'GET',
    match: /\/users\/me$/,
    respond: () => (isDemoSignedIn() ? currentDemoUser() : null),
  },
  { method: 'POST', match: /\/auth\/firebase\/login$/, respond: (_p, body) => demoSignIn(body) },
  {
    method: 'POST',
    match: /\/auth\/firebase\/register$/,
    respond: (_p, body) => demoRegister(body),
  },
  { method: 'POST', match: /\/auth\/exchange-token$/, respond: () => ({ status: 'ok' }) },
  {
    method: 'POST',
    match: /\/auth\/sign-out$/,
    respond: () => {
      setDemoSignedIn(false);
      return {};
    },
  },
  // Profile edit round-trips (the card re-renders from the response).
  {
    method: 'GET',
    match: /\/users\/me\/deletion-eligibility$/,
    respond: () => deletionEligibility(),
  },
  { method: 'GET', match: /\/users\/\d+$/, respond: () => currentDemoUser() },
  {
    method: 'PATCH',
    match: /\/users\/\d+$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as Record<string, unknown>;
      const role = currentDemoRole();
      const edits: Record<string, unknown> = { ...PROFILE_EDITS[role] };
      for (const key of EDITABLE_PROFILE_FIELDS) {
        if (typeof dto[key] === 'string') edits[key] = dto[key];
      }
      PROFILE_EDITS[role] = edits as Partial<UserDtoOut>;
      return currentDemoUser();
    },
  },
  // Account deletion (soft): the screen signs out right after, and the
  // persona simply comes back on the next visit — nothing here is real.
  { method: 'DELETE', match: /\/users\/[\d,]+$/, respond: () => ({}) },
  // 2FA — the admin persona is enrolled; enrolment itself (/auth/2fa-setup)
  // and the admin-2fa sandbox's verify beat are served from the same
  // deterministic secret. The FIRST code the phone simulator generates is
  // recorded as already expired (the teaching beat); the second is good.
  {
    method: 'GET',
    match: /\/twofactor\/status$/,
    respond: () => {
      const admin = currentDemoRole() === 'ADMIN';
      // Generated TwoFactorStatusResponse fields + the legacy `enabled`/
      // `configured` pair some callers still read.
      return {
        role: admin ? 'ADMIN' : currentDemoRole(),
        has2FA: admin,
        requires2FASetup: false,
        canAccessAdmin: admin,
        enabled: admin,
        configured: true,
      };
    },
  },
  { method: 'POST', match: /\/twofactor\/setup$/, respond: () => ({ ...TOTP_SETUP }) },
  {
    method: 'POST',
    match: /\/twofactor\/verify-setup$/,
    respond: () => ({
      success: true,
      verified: true,
      newRole: 'ADMIN',
      canAccessAdmin: true,
      autoLoggedIn: true,
    }),
  },
  {
    method: 'POST',
    match: /\/twofactor\/verify$/,
    respond: (_p, body) => {
      const sent = (body as { code?: string } | undefined)?.code;
      const totp = demoTotpAttempt();
      totpSubmissions += 1;
      // The first code sent is always too old; any later one is accepted if it
      // is the code the phone is showing now.
      const fresh = !!totp && totpSubmissions >= 2 && sent === totp.code;
      return fresh
        ? { success: true, verified: true, twoFactorVerified: true, canAccessAdmin: true }
        : { success: false, verified: false, message: 'expired' };
    },
  },
  {
    method: 'POST',
    match: /\/twofactor\/backup-codes$/,
    respond: () => ({ success: true, backupCodes: TOTP_SETUP.backupCodes }),
  },
  { method: 'POST', match: /\/twofactor\/disable$/, respond: () => ({ success: true }) },

  // Legal — consents all accepted (the reconsent dialog never nags); the
  // sign-up clickwrap still needs the three current documents to render.
  {
    method: 'GET',
    match: /\/legal\/current$/,
    respond: () => LEGAL_DOCS.map((doc) => ({ ...doc })),
  },
  { method: 'GET', match: /\/legal\/consent\/status$/, respond: () => ({ upToDate: true }) },

  // Notifications.
  {
    method: 'GET',
    match: /\/notifications\/unread\/count$/,
    respond: () => ({ count: NOTIFICATIONS.filter((n) => !n.isRead).length }),
  },
  // The generated client speaks `/notifications` (plural): the paged list,
  // `/unread/count` for the bell badge, `/read-all` (POST) and `/{id}/read`
  // (PATCH). Marking read mutates the seed so the badge and the list agree.
  { method: 'GET', match: /\/notifications$/, respond: () => buildPage(NOTIFICATIONS) },
  {
    method: 'POST',
    match: /\/notifications\/read-all$/,
    respond: () => {
      NOTIFICATIONS.forEach((n) => (n.isRead = true));
      return {};
    },
  },
  {
    method: 'PATCH',
    match: /\/notifications\/\d+\/read$/,
    respond: (p) => {
      const id = Number(p.match(/notifications\/(\d+)/)?.[1]);
      const hit = NOTIFICATIONS.find((n) => n.id === id);
      if (hit) hit.isRead = true;
      return {};
    },
  },

  // Campaigns — reads serve created rows first (the meta card's promise),
  // writes land in the in-memory store so create → detail → list all agree.
  {
    method: 'GET',
    match: /\/partnership-opportunity\/\d+$/,
    respond: (p) => byIdStrict(allCampaigns(), p) ?? DEMO_NOT_FOUND,
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
    respond: (_p, body) => {
      const filename = (body as { filename?: string } | null)?.filename ?? '';
      // A file from the repo shows as itself; anything the visitor picks
      // resolves to the inline placeholder (there is no bucket to take it).
      const publicUrl = DEMO_UPLOADS.has(filename)
        ? `/assets/demo/campaign/${filename}`
        : DEMO_PHOTO_URL;
      const uploadId = `demo-upload-${++uploadSerial}`;
      UPLOAD_URLS.set(uploadId, publicUrl);
      return {
        uploadUrl: '/api/demo/upload-sink',
        publicUrl,
        uploadId,
        filePath: `demo/${filename || 'campaign-photo.svg'}`,
      };
    },
  },
  { method: 'POST', match: /\/upload\/confirm\//, respond: () => ({ status: 'CONFIRMED' }) },

  // Submitted content — review (company) + submission history (influencer).
  {
    method: 'GET',
    match: /\/applied-opportunity\/content\/applied-opportunity\/\d+\/paged$/,
    respond: (p) => buildPage(contentRowsFor(p)),
  },
  {
    method: 'GET',
    match: /\/applied-opportunity\/content\/applied-opportunity\/\d+$/,
    respond: (p) => contentRowsFor(p).map((row) => ({ ...row })),
  },
  {
    method: 'GET',
    match: /\/applied-opportunity\/content\/pending-approval$/,
    respond: () => CONTENT_ROWS.filter((r) => r.approvalStatus === ContentApprovalStatus.PENDING),
  },
  {
    method: 'GET',
    match: /\/applied-opportunity\/content\/\d+$/,
    respond: (p) => contentRowById(p) ?? null,
  },
  {
    method: 'POST',
    match: /\/applied-opportunity\/content$/,
    respond: (_p, body) => storeSubmittedContent(body),
  },
  {
    method: 'PATCH',
    match: /\/applied-opportunity\/content\/\d+\/approve$/,
    respond: (p) => decideContent(p, ContentApprovalStatus.APPROVED),
  },
  {
    method: 'PATCH',
    match: /\/applied-opportunity\/content\/\d+\/reject$/,
    respond: (p, body, params) =>
      decideContent(
        p,
        ContentApprovalStatus.REJECTED,
        (body as { approvalNotes?: string } | undefined)?.approvalNotes ??
          params?.get('approvalNotes') ??
          undefined,
      ),
  },

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

  // Influencer apply — records a fresh application for the chosen campaign.
  //
  // It used to read `partnershipOpportunityId` from the request, and the client
  // sends `partnershipOpportunity`, so the lookup never matched and every
  // application came back as the builder's default: campaign 501, "Letnia
  // kampania specjałów kawowych", with a note the visitor had not written. The
  // influencer tour applies to 503 and its closing beat then showed a different
  // campaign entirely — a reviewer walking it by hand put it plainly, that the
  // campaign at the end is not the campaign the visitor chose.
  //
  // And the echo was only an echo: nothing was stored, so the collaborations
  // list could only ever show the seeded rows. The tour's last beat promises the
  // company has just accepted you, so the row goes in accepted, where the
  // narration says it is.
  {
    method: 'POST',
    match: /\/applied-opportunity$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as {
        partnershipOpportunity?: number;
        partnershipOpportunityId?: number;
        note?: string;
      };
      const wanted = dto.partnershipOpportunity ?? dto.partnershipOpportunityId;
      const campaign = allCampaigns().find((c) => c.id === wanted);
      const made = buildApplication({
        id: 8200,
        opportunityStatus: buildOpportunityStatus(OpportunityStatus.ACCEPTED_BY_COMPANY),
        note: dto.note,
        influencer: {
          id: 501,
          name: 'Ola Kowalska',
          firstName: 'Ola',
          lastName: 'Kowalska',
          email: 'ola.kowalska@example.com',
        } as never,
        partnershipOpportunity: campaign
          ? {
              id: campaign.id,
              title: campaign.title,
              name: campaign.name,
              city: campaign.city as never,
            }
          : undefined,
      });
      const at = APPLICATIONS.findIndex((x) => x.id === made.id);
      if (at >= 0) APPLICATIONS.splice(at, 1, made);
      else APPLICATIONS.push(made);
      return made;
    },
  },

  // Applications / collaborations.
  {
    method: 'GET',
    match: /\/applied-opportunity\/statistics$/,
    // Counted from the store so an accepted applicant moves the tab badges.
    respond: () => {
      const status = (a: (typeof APPLICATIONS)[number]): string => a.opportunityStatus?.value ?? '';
      const mine = mineApplications();
      return {
        total: mine.length,
        newOpportunities: mine.filter((a) => status(a) === OpportunityStatus.APPLIED).length,
        inProgress: mine.filter((a) => IN_PROGRESS_STATUSES.has(status(a))).length,
        done: mine.filter((a) => status(a) === OpportunityStatus.DONE).length,
      } satisfies AppliedOpportunityStatisticsDto;
    },
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
  {
    method: 'GET',
    match: /\/applied-opportunity\/\d+$/,
    respond: (p) => byIdStrict(APPLICATIONS, p) ?? DEMO_NOT_FOUND,
  },
  {
    // The campaign-applicants page filters by partnershipOpportunity.id —
    // honour it so campaign 501's applicants view shows only Ola's row.
    method: 'GET',
    match: /\/applied-opportunity(\/paged)?$/,
    respond: (_p, _b, params) => {
      // The generated client is post-processed to send list filters FLAT
      // (`opportunityStatus=A,B`, `partnershipOpportunity.id=501`), not under a
      // `filters.` prefix; read both forms, so a hand-built HttpParams in a test
      // and the real request agree. The prefixed-only lookup silently matched
      // nothing in the browser, and the per-campaign applicants page listed
      // every application there was (owner, 2026-09-07: "two the same persons").
      const filter = (key: string): string | null =>
        params?.get(key) ?? params?.get(`filters.${key}`) ?? null;
      const campaignId = filter('partnershipOpportunity.id');
      // The collaboration dashboard asks per tab: `opportunityStatus=A,B,C`.
      const statuses = filter('opportunityStatus')?.split(',').filter(Boolean);
      const mine = mineApplications();
      let rows = campaignId
        ? mine.filter((a) => String(a.partnershipOpportunity?.id) === campaignId)
        : mine;
      if (statuses?.length) {
        rows = rows.filter((a) => statuses.includes(a.opportunityStatus?.value ?? ''));
      }
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
      // Persist: the applicants page updates in place from the echo, but the
      // dashboard's "W trakcie" tab and its counters re-read the store.
      existing.opportunityStatus = buildOpportunityStatus(next);
      return mergeDto(existing, {} as never);
    },
  },
  {
    method: 'GET',
    match: /\/activecoop\/inprogress$/,
    respond: () =>
      buildPage(
        mineApplications().filter((a) =>
          IN_PROGRESS_STATUSES.has(a.opportunityStatus?.value ?? ''),
        ),
      ),
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
  {
    method: 'GET',
    match: /\/address\/user\/\d+\/primary$/,
    respond: () => ({ ...(ADDRESSES.find((a) => a.primary) ?? ADDRESSES[0] ?? buildAddress()) }),
  },
  {
    method: 'GET',
    match: /\/address\/user\/\d+$/,
    respond: () => ADDRESSES.map((a) => ({ ...a })),
  },
  {
    method: 'POST',
    match: /\/address\/user\/\d+$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as Partial<AddressDtoOut>;
      const now = new Date().toISOString();
      const primary = dto.primary === true || ADDRESSES.length === 0;
      if (primary) ADDRESSES.forEach((a) => (a.primary = false));
      const created = buildAddress({
        id: nextAddressId++,
        userId: currentDemoUser().id,
        street: dto.street ?? '',
        city: dto.city ?? '',
        postalCode: dto.postalCode ?? '',
        country: dto.country ?? 'Polska',
        state: dto.state ?? '',
        additionalInfo: dto.additionalInfo ?? '',
        addressType: dto.addressType ?? 'MAIN',
        primary,
        createdTime: now,
        lastUpdateTime: now,
      });
      ADDRESSES.push(created);
      return { ...created };
    },
  },
  {
    method: 'PATCH',
    match: /\/address\/\d+$/,
    respond: (path, body) => {
      const id = Number(path.split('/').pop());
      const current = ADDRESSES.find((a) => a.id === id);
      if (!current) return {};
      const dto = (body ?? {}) as Partial<AddressDtoOut>;
      if (dto.primary === true) ADDRESSES.forEach((a) => (a.primary = a.id === id));
      Object.assign(current, dto, { id, lastUpdateTime: new Date().toISOString() });
      return { ...current };
    },
  },
  {
    method: 'DELETE',
    match: /\/address\/[\d,]+$/,
    respond: (path) => {
      const ids = idsFromPath(path);
      ADDRESSES = ADDRESSES.filter((a) => !ids.includes(a.id ?? -1));
      return {};
    },
  },
  {
    method: 'GET',
    match: /\/user-preferences\/(me|user\/\d+)$/,
    respond: () => ({ ...PREFERENCES }),
  },
  {
    method: 'PATCH',
    match: /\/user-preferences\/me$/,
    respond: (_p, body) => {
      PREFERENCES = {
        ...PREFERENCES,
        ...((body ?? {}) as Partial<UserPreferencesDtoOut>),
        lastUpdateTime: new Date().toISOString(),
      };
      return { ...PREFERENCES };
    },
  },
  {
    method: 'GET',
    match: /\/user-social-connection(\/paged)?$/,
    respond: () =>
      buildPage(currentDemoRole() === 'INFLUENCER' ? SOCIAL.map((c) => ({ ...c })) : []),
  },
  {
    method: 'DELETE',
    match: /\/user-social-connection\/[\d,]+$/,
    respond: (path) => {
      const ids = idsFromPath(path);
      SOCIAL = SOCIAL.filter((c) => !ids.includes(c.id ?? -1));
      return {};
    },
  },
  // Company onboarding's last beat — confirming the registry data leaves the
  // account waiting on the e-mail, which is the beat the tour narrates next.
  //
  // It used to answer ACTIVE straight away, so the screen behind the inbox card
  // read "Twoje konto jest aktywne!" while the guide was asking the visitor to
  // go and prove the address is theirs. A reviewer walking the tour by hand read
  // the page through the half-transparent card and reported the tour announcing
  // the result of the step it was still asking for.
  {
    method: 'POST',
    match: /\/registry\/confirm$/,
    respond: (_p, body) =>
      ({
        activated: companyMailVerified,
        accountStatus: companyMailVerified
          ? CompanyDataConfirmResponseAccountStatusEnum.ACTIVE
          : CompanyDataConfirmResponseAccountStatusEnum.IN_VALIDATION,
        companyDataId: 1,
        companyName: 'Demo Brand Sp. z o.o.',
        nip: (body as { nip?: string } | null)?.nip ?? '5260250995',
        message:
          (readLangChoice() ?? 'pl') === 'pl'
            ? companyMailVerified
              ? 'Dane firmy potwierdzone — konto jest aktywne.'
              : 'Dane firmy potwierdzone — zostało potwierdzenie adresu e-mail.'
            : companyMailVerified
              ? 'Company data confirmed — the account is active.'
              : 'Company data confirmed — the e-mail address is still to be verified.',
      }) satisfies CompanyDataConfirmResponse,
  },
  // The 503 page re-probes the backend before it sends the visitor back.
  { method: 'GET', match: /\/test\/health$/, respond: () => ({ status: 'UP' }) },

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

  // Upgrade trio — consent proof lands, then the checkout: the sessionUrl is
  // same-origin, so the plan page hops there without a reload, and the tour's
  // checkout simulator plays Stripe's page for the tier noted here. The plan
  // itself is stored by the simulator's Pay — the completed-payment webhook —
  // not by the request that only opened the checkout (see PLAN_PRESETS above).
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
        sessionStorage.setItem(DEMO_CHECKOUT_KEY, target);
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

  // Support — one answered seed thread plus whatever the visitor creates;
  // my-tickets, the admin queue and the by-reference lookup read the same
  // store, so a created ticket shows up everywhere under its own number.
  {
    method: 'POST',
    match: /\/support\/ticket$/,
    respond: (_p, body) => {
      const dto = (body ?? {}) as {
        subject?: string;
        description?: string;
        contactEmail?: string;
        category?: TicketCategory;
      };
      const now = '2026-09-02T09:15:00';
      const created: SupportTicketDtoOut = {
        id: 9002 + CREATED_TICKETS.length,
        contactEmail: dto.contactEmail ?? TICKET.contactEmail,
        subject: dto.subject ?? TICKET.subject,
        description: dto.description ?? TICKET.description,
        status: TicketStatus.OPEN,
        statusDisplay: 'Otwarty',
        category: dto.category ?? TICKET.category,
        categoryDisplay:
          !dto.category || dto.category === TICKET.category ? TICKET.categoryDisplay : undefined,
        ticketReference: `CIO-2026-${String(nextTicketNo++).padStart(4, '0')}`,
        createdTime: now,
        lastUpdateTime: now,
        // The tour's next beat says "Support juz odpowiedzial" and asks the
        // visitor to open the ticket and read the answer. It used to ring the
        // SEEDED ticket, because that was the only one carrying a reply — so the
        // beat sent the visitor to a different ticket from the one they had just
        // filed, under a reference they had just been given. A reviewer reading
        // frames put it exactly that way. The answer belongs to the ticket that
        // was raised.
        responses: [
          {
            id: 1,
            ticketId: 9002 + CREATED_TICKETS.length,
            content:
              (readLangChoice() ?? 'pl') === 'pl'
                ? 'Dzień dobry! Faktury za dany miesiąc wystawiamy pierwszego dnia następnego ' +
                  'miesiąca i wysyłamy na adres rozliczeniowy firmy. Wszystkie znajdziesz też w ' +
                  'zakładce Rozliczenia — z numerem KSeF, jeśli był nadany.'
                : 'Hello! Invoices for a given month are issued on the first day of the next one ' +
                  'and sent to the company billing address. They are all in the Billing tab as ' +
                  'well, with the KSeF number where one was assigned.',
            fromAdmin: true,
            adminName: 'Zespół checkItOut',
            createdTime: now,
          },
        ],
      };
      CREATED_TICKETS = [created, ...CREATED_TICKETS];
      return { ...created };
    },
  },
  {
    method: 'GET',
    match: /\/support\/ticket\/my-tickets$/,
    respond: () => buildPage(allTickets()),
  },
  { method: 'GET', match: /\/support\/ticket\/\d+$/, respond: (p) => ticketByPathId(p) ?? TICKET },
  { method: 'GET', match: /\/support\/ticket$/, respond: () => buildPage(allTickets()) },
  // By-reference lookup — the "check your ticket" page (works logged-out on
  // prod; the my-tickets rows deep-link here with ref + email).
  {
    method: 'GET',
    match: /\/support\/ticket\/status$/,
    respond: (_p, _b, params) =>
      allTickets().find((t) => t.ticketReference === params?.get('reference')) ?? TICKET,
  },
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
        createdTime: new Date().toISOString(),
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
  // Admin dictionary — in-memory editor: list, categories, add, remove.
  { method: 'GET', match: /\/dictionary\/all$/, respond: () => DICTIONARY.map((e) => ({ ...e })) },
  { method: 'GET', match: /\/dictionary\/categories$/, respond: () => dictionaryCategories() },
  {
    method: 'POST',
    match: /\/dictionary\/entry$/,
    respond: (_p, body) => {
      const entry = {
        ...((body ?? {}) as DictionaryEntry),
        id: `d${DICTIONARY.length + 1}-${Date.now()}`,
      };
      DICTIONARY = [entry, ...DICTIONARY];
      return { ...entry };
    },
  },
  {
    method: 'DELETE',
    match: /\/dictionary\/entry$/,
    respond: (_p, _body, params) => {
      const id = params?.get('id');
      DICTIONARY = DICTIONARY.filter((e) => e.id !== id);
      return {};
    },
  },
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

/** Like byId without the first-row fallback — for GET-by-id, where a wrong id must 404. */
function byIdStrict<T extends { id?: number }>(list: readonly T[], path: string): T | undefined {
  const id = Number(path.split('/').pop());
  return list.find((x) => x.id === id);
}

/**
 * A rule returns this to make the interceptor answer 404. Until now
 * /collaborations/999999 rendered the first seeded campaign (and a
 * cascade-deleted campaign came back as the next one), because byId()
 * fell back to list[0]; the detail screens already own a not-found state.
 */
export const DEMO_NOT_FOUND: unique symbol = Symbol('demo-404');

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
