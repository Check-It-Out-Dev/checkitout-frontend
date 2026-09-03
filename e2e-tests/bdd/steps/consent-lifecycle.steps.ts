import type { ActorRole } from '../../_framework/actor';
import type { ApiResult } from '../../_framework/api/http-client';
import { ConsentApi } from '../../_framework/api/consent.api';
import {
  ConsentLifecycleApi,
  deleteDocumentsAboveVersion,
} from '../../_framework/api/consent-lifecycle.api';
import { TestSession } from '../../_framework/api/test-session';
import { After, expect, Given, Then, When } from './fixtures';

import { AccountStatus } from '../../../src/app/api/model/account-status';
import { LegalDocumentType } from '../../../src/app/api/model/legal-document-type';
import { UserType } from '../../../src/app/api/model/user-type';
import type { ConsentStatusDtoOut } from '../../../src/app/api/model/consent-status-dto-out';

/**
 * Consent-lifecycle oracle — Layer 2 (consent-lifecycle.feature).
 *
 * Mirrors checkitout-backend/.../consent/consent-lifecycle.feature against the
 * LIVE BE. Document/enforcement mechanics ride the `/test/legal` hooks through
 * `ConsentLifecycleApi` (Layer 1); the sessioned user rides ONE TestSession at
 * a time (`world.blockedSession` — the same slot the consent-module oracle
 * uses, so the shared After disposal covers both); enum-valued assertions are
 * guarded against the GENERATED `AccountStatus` / `LegalDocumentType` /
 * `UserType` members so a BE contract change breaks the oracle at compile
 * time (or at the guard, for feature-text drift).
 *
 * Cleanup contract (tagged After, mirrors BE @After("@consent-lifecycle") +
 * RunConsentIT hygiene): delete documents above v2, reset published_at to
 * now, restore enforcement-blocked users to ACTIVE. Enforcement is GLOBAL on
 * the persistent dev DB — a leaked 40-days-ago published_at would poison
 * every later suite. Failures are warned, not thrown (BE parity), so a
 * cleanup hiccup never masks the scenario verdict.
 */

