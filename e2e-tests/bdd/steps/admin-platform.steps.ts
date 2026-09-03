import { AdminPlatformApi } from '../../_framework/api/admin-platform.api';
import type { ApiResult } from '../../_framework/api/http-client';
import { TestSession, type PlaywrightRequestFactory } from '../../_framework/api/test-session';
import { After, Then, When, expect } from './fixtures';

import {
  AddressDtoInAddressTypeEnum,
  type AddressDtoIn,
} from '../../../src/app/api/model/address-dto-in';
import type { CityDto } from '../../../src/app/api/model/city-dto';
import type { ConsentDefinitionDtoIn } from '../../../src/app/api/model/consent-definition-dto-in';
import type { ContentTypeDto } from '../../../src/app/api/model/content-type-dto';
import type { CurrencyDto } from '../../../src/app/api/model/currency-dto';
import type { FaqCategoryDtoIn } from '../../../src/app/api/model/faq-category-dto-in';
import type { FaqDtoIn } from '../../../src/app/api/model/faq-dto-in';
import type { PageSupportTicketDtoOut } from '../../../src/app/api/model/page-support-ticket-dto-out';
import type { ServiceTypeDto } from '../../../src/app/api/model/service-type-dto';
import type { SupportTicketDtoIn } from '../../../src/app/api/model/support-ticket-dto-in';
import type { SupportTicketDtoOut } from '../../../src/app/api/model/support-ticket-dto-out';
import { TicketCategory } from '../../../src/app/api/model/ticket-category';
import { TicketStatus } from '../../../src/app/api/model/ticket-status';

/**
 * Admin platform-management oracle — Layer 2 (functional), for the BE
 * admin-platform-management.feature (11 consolidated scenarios: ticket
 * lifecycle, FAQ CRUD + display order, ban impact, system monitoring, user
 * data management, reference data CRUD, content review, security reads,
 * validation edge cases, GDPR + consent admin), driven THROUGH the Layer-1
 * AdminPlatformApi against the LIVE BE, mirroring the BE glue
 * (AdminPlatformManagementSteps.java + AdminUserManagementSteps.java).
 *
 * Actor model (shared with admin-users.steps.ts — the ban/status/profile/list
 * steps and the administrator seeding are DEFINED there and reused by this
 * feature): the mock-session admin lives under the world key `adminUmAdmin`,
 * per-scenario disposable targets under `adminUmTargets` (alias → {session,
 * userId}). This file resolves the same keys via the local-cast pattern, so
 * one provisioning Given feeds both step families; admin-users' untagged
 * After owns their disposal.
 *
 * Glue-parity mechanics kept here:
 *   - uniqueName() suffixing for valid-path reference-data creates, including
 *     the city heuristic (blank / <2 / >50 char names sent VERBATIM so the
 *     validation cases exercise the raw values);
 *   - store-created-id-on-2xx + null-guarded cleanup deletes (a skipped
 *     cleanup synthesizes 204, exactly like the glue's null checks);
 *   - "true"/"false" → boolean coercion for preferences/consent tables;
 *   - sendEmail:false on admin ticket replies.
 *
 * State lives on a local World view (cast pattern — fixtures.ts untouched)
 * under ap*-prefixed keys; only `lastResponse` (the canonical "the response
 * status should be {int}" feed, partnership.steps.ts) and the adminUm* keys
 * above are shared.
 */

interface AdminTargetRef {
  session: TestSession;
  userId: number;
  email: string;
  role: 'COMPANY' | 'INFLUENCER';
}

