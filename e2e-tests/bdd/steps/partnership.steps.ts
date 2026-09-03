import { ACTORS } from '../../_framework/actor';
import { seedSession } from '../../integration/_actor';
import type { ApiResult } from '../../_framework/api/http-client';
import { PartnershipApi } from '../../_framework/api/partnership.api';
import { TestSession } from '../../_framework/api/test-session';
import { After, expect, Given, Then, When } from './fixtures';

import type { PartnershipOpportunityDtoIn } from '../../../src/app/api/model/partnership-opportunity-dto-in';
import type { AppliedOpportunityDtoIn } from '../../../src/app/api/model/applied-opportunity-dto-in';
import type { AppliedOpportunityDtoOut } from '../../../src/app/api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityContentDtoIn } from '../../../src/app/api/model/applied-opportunity-content-dto-in';
import type { CompensationType } from '../../../src/app/api/model/compensation-type';
import { AddressDtoInAddressTypeEnum } from '../../../src/app/api/model/address-dto-in';
import { OpportunityStatus } from '../../../src/app/api/model/opportunity-status';
import { RateStatus } from '../../../src/app/api/model/rate-status';

/**
 * Partnership Opportunity Lifecycle oracle — Layer 2 (functional).
 *
 * Mirrors checkitout-backend/.../partnership/partnership-flow.feature against the
 * LIVE BE, driving it THROUGH the Layer-1 service layer (../../_framework/api):
 * TestSession owns each actor's authenticated context + the /test-hook seeding,
 * PartnershipApi exposes the typed endpoints. The steps below are thin
 * orchestration + assertions — all endpoint shapes live in L1, so a BE contract
 * change breaks L0 (generated DTOs) → L1 (PartnershipApi) → here at compile time.
 *
 * Two TestSessions (company + influencer) run concurrently so one scenario
 * drives both sides. Status is read from opportunityStatus.value; ratings from
 * companyRateStatus.value (company→influencer) and rateStatus.value (influencer→company).
 */

type Store = { id: number; [k: string]: unknown };
type ContentRef = { id: number; dto: Record<string, unknown> };