interface LifecycleWorld {
  /** Anonymous staging transport for the /test hooks (shared key with consent.steps). */
  consentAnon?: TestSession;
  /** The CURRENT sessioned user — blocked or not (shared slot with consent.steps). */
  blockedSession?: TestSession;
  blockedEmail?: string;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

type PW = Parameters<typeof TestSession.openAnonymous>[0];

/** ISO_LOCAL_DATE_TIME (no timezone) — LocalDateTime.parse chokes on 'Z'/offsets. */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

function daysAgoIso(days: number): string {
  return isoLocal(new Date(Date.now() - days * 864e5));
}

function record(world: LifecycleWorld, r: ApiResult): void {
  world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function expectOk(r: ApiResult, what: string): void {
  expect(r.ok, `${what} (HTTP ${r.status}: ${r.body.slice(0, 200)})`).toBeTruthy();
}

/** Lazily open the anonymous staging context and bind the lifecycle L1 service to it. */
async function staging(playwright: PW, world: LifecycleWorld): Promise<ConsentLifecycleApi> {
  world.consentAnon ??= await TestSession.openAnonymous(playwright);
  return new ConsentLifecycleApi(world.consentAnon.api);
}

function currentSession(world: LifecycleWorld): TestSession {
  if (!world.blockedSession) {
    throw new Error('no sessioned user — did the "a session exists for ..." step run?');
  }
  return world.blockedSession;
}

/** Contract guard: the feature's role literal must be a generated UserType member. */
function requireRole(role: string): ActorRole {
  expect(Object.values(UserType), `"${role}" is not a UserType member`).toContain(role);
  return role as ActorRole;
}

/** Contract guard: the feature's status literal must be a generated AccountStatus member. */
function requireAccountStatus(status: string): AccountStatus {
  expect(Object.values(AccountStatus), `"${status}" is not an AccountStatus member`).toContain(
    status,
  );
  return status as AccountStatus;
}

/** Fresh mock-session for the user (embeds their CURRENT tokenVersion server-side). */
async function openSessionFor(
  playwright: PW,
  world: LifecycleWorld,
  email: string,
  role: ActorRole,
): Promise<TestSession> {
  await world.blockedSession?.dispose().catch(() => undefined);
  world.blockedSession = await TestSession.open(playwright, { id: email, email, role });
  world.blockedEmail = email;
  return world.blockedSession;
}

// ── Cleanup (mirrors BE @After("@consent-lifecycle") + RunConsentIT afterAll) ──

After({ tags: '@consent-lifecycle' }, async ({ playwright, world }) => {
  // Session disposal is also covered by consent.steps' untagged After; both
  // sides swallow the double-dispose.
  await world.blockedSession?.dispose().catch(() => undefined);
  const s = await TestSession.openAnonymous(playwright).catch(() => null);
  if (!s) return;
  try {
    const hooks = new ConsentLifecycleApi(s.api);
    const failures: string[] = [];
    // 1. Drop the v3 documents full-lifecycle publishes (consent-module preps v2).
    await deleteDocumentsAboveVersion(s.raw, 2).catch(() => failures.push('delete-documents>2'));
    // 2. Grace-period clock back to "just published" (38-day runway, blocks nobody).
    await hooks
      .setAllPublishedAt(isoLocal(new Date()))
      .then((r) => (r.ok ? undefined : failures.push(`set-published-at HTTP ${r.status}`)))
      .catch(() => failures.push('set-published-at'));
    // 3. Hand the next suite a clean pool — global enforcement blocked EVERY
    //    consent-less user in the dev DB, not just this scenario's.
    await hooks
      .restoreEnforcementBlocked()
      .then((r) => (r.ok ? undefined : failures.push(`restore-blocked HTTP ${r.status}`)))
      .catch(() => failures.push('restore-blocked'));
    if (failures.length > 0) {
      // BE parity: cleanup problems are warned, never thrown over the verdict.
      console.warn(`[consent-lifecycle cleanup] ${failures.join(', ')} failed`);
    }
  } finally {
    await s.dispose().catch(() => undefined);
  }
});

// ── User setup ────────────────────────────────────────────────────────────────

Given(
  'a(n) {word} user {string} with consents not accepted',
  async ({ playwright, world }, role: string, email: string) => {
    requireRole(role);
    const api = await staging(playwright, world);
    expectOk(await api.ensureUser(email, role as UserType), `ensure-user ${email}`);
    expectOk(await api.resetConsents(email), `reset-consents ${email}`);
    expectOk(
      await api.setAccountStatus(email, AccountStatus.ACTIVE),
      `set-account-status ACTIVE ${email}`,
    );
  },
);

Given(
  'a(n) {word} user {string} with status {string}',
  async ({ playwright, world }, role: string, email: string, status: string) => {
    requireRole(role);
    const accountStatus = requireAccountStatus(status);
    const api = await staging(playwright, world);
    expectOk(await api.ensureUser(email, role as UserType), `ensure-user ${email}`);
    expectOk(
      await api.setAccountStatus(email, accountStatus),
      `set-account-status ${status} ${email}`,
    );
  },
);

Given(
  'a registered {word} user {string} with all consents accepted',
  async ({ playwright, world }, role: string, email: string) => {
    // Idempotent adaptation of the BE's consent-cookie registration (see the
    // feature header): ensure-user + record-batch through the REAL re-consent
    // surface leaves the same end state on the persistent dev DB every run.
    const actorRole = requireRole(role);
    const api = await staging(playwright, world);
    expectOk(await api.ensureUser(email, role as UserType), `ensure-user ${email}`);
    expectOk(
      await api.setAccountStatus(email, AccountStatus.ACTIVE),
      `set-account-status ACTIVE ${email}`,
    );
    const session = await TestSession.open(playwright, { id: email, email, role: actorRole });
    try {
      const consent = await new ConsentApi(session.api).recordBatchConsent();
      expectOk(consent, `record-batch for ${email}`);
    } finally {
      await session.dispose();
    }
    const status = await api.userConsentStatus(email);
    expectOk(status, `user-consent-status ${email}`);
    expect(status.json.newestConsentsAccepted, `${email} must end consents-accepted`).toBe(true);
  },
);

Given(
  'a session exists for {string} as {word}',
  async ({ playwright, world }, email: string, role: string) => {
    const actorRole = requireRole(role);
    await openSessionFor(playwright, world, email, actorRole);
    // BE glue parity (ConsentLifecycleSteps.sessionExistsForUser): mock-session
    // JWTs claim ACTIVE, but the ConsentEnforcementFilter reads DB/cache — a
    // consents-not-accepted user must sit at BLOCKED for the 403 contract.
    const api = await staging(playwright, world);
    const status = await api.userConsentStatus(email);
    expectOk(status, `user-consent-status ${email}`);
    if (status.json.newestConsentsAccepted === false) {
      expectOk(
        await api.setAccountStatus(email, AccountStatus.BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS),
        `set-account-status BLOCKED ${email}`,
      );
    }
  },
);

// ── Document manipulation ─────────────────────────────────────────────────────

When(
  'all document published_at dates are set to {string} days ago',
  async ({ playwright, world }, daysAgo: string) => {
    const api = await staging(playwright, world);
    expectOk(
      await api.setAllPublishedAt(daysAgoIso(Number(daysAgo))),
      `set-published-at ${daysAgo}d ago`,
    );
  },
);

When(
  'a new version {int} of {string} is published with published_at {string} days ago',
  async ({ playwright, world }, version: number, type: string, daysAgo: string) => {
    // Contract guard: the feature's document type must be a generated enum member.
    expect(
      Object.values(LegalDocumentType),
      `"${type}" is not a LegalDocumentType member`,
    ).toContain(type);
    const api = await staging(playwright, world);
    for (const language of ['pl', 'en']) {
      expectOk(
        await api.publishDocumentVersion(
          type as LegalDocumentType,
          language,
          version,
          daysAgoIso(Number(daysAgo)),
        ),
        `publish ${type} v${version} (${language})`,
      );
    }
  },
);

// ── Enforcement ───────────────────────────────────────────────────────────────

When('consent enforcement is triggered', async ({ playwright, world }) => {
  const api = await staging(playwright, world);
  expectOk(await api.triggerEnforcement(), 'trigger-enforcement');
});

When('user {string} consents are reset', async ({ playwright, world }, email: string) => {
  const api = await staging(playwright, world);
  expectOk(await api.resetConsents(email), `reset-consents ${email}`);
});

// ── Requests as the sessioned user ────────────────────────────────────────────

When('the user sends POST to {string} with empty body', async ({ world }, path: string) => {
  record(world, await currentSession(world).api.post(path, {}));
});

When('the user requests {string}', async ({ world }, path: string) => {
  record(world, await currentSession(world).api.get(path));
});

When('the user records consent for all required documents', async ({ world }) => {
  const r = await new ConsentApi(currentSession(world).api).recordBatchConsent();
  record(world, r);
  expectOk(r, 'record-batch');
});

When(
  'the user {string} refreshes their mock session as {word}',
  async ({ playwright, world }, email: string, role: string) => {
    // BE glue parity (ConsentSteps.refreshMockSession): simply a fresh
    // mock-session — it embeds the user's post-reconsent tokenVersion + status.
    await openSessionFor(playwright, world, email, requireRole(role));
  },
);

// ── Assertions ────────────────────────────────────────────────────────────────

Then(
  'user {string} should have account status {string}',
  async ({ playwright, world }, email: string, expected: string) => {
    const expectedStatus = requireAccountStatus(expected);
    const api = await staging(playwright, world);
    const r = await api.userConsentStatus(email);
    expectOk(r, `user-consent-status ${email}`);
    expect(r.json.accountStatus, `accountStatus of ${email}`).toBe(expectedStatus);
  },
);

Then(
  'GET {string} should return newestConsentsAccepted {word}',
  async ({ world }, path: string, expected: string) => {
    const r = await currentSession(world).api.get<ConsentStatusDtoOut>(path);
    record(world, r);
    // BE glue parity: a 403 for a blocked user is an acceptable "not accepted".
    if (expected === 'false' && r.status === 403) return;
    expectOk(r, `GET ${path}`);
    expect(r.json.newestConsentsAccepted, `body: ${r.body.slice(0, 200)}`).toBe(
      expected === 'true',
    );
  },
);

Then(
  'GET {string} should return daysToAcceptNewTerms approximately {int}',
  async ({ world }, path: string, expected: number) => {
    const r = await currentSession(world).api.get<ConsentStatusDtoOut>(path);
    record(world, r);
    expectOk(r, `GET ${path}`);
    const days = r.json.daysToAcceptNewTerms;
    expect(days, `daysToAcceptNewTerms in ${r.body.slice(0, 200)}`).toBeDefined();
    // BE asserts isBetween(expected-1, expected+1) — day boundaries move under the test.
    expect(days!).toBeGreaterThanOrEqual(expected - 1);
    expect(days!).toBeLessThanOrEqual(expected + 1);
  },
);

Then(
  'the response body field {string} should be {string}',
  async ({ world }, field: string, expected: string) => {
    const raw = world.lastResponse?.body ?? '{}';
    const body = JSON.parse(raw) as Record<string, unknown>;
    let actual = body[field];
    // Enum envelope parity with the BE glue: generated *DtoOut enums arrive as
    // { value, label, ... } (e.g. UserDtoOut.accountStatus: AccountStatusDtoOut).
    if (actual !== null && typeof actual === 'object' && 'value' in actual) {
      actual = (actual as { value?: unknown }).value;
    }
    if (field === 'accountStatus') {
      requireAccountStatus(expected); // contract guard on the expected literal
    }
    expect(String(actual), `field "${field}" in ${raw.slice(0, 300)}`).toBe(expected);
  },
);