interface AdminPlatformWorld {
  /** Shared with admin-users.steps.ts — seeded by '"Admin" is signed in as the administrator'. */
  adminUmAdmin?: TestSession;
  /** Shared with admin-users.steps.ts — alias → disposable target. */
  adminUmTargets?: Record<string, AdminTargetRef>;
  /** Anonymous transport for the public ticket-creation / customer-reply endpoints. */
  apAnon?: TestSession;
  /** The stored support ticket (id + public reference/email for customer replies). */
  apTicket?: { id: number; reference?: string; email?: string };
  apFaqCategoryId?: number;
  apFaqId?: number;
  apFaqIds?: Record<string, number>;
  apAddressId?: number;
  apCityId?: number;
  apCurrencyId?: number;
  /** The created currency body — the BE glue PUTs a full body on update. */
  apCurrencyCreate?: CurrencyDto;
  apContentTypeId?: number;
  apContentTypeName?: string;
  apServiceTypeId?: number;
  apServiceTypeCreate?: ServiceTypeDto;
  apConsentDefinitionId?: number;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

type Table = { rowsHash(): Record<string, string> };

// ── Helpers ──────────────────────────────────────────────────────────────────

function record(w: AdminPlatformWorld, r: ApiResult<unknown>): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function snippet(w: AdminPlatformWorld): string {
  return (w.lastResponse?.body ?? '(none)').slice(0, 300);
}

function requireAdminSession(w: AdminPlatformWorld): TestSession {
  if (!w.adminUmAdmin) {
    throw new Error('no administrator session — did the Background Given run?');
  }
  return w.adminUmAdmin;
}

/** Alias → live session: "Admin" or a provisioned disposable target. */
function sessionFor(w: AdminPlatformWorld, alias: string): TestSession {
  if (alias === 'Admin') return requireAdminSession(w);
  const target = w.adminUmTargets?.[alias];
  if (target) return target.session;
  throw new Error(`unknown actor "${alias}" — provision it as a disposable target first`);
}

function targetUserId(w: AdminPlatformWorld, alias: string): number {
  const target = w.adminUmTargets?.[alias];
  if (!target) throw new Error(`unknown target "${alias}" — did its provisioning Given run?`);
  return target.userId;
}

function apiFor(w: AdminPlatformWorld, alias: string): AdminPlatformApi {
  return new AdminPlatformApi(sessionFor(w, alias));
}

/** '{targetUserId}' in a literal feature path → the CompanyTarget row id. */
function resolvePath(w: AdminPlatformWorld, path: string): string {
  if (!path.includes('{targetUserId}')) return path;
  return path.replace('{targetUserId}', String(targetUserId(w, 'CompanyTarget')));
}

async function anonSession(
  w: AdminPlatformWorld,
  playwright: PlaywrightRequestFactory,
): Promise<TestSession> {
  return (w.apAnon ??= await TestSession.openAnonymous(playwright));
}

function parseLast<T>(w: AdminPlatformWorld): T {
  const body = w.lastResponse?.body;
  if (!body) throw new Error('no recorded response body — did the When step run?');
  return JSON.parse(body) as T;
}

function statusIn(w: AdminPlatformWorld, allowed: number[], label: string): void {
  const status = w.lastResponse?.status ?? -1;
  expect(allowed, `${label} — got ${status}; response body: ${snippet(w)}`).toContain(status);
}

/** 2xx helper for the "successful or …" tolerant assertions. */
function isSuccess(status: number | undefined): boolean {
  return status !== undefined && status >= 200 && status < 300;
}

/** Glue parity: a skipped null-guarded cleanup reads as a clean 204. */
function synthesizeSkipped(w: AdminPlatformWorld, note: string): void {
  w.lastResponse = { status: 204, headers: {}, body: `(skipped — ${note})` };
}

/** Per-run unique suffix (BE glue uniqueName() parity, collision-hardened). */
function uniqueSuffix(): string {
  return `-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Suffix valid names; keep blank ones blank (the blank-name cases are the point). */
function uniquifyName(base: string | undefined): string {
  const name = base ?? '';
  if (!name.trim()) return name;
  return `${name}${uniqueSuffix()}`;
}

/**
 * BE glue heuristic verbatim: only names that would PASS the 2..50 length
 * validation get the unique suffix; validation-case values go out raw. The
 * suffixed result is clamped so a valid name never overflows the 50 limit.
 */
function uniquifyCityName(base: string | undefined): string {
  const name = base ?? '';
  const isValidationCase = name.trim().length < 2 || name.length > 50;
  if (isValidationCase) return name;
  const suffix = uniqueSuffix();
  return name.slice(0, Math.max(2, 50 - suffix.length)) + suffix;
}

function guardTicketStatus(name: string): TicketStatus {
  expect(Object.values(TicketStatus), `"${name}" is not a TicketStatus member`).toContain(name);
  return name as TicketStatus;
}

function guardTicketCategory(name: string): TicketCategory {
  expect(Object.values(TicketCategory), `"${name}" is not a TicketCategory member`).toContain(name);
  return name as TicketCategory;
}

function guardAddressType(name: string): AddressDtoInAddressTypeEnum {
  expect(
    Object.values(AddressDtoInAddressTypeEnum),
    `"${name}" is not an AddressDtoIn addressType member`,
  ).toContain(name);
  return name as AddressDtoInAddressTypeEnum;
}

/** "true"/"false" strings → booleans, everything else passes through (glue parity). */
function coerceTableValues(rows: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rows)) {
    body[key] = value === 'true' ? true : value === 'false' ? false : value;
  }
  return body;
}

function ticketDtoFromTable(rows: Record<string, string>): SupportTicketDtoIn {
  return {
    contactEmail: rows['contactEmail'],
    subject: rows['subject'],
    description: rows['description'],
    category: guardTicketCategory(rows['category'] ?? ''),
  };
}

function storeTicketFrom(
  w: AdminPlatformWorld,
  r: ApiResult<SupportTicketDtoOut>,
  contactEmail: string | undefined,
): void {
  if (r.ok && typeof r.json.id === 'number') {
    w.apTicket = { id: r.json.id, reference: r.json.ticketReference, email: contactEmail };
  }
}

function requireTicket(w: AdminPlatformWorld): { id: number; reference?: string; email?: string } {
  if (!w.apTicket) throw new Error('no stored ticket — did the creation step run?');
  return w.apTicket;
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
// Sessions in adminUmAdmin/adminUmTargets are disposed by admin-users.steps.ts'
// untagged After (shared ownership); only this oracle's anonymous transport is
// ours to close. Reference-data rows are deleted in-scenario (BE source parity)
// and target-account statuses self-heal at the next provisioning Given.

After({ tags: '@admin-platform' }, async ({ world }) => {
  const w = world as AdminPlatformWorld;
  await w.apAnon?.dispose().catch(() => undefined);
  w.apAnon = undefined;
});

// ── Generic raw-path probes (the BE feature's literal "requests VERB /path") ──

When('{string} requests GET {string}', async ({ world }, alias: string, path: string) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).requestGet(resolvePath(w, path)));
});

When('{string} requests POST {string}', async ({ world }, alias: string, path: string) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).requestPost(resolvePath(w, path)));
});

When('{string} requests PATCH {string}', async ({ world }, alias: string, path: string) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).requestPatch(resolvePath(w, path)));
});

When('{string} requests DELETE {string}', async ({ world }, alias: string, path: string) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).requestDelete(resolvePath(w, path)));
});

// ── Tolerant status assertions (BE source wording, exact status classes) ─────

Then('the response should be successful or not found', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  const status = w.lastResponse?.status ?? -1;
  expect(
    isSuccess(status) || status === 404,
    `expected 2xx or 404, got ${status}; response body: ${snippet(w)}`,
  ).toBe(true);
});

Then('the response should be successful or conflict', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  const status = w.lastResponse?.status ?? -1;
  expect(
    isSuccess(status) || status === 409,
    `expected 2xx or 409, got ${status}; response body: ${snippet(w)}`,
  ).toBe(true);
});

Then('the response status should be {int} or {int}', async ({ world }, a: number, b: number) => {
  statusIn(world as AdminPlatformWorld, [a, b], `expected ${a} or ${b}`);
});

Then(
  'the response status should be {int} or {int} or {int}',
  async ({ world }, a: number, b: number, c: number) => {
    statusIn(world as AdminPlatformWorld, [a, b, c], `expected ${a} or ${b} or ${c}`);
  },
);

Then('the response status should indicate a stale session', async ({ world }) => {
  // BE source pins 419 (Session Expired); tokenVersion staleness maps to the
  // {401,419} class under the mock-session collapse (see feature header +
  // e2e-tests/integration/flows/admin-inactive-flow.spec.ts).
  statusIn(world as AdminPlatformWorld, [401, 419], 'stale-session probe');
});

// ── Support ticket lifecycle ─────────────────────────────────────────────────

When('a support ticket is created with:', async ({ playwright, world }, table: Table) => {
  // Public endpoint — created through the ANONYMOUS transport, like the BE run.
  const w = world as AdminPlatformWorld;
  const rows = table.rowsHash();
  const anon = await anonSession(w, playwright);
  const r = await new AdminPlatformApi(anon).createTicket(ticketDtoFromTable(rows));
  record(w, r);
  storeTicketFrom(w, r, rows['contactEmail']);
});

When('{string} creates a support ticket with:', async ({ world }, alias: string, table: Table) => {
  // Authenticated variant (scenario 9): same public endpoint, but the actor's
  // session rides along — authenticated users bypass the anonymous rate limit.
  const w = world as AdminPlatformWorld;
  const rows = table.rowsHash();
  const r = await apiFor(w, alias).createTicket(ticketDtoFromTable(rows));
  record(w, r);
  storeTicketFrom(w, r, rows['contactEmail']);
});

Then('the ticket should have status {string}', async ({ world }, statusName: string) => {
  const w = world as AdminPlatformWorld;
  const status = guardTicketStatus(statusName);
  expect(parseLast<SupportTicketDtoOut>(w).status, `ticket status; body: ${snippet(w)}`).toBe(
    status,
  );
});

Then('the ticket status should be {string}', async ({ world }, statusName: string) => {
  const w = world as AdminPlatformWorld;
  const status = guardTicketStatus(statusName);
  expect(parseLast<SupportTicketDtoOut>(w).status, `ticket status; body: ${snippet(w)}`).toBe(
    status,
  );
});

Then('the ticket should have a reference code', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  expect(
    parseLast<SupportTicketDtoOut>(w).ticketReference,
    'created ticket must carry a public reference code',
  ).toBeTruthy();
});

Then('the ticket ID is stored for later use', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  expect(w.apTicket?.id, 'ticket id must have been captured at creation').toBeDefined();
});

When('{string} lists support tickets', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).listTickets());
});

Then('the response should contain the created ticket', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  const page = parseLast<PageSupportTicketDtoOut>(w);
  const id = requireTicket(w).id;
  expect(
    (page.content ?? []).some((t) => t.id === id),
    `ticket ${id} present in the admin listing (${page.content?.length ?? 0} rows returned)`,
  ).toBe(true);
});

When('{string} views the stored ticket by ID', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).getTicket(requireTicket(w).id));
});

When(
  '{string} changes ticket status to {string}',
  async ({ world }, alias: string, statusName: string) => {
    const w = world as AdminPlatformWorld;
    const status = guardTicketStatus(statusName);
    record(w, await apiFor(w, alias).updateTicketStatus(requireTicket(w).id, status));
  },
);

When(
  '{string} attempts to change ticket status to {string}',
  async ({ world }, alias: string, statusName: string) => {
    // Same wire call — the feature's Then asserts the 409 the state machine returns.
    const w = world as AdminPlatformWorld;
    const status = guardTicketStatus(statusName);
    record(w, await apiFor(w, alias).updateTicketStatus(requireTicket(w).id, status));
  },
);

When('{string} adds admin response {string}', async ({ world }, alias: string, content: string) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).addAdminResponse(requireTicket(w).id, content));
});

When(
  'a customer response is added to the stored ticket with content {string}',
  async ({ playwright, world }, content: string) => {
    // Public endpoint keyed by reference + email — the anonymous transport again.
    const w = world as AdminPlatformWorld;
    const ticket = requireTicket(w);
    if (!ticket.reference || !ticket.email) {
      throw new Error('stored ticket carries no reference/email — was creation successful?');
    }
    const anon = await anonSession(w, playwright);
    record(
      w,
      await new AdminPlatformApi(anon).addCustomerResponse(ticket.reference, ticket.email, content),
    );
  },
);

// ── FAQ CRUD + display order ─────────────────────────────────────────────────

When(
  '{string} creates FAQ category with name {string} and description {string}',
  async ({ world }, alias: string, name: string, description: string) => {
    const w = world as AdminPlatformWorld;
    const dto: FaqCategoryDtoIn = { name: uniquifyName(name), description, active: true };
    const r = await apiFor(w, alias).createFaqCategory(dto);
    record(w, r);
    if (r.ok && typeof r.json.id === 'number') w.apFaqCategoryId = r.json.id;
  },
);

Then('the FAQ category ID is stored for later use', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  expect(w.apFaqCategoryId, 'FAQ category id must have been captured').toBeDefined();
});

When(
  '{string} creates FAQ with question {string} and answer {string}',
  async ({ world }, alias: string, question: string, answer: string) => {
    const w = world as AdminPlatformWorld;
    if (w.apFaqCategoryId == null) {
      throw new Error('no stored FAQ category — did the category creation step run?');
    }
    const dto: FaqDtoIn = { question, answer, categoryId: w.apFaqCategoryId, active: true };
    const r = await apiFor(w, alias).createFaq(dto);
    record(w, r);
    if (r.ok && typeof r.json.id === 'number') w.apFaqId = r.json.id;
  },
);

Then('the FAQ ID is stored for later use', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  expect(w.apFaqId, 'FAQ id must have been captured').toBeDefined();
});

Then('the FAQ ID is stored as {string}', async ({ world }, name: string) => {
  const w = world as AdminPlatformWorld;
  expect(w.apFaqId, `FAQ id must have been captured before storing as "${name}"`).toBeDefined();
  (w.apFaqIds ??= {})[name] = w.apFaqId!;
});

When(
  '{string} updates the stored FAQ with question {string} and answer {string}',
  async ({ world }, alias: string, question: string, answer: string) => {
    const w = world as AdminPlatformWorld;
    if (w.apFaqId == null) throw new Error('no stored FAQ to update');
    const dto: FaqDtoIn = {
      question,
      answer,
      categoryId: w.apFaqCategoryId,
      active: true,
    };
    record(w, await apiFor(w, alias).updateFaq(w.apFaqId, dto));
  },
);

When('{string} soft deletes the stored FAQ', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apFaqId == null) throw new Error('no stored FAQ to delete');
  record(w, await apiFor(w, alias).softDeleteFaq(w.apFaqId));
});

When(
  '{string} soft deletes the stored FAQ {string}',
  async ({ world }, alias: string, name: string) => {
    const w = world as AdminPlatformWorld;
    const id = w.apFaqIds?.[name];
    if (id == null) throw new Error(`no FAQ stored as "${name}"`);
    record(w, await apiFor(w, alias).softDeleteFaq(id));
  },
);

When('{string} soft deletes the stored FAQ category', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apFaqCategoryId == null) throw new Error('no stored FAQ category to delete');
  record(w, await apiFor(w, alias).softDeleteFaqCategory(w.apFaqCategoryId));
});

When(
  '{string} updates FAQ {string} display order to {int}',
  async ({ world }, alias: string, name: string, order: number) => {
    const w = world as AdminPlatformWorld;
    const id = w.apFaqIds?.[name];
    if (id == null) throw new Error(`no FAQ stored as "${name}"`);
    record(w, await apiFor(w, alias).setFaqDisplayOrder(id, order));
  },
);

When(
  '{string} updates stored FAQ category display order to {int}',
  async ({ world }, alias: string, order: number) => {
    const w = world as AdminPlatformWorld;
    if (w.apFaqCategoryId == null) throw new Error('no stored FAQ category');
    record(w, await apiFor(w, alias).setFaqCategoryDisplayOrder(w.apFaqCategoryId, order));
  },
);

// ── Per-target monitoring / user data operations ─────────────────────────────

When(
  '{string} views uploads for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).uploadsForUser(targetUserId(w, target)));
  },
);

When(
  '{string} views consent info for user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).userConsents(targetUserId(w, target)));
  },
);

When(
  '{string} views consent info for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).userConsents(targetUserId(w, target)));
  },
);

When(
  '{string} views GDPR retention for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).gdprRetentionForUser(targetUserId(w, target)));
  },
);

When(
  '{string} requests location export for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).gdprExportForUser(targetUserId(w, target)));
  },
);

When(
  '{string} views preferences for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).preferencesForUser(targetUserId(w, target)));
  },
);

When(
  '{string} patches preferences for target user {string} with:',
  async ({ world }, alias: string, target: string, table: Table) => {
    // Raw key/value map with the glue's boolean coercion — the validation
    // cases (unknown field, illegal enum, oversized strings) must reach the
    // wire untyped to prove the BE rejects them.
    const w = world as AdminPlatformWorld;
    const body = coerceTableValues(table.rowsHash());
    record(w, await apiFor(w, alias).patchPreferencesForUser(targetUserId(w, target), body));
  },
);

When(
  '{string} checks deletion eligibility for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).deletionEligibility(targetUserId(w, target)));
  },
);

When(
  '{string} sets premium status to {word} for target user {string}',
  async ({ world }, alias: string, premium: string, target: string) => {
    const w = world as AdminPlatformWorld;
    expect(['true', 'false'], `premium flag must be true/false, got "${premium}"`).toContain(
      premium,
    );
    record(w, await apiFor(w, alias).setPremium(targetUserId(w, target), premium === 'true'));
  },
);

// ── Address management (admin on a target user) ──────────────────────────────

When(
  '{string} views addresses for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).addressesForUser(targetUserId(w, target)));
  },
);

When(
  '{string} views primary address for target user {string}',
  async ({ world }, alias: string, target: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).primaryAddressForUser(targetUserId(w, target)));
  },
);

When(
  '{string} creates address for target user {string} with:',
  async ({ world }, alias: string, target: string, table: Table) => {
    const w = world as AdminPlatformWorld;
    const rows = table.rowsHash();
    const dto: AddressDtoIn = {
      street: rows['street'] ?? '',
      city: rows['city'] ?? '',
      postalCode: rows['postalCode'] ?? '',
      country: rows['country'] ?? '',
      addressType: guardAddressType(rows['addressType'] ?? ''),
      primary: rows['isPrimary'] === 'true',
    };
    const r = await apiFor(w, alias).createAddressForUser(targetUserId(w, target), dto);
    record(w, r);
    if (r.ok && typeof r.json.id === 'number') w.apAddressId = r.json.id;
  },
);

Then('the address ID is stored for cleanup', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  // Only enforced when the create actually succeeded — the surrounding Then
  // already tolerates non-2xx outcomes (BE source parity).
  if (isSuccess(w.lastResponse?.status)) {
    expect(w.apAddressId, 'address id must be captured from a 2xx create').toBeDefined();
  }
});

When(
  '{string} updates the stored address with:',
  async ({ world }, alias: string, table: Table) => {
    const w = world as AdminPlatformWorld;
    if (w.apAddressId == null) throw new Error('no stored address to update');
    const patch = table.rowsHash() as Partial<AddressDtoIn>;
    record(w, await apiFor(w, alias).patchAddress(w.apAddressId, patch));
  },
);

When('{string} deletes the stored address', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apAddressId == null) {
    synthesizeSkipped(w, 'no stored address; creation did not succeed');
    return;
  }
  record(w, await apiFor(w, alias).deleteAddress(w.apAddressId));
  w.apAddressId = undefined;
});

// ── City CRUD ────────────────────────────────────────────────────────────────

When('{string} creates city with:', async ({ world }, alias: string, table: Table) => {
  const w = world as AdminPlatformWorld;
  const rows = table.rowsHash();
  const dto: CityDto = {
    name: uniquifyCityName(rows['name']),
    state: rows['state'] ?? 'E2E State',
    country: rows['country'] ?? 'Poland',
  };
  const r = await apiFor(w, alias).createCity(dto);
  record(w, r);
  if (r.ok && typeof r.json.id === 'number') w.apCityId = r.json.id;
});

Then('the city ID is stored for cleanup', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  if (isSuccess(w.lastResponse?.status)) {
    expect(w.apCityId, 'city id must be captured from a 2xx create').toBeDefined();
  }
});

When('{string} views the stored city', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apCityId == null) throw new Error('no stored city to view');
  record(w, await apiFor(w, alias).getCity(w.apCityId));
});

When('{string} updates the stored city with:', async ({ world }, alias: string, table: Table) => {
  const w = world as AdminPlatformWorld;
  if (w.apCityId == null) throw new Error('no stored city to update');
  const rows = table.rowsHash();
  const dto: CityDto = {
    id: w.apCityId,
    name: uniquifyCityName(rows['name']),
    state: rows['state'],
    country: rows['country'],
  };
  record(w, await apiFor(w, alias).updateCity(w.apCityId, dto));
});

When('{string} patches the stored city with:', async ({ world }, alias: string, table: Table) => {
  const w = world as AdminPlatformWorld;
  if (w.apCityId == null) throw new Error('no stored city to patch');
  const rows = table.rowsHash();
  const patch: Partial<CityDto> = {};
  if (rows['name'] !== undefined) patch.name = uniquifyCityName(rows['name']);
  if (rows['state'] !== undefined) patch.state = rows['state'];
  if (rows['country'] !== undefined) patch.country = rows['country'];
  record(w, await apiFor(w, alias).patchCity(w.apCityId, patch));
});

When('{string} deletes the stored city', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apCityId == null) {
    synthesizeSkipped(w, 'no stored city; creation did not succeed');
    return;
  }
  record(w, await apiFor(w, alias).deleteCity(w.apCityId));
  w.apCityId = undefined;
});

// ── Currency CRUD ────────────────────────────────────────────────────────────

When('{string} creates currency with:', async ({ world }, alias: string, table: Table) => {
  const w = world as AdminPlatformWorld;
  const rows = table.rowsHash();
  // isoCode stays VERBATIM — the duplicate-isoCode and length-validation cases
  // depend on the exact value (BE glue parity: no uniqueName for currencies).
  const dto: CurrencyDto = {
    isoCode: rows['isoCode'] ?? '',
    name: rows['name'] ?? '',
    sign: rows['sign'] ?? '',
    countryCode: rows['countryCode'] ?? '',
  };
  const r = await apiFor(w, alias).createCurrency(dto);
  record(w, r);
  if (r.ok && typeof r.json.id === 'number') {
    w.apCurrencyId = r.json.id;
    w.apCurrencyCreate = dto;
  }
});

Then('the currency ID is stored for cleanup', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  if (isSuccess(w.lastResponse?.status)) {
    expect(w.apCurrencyId, 'currency id must be captured from a 2xx create').toBeDefined();
  }
});

When(
  '{string} updates the stored currency with:',
  async ({ world }, alias: string, table: Table) => {
    const w = world as AdminPlatformWorld;
    if (w.apCurrencyId == null) {
      synthesizeSkipped(w, 'no stored currency; creation conflicted');
      return;
    }
    // PUT with the full created body merged with the table (BE glue parity).
    const dto: CurrencyDto = {
      ...(w.apCurrencyCreate ?? {}),
      ...table.rowsHash(),
      id: w.apCurrencyId,
    };
    record(w, await apiFor(w, alias).updateCurrency(w.apCurrencyId, dto));
  },
);

When(
  '{string} updates currency ID {int} with:',
  async ({ world }, alias: string, id: number, table: Table) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).updateCurrency(id, { id, ...table.rowsHash() }));
  },
);

When('{string} deletes the stored currency', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apCurrencyId == null) {
    synthesizeSkipped(w, 'no stored currency; creation conflicted');
    return;
  }
  record(w, await apiFor(w, alias).deleteCurrency(w.apCurrencyId));
  w.apCurrencyId = undefined;
});

When('{string} deletes currency ID {int}', async ({ world }, alias: string, id: number) => {
  const w = world as AdminPlatformWorld;
  record(w, await apiFor(w, alias).deleteCurrency(id));
});

// ── ContentType CRUD ─────────────────────────────────────────────────────────
// ContentTypeDto is {id, name} on the greenfield contract — the BE source
// table's "description" is off-contract and dropped (see feature header).

When('{string} creates content type with:', async ({ world }, alias: string, table: Table) => {
  const w = world as AdminPlatformWorld;
  const name = uniquifyName(table.rowsHash()['name']);
  const dto: ContentTypeDto = { name };
  const r = await apiFor(w, alias).createContentType(dto);
  record(w, r);
  if (r.ok && typeof r.json.id === 'number') {
    w.apContentTypeId = r.json.id;
    w.apContentTypeName = r.json.name ?? name;
  }
});

Then('the content type ID is stored for cleanup', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  if (isSuccess(w.lastResponse?.status)) {
    expect(w.apContentTypeId, 'content type id must be captured from a 2xx create').toBeDefined();
  }
});

When(
  '{string} updates the stored content type with:',
  async ({ world }, alias: string, _table: Table) => {
    const w = world as AdminPlatformWorld;
    if (w.apContentTypeId == null) {
      synthesizeSkipped(w, 'no stored content type; creation did not succeed');
      return;
    }
    // Re-PUT the stored name: the table's description is off-contract, so the
    // PUT exercises endpoint + status exactly like the BE run did on the wire.
    const dto: ContentTypeDto = { id: w.apContentTypeId, name: w.apContentTypeName };
    record(w, await apiFor(w, alias).updateContentType(w.apContentTypeId, dto));
  },
);

When('{string} deletes the stored content type', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apContentTypeId == null) {
    synthesizeSkipped(w, 'no stored content type; creation did not succeed');
    return;
  }
  record(w, await apiFor(w, alias).deleteContentType(w.apContentTypeId));
  w.apContentTypeId = undefined;
});

// ── ServiceType CRUD ─────────────────────────────────────────────────────────

When('{string} creates service type with:', async ({ world }, alias: string, table: Table) => {
  const w = world as AdminPlatformWorld;
  const rows = table.rowsHash();
  const dto: ServiceTypeDto = {
    name: uniquifyName(rows['name']),
    description: rows['description'],
  };
  const r = await apiFor(w, alias).createServiceType(dto);
  record(w, r);
  if (r.ok && typeof r.json.id === 'number') {
    w.apServiceTypeId = r.json.id;
    w.apServiceTypeCreate = { ...dto, id: r.json.id };
  }
});

Then('the service type ID is stored for cleanup', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  if (isSuccess(w.lastResponse?.status)) {
    expect(w.apServiceTypeId, 'service type id must be captured from a 2xx create').toBeDefined();
  }
});

When(
  '{string} updates the stored service type with:',
  async ({ world }, alias: string, table: Table) => {
    const w = world as AdminPlatformWorld;
    if (w.apServiceTypeId == null) {
      synthesizeSkipped(w, 'no stored service type; creation did not succeed');
      return;
    }
    const dto: ServiceTypeDto = {
      ...(w.apServiceTypeCreate ?? {}),
      ...table.rowsHash(),
      id: w.apServiceTypeId,
    };
    record(w, await apiFor(w, alias).updateServiceType(w.apServiceTypeId, dto));
  },
);

When('{string} deletes the stored service type', async ({ world }, alias: string) => {
  const w = world as AdminPlatformWorld;
  if (w.apServiceTypeId == null) {
    synthesizeSkipped(w, 'no stored service type; creation did not succeed');
    return;
  }
  record(w, await apiFor(w, alias).deleteServiceType(w.apServiceTypeId));
  w.apServiceTypeId = undefined;
});

// ── Consent definitions (admin) ──────────────────────────────────────────────

When(
  '{string} creates consent definition with:',
  async ({ world }, alias: string, table: Table) => {
    const w = world as AdminPlatformWorld;
    const rows = table.rowsHash();
    const dto: ConsentDefinitionDtoIn = {
      consentType: rows['consentType'] ?? '',
      name: rows['name'] ?? '',
      description: rows['description'],
      isActive: rows['isActive'] === 'true',
    };
    const r = await apiFor(w, alias).createConsentDefinition(dto);
    record(w, r);
    if (r.ok && typeof r.json.id === 'number') w.apConsentDefinitionId = r.json.id;
  },
);

When(
  '{string} creates consent definition with consentType exceeding {int} characters',
  async ({ world }, alias: string, limit: number) => {
    const w = world as AdminPlatformWorld;
    const dto: ConsentDefinitionDtoIn = {
      consentType: 'T'.repeat(limit + 1),
      name: 'Too Long Type Test',
      description: `consentType exceeds the ${limit}-character limit`,
      isActive: true,
    };
    record(w, await apiFor(w, alias).createConsentDefinition(dto));
  },
);

Then('the consent definition ID is stored for cleanup', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  if (isSuccess(w.lastResponse?.status)) {
    expect(
      w.apConsentDefinitionId,
      'consent definition id must be captured from a 2xx create',
    ).toBeDefined();
  }
});

When(
  '{string} deletes the stored consent definition if created',
  async ({ world }, alias: string) => {
    const w = world as AdminPlatformWorld;
    if (w.apConsentDefinitionId == null) {
      synthesizeSkipped(w, 'no stored consent definition; creation conflicted');
      return;
    }
    record(w, await apiFor(w, alias).deleteConsentDefinition(w.apConsentDefinitionId));
    w.apConsentDefinitionId = undefined;
  },
);

When(
  '{string} views consent history for target user {string} type {string}',
  async ({ world }, alias: string, target: string, consentType: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).consentHistory(targetUserId(w, target), consentType));
  },
);

When(
  '{string} views consent history for user ID {int} type {string}',
  async ({ world }, alias: string, userId: number, consentType: string) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).consentHistory(userId, consentType));
  },
);

// ── GeoIP impossible-travel probes ───────────────────────────────────────────

When(
  '{string} tests impossible travel detection with:',
  async ({ world }, alias: string, table: Table) => {
    const w = world as AdminPlatformWorld;
    const rows = table.rowsHash();
    record(
      w,
      await apiFor(w, alias).testTravel(
        rows['fromIp'] ?? '',
        rows['toIp'] ?? '',
        Number(rows['minutes'] ?? 0),
      ),
    );
  },
);

When(
  '{string} tests travel from IP {string} to IP {string} with {int} minutes elapsed',
  async ({ world }, alias: string, fromIp: string, toIp: string, minutes: number) => {
    const w = world as AdminPlatformWorld;
    record(w, await apiFor(w, alias).testTravel(fromIp, toIp, minutes));
  },
);

// ── Live-contract adaptations (2026-09-02 integration) ──────────────────────

Then('the response should be a validation error for {string}', async ({ world }, field: string) => {
  const w = world as AdminPlatformWorld;
  expect(w.lastResponse?.status, `expected 400 validation error; body: ${snippet(w)}`).toBe(400);
  const body = JSON.parse(w.lastResponse?.body ?? '{}') as {
    validationErrors?: Record<string, string>;
  };
  expect(
    body.validationErrors?.[field],
    `validationErrors must name "${field}"; body: ${snippet(w)}`,
  ).toBeTruthy();
});

Then('the response should be successful, not found or invalid argument', async ({ world }) => {
  const w = world as AdminPlatformWorld;
  const status = w.lastResponse?.status ?? 0;
  const ok = (status >= 200 && status < 300) || status === 404 || status === 400;
  expect(ok, `expected 2xx, 404 or 400, got ${status}; body: ${snippet(w)}`).toBe(true);
});

Then(
  'the response should be successful, not found or session refresh required',
  async ({ world }) => {
    const w = world as AdminPlatformWorld;
    const status = w.lastResponse?.status ?? 0;
    const ok = (status >= 200 && status < 300) || status === 404 || status === 419;
    expect(ok, `expected 2xx, 404 or 419, got ${status}; body: ${snippet(w)}`).toBe(true);
  },
);