interface OracleWorld {
  companySession?: TestSession;
  influencerSession?: TestSession;
  companyUserId?: number;
  opportunities?: Record<string, Store>;
  applications?: Record<string, Store>;
  contents?: Record<string, ContentRef>;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

type Table = { rowsHash(): Record<string, string> };

/** ISO_LOCAL_DATE_TIME (no timezone) — matches the BE DTO's LocalDateTime fields. */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

function sessionFor(world: OracleWorld, who: string): TestSession {
  const s = who === 'company' ? world.companySession : world.influencerSession;
  if (!s) throw new Error(`no ${who} session — did the Background run?`);
  return s;
}

/** A per-actor PartnershipApi (Layer 1) bound to that actor's authenticated transport. */
function apiFor(world: OracleWorld, who: string): PartnershipApi {
  return new PartnershipApi(sessionFor(world, who).api);
}

/** Stash status+headers+body of the last call so `the response status should be` can assert + surface errors. */
function record(world: OracleWorld, r: ApiResult): void {
  world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function requireOpportunity(world: OracleWorld, ref: string): Store {
  const o = world.opportunities?.[ref];
  if (!o) throw new Error(`unknown opportunity "${ref}"`);
  return o;
}
function requireApplication(world: OracleWorld, ref: string): Store {
  const a = world.applications?.[ref];
  if (!a) throw new Error(`unknown application "${ref}"`);
  return a;
}
function requireContent(world: OracleWorld, ref: string): ContentRef {
  const c = world.contents?.[ref];
  if (!c) throw new Error(`unknown content "${ref}"`);
  return c;
}

/** Re-fetch the application fresh (company side) for a status/rating assertion. */
async function fetchApplication(
  world: OracleWorld,
  appRef: string,
): Promise<AppliedOpportunityDtoOut> {
  const app = requireApplication(world, appRef);
  const r = await apiFor(world, 'company').getApplication(app.id);
  expect(r.ok, `GET /applied-opportunity/${app.id} (HTTP ${r.status})`).toBeTruthy();
  return r.json;
}

// ── Background — two authenticated actor sessions, each fully seeded ─────────

Given('the company actor is signed in and active', async ({ playwright, world }) => {
  world.companySession = await TestSession.open(playwright, ACTORS['company1']);
  world.companyUserId = await world.companySession.userId();
  await world.companySession.grantEnterprisePlan();
});

Given('the influencer actor is signed in and active', async ({ playwright, world }) => {
  world.influencerSession = await TestSession.open(playwright, ACTORS['influencer1']);
  await world.influencerSession.activate();
  await world.influencerSession.seedInstagram();
});

After(async ({ world }) => {
  // Boot-guard hygiene: leave the company on FREE_ACTIVE — the dev BE refuses
  // to boot (payments disabled) while a subscription row sits in a PAID status.
  await world.companySession?.restoreFreePlan().catch(() => undefined);
  await world.companySession?.dispose();
  await world.influencerSession?.dispose();
});

// ── Create opportunity ──────────────────────────────────────────────────────

When(
  'the company creates partnership opportunity {string}:',
  async ({ world }, ref: string, table: Table) => {
    const row = table.rowsHash();
    const now = new Date();
    const dto: PartnershipOpportunityDtoIn = {
      company: world.companyUserId!,
      name: row['name'],
      city: row['city'],
      title: row['title'],
      details: row['details'],
      requirements: row['requirements'],
      followersMin: Number(row['followersMin'] ?? 1),
      followersMax: Number(row['followersMax'] ?? 1_000_000),
      compensationType: row['compensationType'] as CompensationType,
      compensationAmountMin: Number(row['compensationMin'] ?? 100),
      compensationAmountMax: Number(row['compensationMax'] ?? 1000),
      currency: Number(row['currency'] ?? 1),
      platforms: new Set((row['platforms'] ?? '1').split(',').map(Number)),
      contentTypes: new Set((row['contentTypes'] ?? '1').split(',').map(Number)),
      serviceType: Number(row['serviceType'] ?? 1),
      startDate: isoLocal(new Date(now.getTime() + 7 * 864e5)),
      endDate: isoLocal(new Date(now.getTime() + 37 * 864e5)),
      active: true,
      // Nested address — COMPANY users are 403'd on POST /address directly; the
      // opportunity endpoint persists it inline (verified idempotent on repeats).
      address: {
        street: 'ul. Testowa 1',
        city: 'Warszawa',
        postalCode: '00-001',
        country: 'Poland',
        addressType: AddressDtoInAddressTypeEnum.MAIN,
      },
      photos: [],
    };
    const r = await apiFor(world, 'company').createOpportunity(dto);
    record(world, r);
    (world.opportunities ??= {})[ref] = r.json as Store;
  },
);

Then('the response status should be {int}', async ({ world }, status: number) => {
  expect(
    world.lastResponse?.status,
    `expected ${status}; response body: ${(world.lastResponse?.body ?? '(none recorded)').slice(0, 400)}`,
  ).toBe(status);
});

Then(
  'opportunity {string} should have {word} {string}',
  async ({ world }, ref: string, field: string, value: string) => {
    expect(String(requireOpportunity(world, ref)[field])).toBe(value);
  },
);

Then('opportunity {string} should be active', async ({ world }, ref: string) => {
  expect(requireOpportunity(world, ref)['active']).toBe(true);
});

// ── Apply ───────────────────────────────────────────────────────────────────

When(
  'the influencer applies to opportunity {string} with note {string} storing the application as {string}',
  async ({ world }, oppRef: string, note: string, appRef: string) => {
    const dto: AppliedOpportunityDtoIn = {
      partnershipOpportunity: requireOpportunity(world, oppRef).id,
      note,
    };
    const r = await apiFor(world, 'influencer').apply(dto);
    record(world, r);
    (world.applications ??= {})[appRef] = r.json as Store;
  },
);

// ── State-machine advances (accept both sides / reject IG / verify / pay) ────

When('the {word} accepts application {string}', async ({ world }, who: string, appRef: string) => {
  record(world, await apiFor(world, who).advanceStatus(requireApplication(world, appRef).id, true));
});

When(
  'the company rejects the Instagram post for application {string} with reason {string}',
  async ({ world }, appRef: string, _reason: string) => {
    // The BE state machine only reads accept=false here; the reason is client-side context.
    record(
      world,
      await apiFor(world, 'company').advanceStatus(requireApplication(world, appRef).id, false),
    );
  },
);

When(
  'the company verifies the Instagram post for application {string}',
  async ({ world }, appRef: string) => {
    record(
      world,
      await apiFor(world, 'company').advanceStatus(requireApplication(world, appRef).id, true),
    );
  },
);

When('the company confirms payment for application {string}', async ({ world }, appRef: string) => {
  record(
    world,
    await apiFor(world, 'company').advanceStatus(requireApplication(world, appRef).id, true),
  );
});

// ── Content submission + review ──────────────────────────────────────────────

When(
  'the influencer submits content for application {string} storing the content as {string}:',
  async ({ world }, appRef: string, contentRef: string, table: Table) => {
    const row = table.rowsHash();
    const dto: AppliedOpportunityContentDtoIn = {
      appliedOpportunityId: requireApplication(world, appRef).id,
      contentTypeId: Number(row['contentTypeId'] ?? 1),
      contentCount: Number(row['contentCount'] ?? 1),
      // Only send urls when the scenario provides one: wrapping an absent
      // row serializes as [null], which @VimeoUrls correctly rejects (a
      // provided list must contain only trusted URLs) — the review-page
      // scenario submits without urls and 400'd into review-row-undefined.
      ...(row['urls'] ? { urls: [row['urls']] } : {}),
      description: row['description'],
      tags: row['tags'],
    };
    const r = await apiFor(world, 'influencer').submitContent(dto);
    record(world, r);
    (world.contents ??= {})[contentRef] = {
      id: (r.json as { id: number }).id,
      dto: dto as unknown as Record<string, unknown>,
    };
  },
);

When(
  'the company rejects content {string} with notes {string}',
  async ({ world }, contentRef: string, notes: string) => {
    record(
      world,
      await apiFor(world, 'company').rejectContent(requireContent(world, contentRef).id, notes),
    );
  },
);

When(
  'the company approves content {string} with notes {string}',
  async ({ world }, contentRef: string, notes: string) => {
    record(
      world,
      await apiFor(world, 'company').approveContent(requireContent(world, contentRef).id, notes),
    );
  },
);

When(
  'the influencer posts content {string} to Instagram with link {string}',
  async ({ world }, contentRef: string, link: string) => {
    const content = requireContent(world, contentRef);
    const dto = {
      ...content.dto,
      socialMediaLink: link,
    } as unknown as AppliedOpportunityContentDtoIn;
    record(world, await apiFor(world, 'influencer').postToInstagram(content.id, dto));
  },
);

// ── Ratings ─────────────────────────────────────────────────────────────────

When(
  'the company rates the influencer {string} for application {string}',
  async ({ world }, rating: string, appRef: string) => {
    record(
      world,
      await apiFor(world, 'company').rateInfluencer(
        requireApplication(world, appRef).id,
        rating as RateStatus,
      ),
    );
  },
);

When(
  'the influencer rates the company {string} for application {string}',
  async ({ world }, rating: string, appRef: string) => {
    record(
      world,
      await apiFor(world, 'influencer').rateCompany(
        requireApplication(world, appRef).id,
        rating as RateStatus,
      ),
    );
  },
);

// ── Status + rating assertions (always re-fetch fresh) ──────────────────────

Then(
  'application {string} should have opportunity status {string}',
  async ({ world }, appRef: string, expected: string) => {
    // Contract guard: the feature's state name must be a real generated enum member.
    expect(
      Object.values(OpportunityStatus),
      `"${expected}" is not an OpportunityStatus member`,
    ).toContain(expected);
    const app = await fetchApplication(world, appRef);
    expect(app.opportunityStatus?.value).toBe(expected);
  },
);

Then(
  'application {string} should have company rating {string}',
  async ({ world }, appRef: string, expected: string) => {
    expect(Object.values(RateStatus), `"${expected}" is not a RateStatus member`).toContain(
      expected,
    );
    const app = await fetchApplication(world, appRef);
    expect(app.companyRateStatus?.value).toBe(expected);
  },
);

Then(
  'application {string} should have influencer rating {string}',
  async ({ world }, appRef: string, expected: string) => {
    expect(Object.values(RateStatus), `"${expected}" is not a RateStatus member`).toContain(
      expected,
    );
    const app = await fetchApplication(world, appRef);
    expect(app.rateStatus?.value).toBe(expected);
  },
);

// ── Review-page UI drive ──────────────────────────────────────────────────────
// Regression net for the 2026-09-02 LazyInit 500: every step above talks to the
// BE through the typed API layer, so the REVIEW PAGE's own GET (the one that
// maps DTOs outside a transaction on the BE) was never exercised — the exact
// seam where a lazy ContentType proxy 500ed for the reviewing company. These
// steps drive the real page with the company's browser session.

When(
  'the company opens the content review page for application {string}',
  async ({ page, world }, appRef: string) => {
    const app = requireApplication(world, appRef);
    // Same BE user as world.companySession, but on the PAGE's cookie jar —
    // double-seed flips emailVerified/setupCompleted (existing-user branch).
    await seedSession(page, ACTORS['company1']!.email, 'COMPANY');
    await seedSession(page, ACTORS['company1']!.email, 'COMPANY');
    await page.goto(`/collaborations/applications/${app.id}/review`);
  },
);

Then('the review page lists content {string}', async ({ page, world }, contentRef: string) => {
  const content = requireContent(world, contentRef);
  // review-error rendering here is the 500 regression biting again.
  await expect(page.getByTestId('review-error')).toHaveCount(0);
  await expect(page.getByTestId(`review-row-${content.id}`)).toBeVisible({ timeout: 10_000 });
});

When(
  'the company approves content {string} from the review page',
  async ({ page, world }, contentRef: string) => {
    const content = requireContent(world, contentRef);
    await page.getByTestId(`review-approve-${content.id}`).click();
    // The row chip flips once the PATCH lands — wait on it so the following
    // API assertion never races the mutation.
    await expect(page.getByTestId(`review-status-${content.id}`)).not.toHaveText(/oczekuj/i, {
      timeout: 10_000,
    });
  },
);
