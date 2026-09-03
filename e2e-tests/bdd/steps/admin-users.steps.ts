import { ACTORS } from '../../_framework/actor';
import type { ApiResult } from '../../_framework/api/http-client';
import {
  AdminUsersApi,
  captureSessionToken,
  probeWithStoredToken,
  type SessionCookieSnapshot,
  type SnapshotRequestFactory,
} from '../../_framework/api/admin-users.api';
import { TestSession, type PlaywrightRequestFactory } from '../../_framework/api/test-session';
import { After, Given, Then, When, expect, test } from './fixtures';

import { AccountStatus } from '../../../src/app/api/model/account-status';
import { UserType } from '../../../src/app/api/model/user-type';
import type { PageUserDtoOut } from '../../../src/app/api/model/page-user-dto-out';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';

/**
 * Admin user-management oracle — Layer 2 (functional), for the two BE admin
 * features (admin-user-management + admin/admin-inactive-flow-consolidated),
 * driven THROUGH the Layer-1 AdminUsersApi against the LIVE BE, mirroring the
 * BE glue (AdminUserManagementSteps.java + AdvancedSessionSecuritySteps.java +
 * AdminStatusFlowSteps.java + the refresh soft-asserts in ProfileUpdateSteps).
 *
 * One mock-session ADMIN (fixture admin1 — never mutated) operates on
 * DISPOSABLE unique-email targets provisioned per scenario, so the repeated
 * tokenVersion bumps (ban/unban/INACTIVE cycles) never touch the shared
 * fixture actors the other oracles depend on. "Stored tokens" are
 * storageState() snapshots of an actor's HttpOnly cookie jar, replayed from
 * throwaway request contexts (the FE analogue of the BE's raw-cookie map).
 *
 * Divergences from the BE source (all documented in the feature headers):
 *   - real-Firebase / OAuth / 2FA logins collapse to mock-session;
 *   - "refreshes their session token" re-seeds a fresh mock-session (the real
 *     /auth/refresh-session success path needs a Firebase-minted session);
 *   - stored-token probes accept the {401,419} stale/blocked class (the BE's
 *     exact 401-vs-419 split is a real-JWT distinction; the integration tier
 *     documented the mapping drift for mock-session cookies).
 *
 * Soft assertions are Playwright expect.soft — failures accumulate and fail
 * the scenario at teardown, exactly like the BE SoftAssertionContext; the
 * "all soft assertions should pass" flush marker lives in profile.steps.ts.
 *
 * State lives on a local World view (cast pattern — fixtures.ts untouched)
 * under adminUm*-prefixed keys so the other oracles' hooks ignore it; only
 * `lastResponse` is shared, feeding the canonical "the response status should
 * be {int}" step from partnership.steps.ts.
 */

interface AdminTarget {
  session: TestSession;
  userId: number;
  email: string;
  role: 'COMPANY' | 'INFLUENCER';
}

interface AdminUsersWorld {
  /** The single admin session (BE: one Firebase+2FA login for all operations). */
  adminUmAdmin?: TestSession;
  /** alias -> disposable target (session + numeric BE id + seed email). */
  adminUmTargets?: Record<string, AdminTarget>;
  /** token name -> frozen cookie-jar snapshot. */
  adminUmTokens?: Record<string, SessionCookieSnapshot>;
  /** alias -> outcome of that actor's last refresh / re-seed. */
  adminUmRefreshResults?: Record<string, ApiResult<unknown>>;
  /** The alias that performed the most recent refresh step. */
  adminUmLastActor?: string;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

/**
 * The BE distinguishes 401 (INACTIVE account cannot authenticate) from 419
 * (stale tokenVersion) for real JWT sessions; under the mock-session collapse
 * both are one stale/blocked-session class (drift documented live in
 * e2e-tests/integration/flows/admin-inactive-flow.spec.ts).
 */
const STALE_OR_BLOCKED = [401, 419];

// ── Helpers ──────────────────────────────────────────────────────────────────

function record(w: AdminUsersWorld, r: ApiResult<unknown>): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function requireAdmin(w: AdminUsersWorld): TestSession {
  if (!w.adminUmAdmin) throw new Error('no admin session — did the administrator Given run?');
  return w.adminUmAdmin;
}

function adminApi(w: AdminUsersWorld): AdminUsersApi {
  return new AdminUsersApi(requireAdmin(w).api);
}

function requireTarget(w: AdminUsersWorld, alias: string): AdminTarget {
  const target = w.adminUmTargets?.[alias];
  if (!target) throw new Error(`unknown target "${alias}" — did its provisioning Given run?`);
  return target;
}

function guardAccountStatus(name: string): AccountStatus {
  expect(Object.values(AccountStatus), `"${name}" is not an AccountStatus member`).toContain(name);
  return name as AccountStatus;
}

function parseLastBody<T>(w: AdminUsersWorld): T {
  const body = w.lastResponse?.body;
  if (!body) throw new Error('no recorded response body — did the When step run?');
  return JSON.parse(body) as T;
}

function parseJson(body: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Unique per-run e2e email — disposable rows keep the fixture actors untouched. */
function uniqueEmail(alias: string, role: string): string {
  const safe = `${alias}-${role}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `bdd-aum-${safe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

/** Idempotent per-alias provisioning (mirrors the BE's idempotent Firestore sync). */
async function provisionTarget(
  w: AdminUsersWorld,
  playwright: PlaywrightRequestFactory,
  alias: string,
  role: string,
): Promise<AdminTarget> {
  if (role !== 'COMPANY' && role !== 'INFLUENCER') {
    throw new Error(`unsupported disposable target role "${role}"`);
  }
  const existing = w.adminUmTargets?.[alias];
  if (existing) {
    if (existing.role !== role) {
      throw new Error(`alias "${alias}" already provisioned as ${existing.role}, not ${role}`);
    }
    return existing;
  }
  const email = uniqueEmail(alias, role);
  const session = await TestSession.open(playwright, { id: alias, email, role });
  const userId = await session.userId();
  const target: AdminTarget = { session, userId, email, role };
  (w.adminUmTargets ??= {})[alias] = target;
  return target;
}

/** PATCH /users/{id} { accountStatus } — the one wire call behind ban/unban/set-status. */
async function setStatus(
  w: AdminUsersWorld,
  alias: string,
  statusName: string,
): Promise<ApiResult<UserDtoOut>> {
  const status = guardAccountStatus(statusName);
  const target = requireTarget(w, alias);
  const r = await adminApi(w).setAccountStatus(target.userId, status);
  record(w, r);
  return r;
}

/** Shared body of the stored-token probe steps (long + short BE forms). */
async function probeStoredToken(
  w: AdminUsersWorld,
  playwright: SnapshotRequestFactory,
  alias: string,
  tokenName: string,
  path: string,
  expected: number,
): Promise<void> {
  const snapshot = w.adminUmTokens?.[tokenName];
  if (!snapshot) throw new Error(`unknown stored token "${tokenName}" for "${alias}"`);
  const r = await probeWithStoredToken(playwright, snapshot, path);
  if (STALE_OR_BLOCKED.includes(expected)) {
    // ADAPTATION: BE source pins the exact code; the collapse accepts the class.
    expect
      .soft(
        STALE_OR_BLOCKED,
        `"${alias}" stored token "${tokenName}" GET ${path} — BE source expects ${expected}, ` +
          `mock-session collapse accepts {401,419}; got ${r.status}; body: ${r.body.slice(0, 200)}`,
      )
      .toContain(r.status);
  } else {
    expect
      .soft(
        r.status,
        `"${alias}" stored token "${tokenName}" GET ${path}; body: ${r.body.slice(0, 200)}`,
      )
      .toBe(expected);
  }
}

// Cleanup: dispose every session this oracle opened. The disposable rows may
// be left non-ACTIVE when a scenario dies mid-cycle — harmless, they are
// unique-email throwaways with FREE_ACTIVE subscriptions (no boot-guard risk).
After(async ({ world }) => {
  const w = world as AdminUsersWorld;
  for (const target of Object.values(w.adminUmTargets ?? {})) {
    await target.session.dispose().catch(() => undefined);
  }
  await w.adminUmAdmin?.dispose().catch(() => undefined);
});

// ── Actor seeding (mock-session collapse of the BE login variants) ───────────

Given(
  '{string} is signed in as the administrator',
  async ({ playwright, world }, _alias: string) => {
    // BE: real ADMIN password login + KMS-TOTP 2FA. Collapses to mock-session
    // partial:false (full session, TOTP bypassed) — the 2FA upgrade path has its
    // own oracle (admin-2fa-kms.feature). The fixture admin is never mutated.
    const w = world as AdminUsersWorld;
    w.adminUmAdmin = await TestSession.open(playwright, ACTORS['admin1']);
  },
);

Given('the administrator session uses the real admin account', async ({ playwright, world }) => {
  // Firebase-backed lookups (/twofactor/status) 401 "account not found"
  // for a minted mock uid, and the REAL uid cannot be reconciled onto
  // admin1@e2e.test (unique constraint — it already keys the real admin's
  // row). Scenarios that read Firebase-backed state swap the alias to a
  // session on the REAL admin account instead. Env-gated like every
  // real-credentials oracle.
  const email = process.env['FIREBASE_TEST_ADMIN_EMAIL'];
  const uid = process.env['ADMIN_FIREBASE_UID'];
  test.skip(!email || !uid, 'FIREBASE_TEST_ADMIN_EMAIL / ADMIN_FIREBASE_UID not set');
  const w = world as AdminUsersWorld;
  await w.adminUmAdmin?.dispose();
  w.adminUmAdmin = await TestSession.open(playwright, {
    id: 'admin-real',
    email: email!,
    role: 'ADMIN',
    firebaseUid: uid!,
  });
});

Then('the administrator session is authenticated', async ({ world }) => {
  // FE-visible half of the BE's '"Admin" should be authenticated'.
  const w = world as AdminUsersWorld;
  const r = await requireAdmin(w).api.get<UserDtoOut>('/users/me');
  expect(r.status, `admin GET /users/me; body: ${r.body.slice(0, 200)}`).toBe(200);
  expect(r.json.userType?.value, 'authenticated role must be ADMIN').toBe(UserType.ADMIN);
});

Then('the administrator session has admin-only access', async ({ world }) => {
  // FE-visible consequence of the BE's '"Admin" should have 2FA verified': a
  // partial (2FA-pending) session is rejected on ADMIN-only endpoints, so a
  // 200 from /users/paged is exactly what a verified session buys.
  const w = world as AdminUsersWorld;
  const r = await adminApi(w).listUsersPaged(0, 1);
  expect(r.status, `ADMIN-only GET /users/paged; body: ${r.body.slice(0, 200)}`).toBe(200);
});

Given(
  'the target user {string} is provisioned as a disposable {word} user',
  async ({ playwright, world }, alias: string, role: string) => {
    // BE: uid-keyed /test/auth/sync-user-from-firestore on a REAL prod-account
    // UID. FE: disposable mock-session row — same observable outcome (a PG row
    // the admin can view and PATCH by numeric id).
    await provisionTarget(world as AdminUsersWorld, playwright, alias, role);
  },
);

Given(
  'the target user {string} is provisioned and has status {string} and role {string}',
  async ({ playwright, world }, alias: string, statusName: string, roleName: string) => {
    // BE: force-firebase-claims + Firestore sync + admin PATCH {status, role}.
    // FE: role is fixed at provisioning (contract-guarded), status pinned via
    // the same admin PATCH the ban/unban steps use.
    const w = world as AdminUsersWorld;
    expect(Object.values(UserType), `"${roleName}" is not a UserType member`).toContain(roleName);
    const status = guardAccountStatus(statusName);
    const target = await provisionTarget(w, playwright, alias, roleName);
    const r = await adminApi(w).setAccountStatus(target.userId, status);
    expect(
      r.ok,
      `pin "${alias}" accountStatus=${statusName}: HTTP ${r.status} ${r.body.slice(0, 200)}`,
    ).toBeTruthy();
  },
);

Given(
  '{string} is provisioned as a disposable {word} target',
  async ({ playwright, world }, alias: string, role: string) => {
    // BE: '"company1" logs in as COMPANY with Firebase UID/email/password' and
    // '"influencer1" logs in as INFLUENCER via OAuth' — both collapse to a
    // disposable mock-session (see the feature header for why OAuth collapse
    // is sound for status/tokenVersion semantics).
    await provisionTarget(world as AdminUsersWorld, playwright, alias, role);
  },
);

// ── User listing & profile viewing ───────────────────────────────────────────

When('the admin views the user list', async ({ world }) => {
  const w = world as AdminUsersWorld;
  record(w, await adminApi(w).listUsersPaged(0, 20));
});

Then('the response should contain a list of users', async ({ world }) => {
  const page = parseLastBody<PageUserDtoOut>(world as AdminUsersWorld);
  expect(Array.isArray(page.content), 'Spring page "content" must be an array of users').toBe(true);
});

Then('the response should contain pagination info', async ({ world }) => {
  const page = parseLastBody<PageUserDtoOut & Record<string, unknown>>(world as AdminUsersWorld);
  for (const field of ['totalElements', 'totalPages', 'size', 'number'] as const) {
    expect(page[field], `pagination field "${field}" must be present`).toBeDefined();
  }
});

When('the admin views user {string} profile', async ({ world }, alias: string) => {
  const w = world as AdminUsersWorld;
  record(w, await adminApi(w).getUser(requireTarget(w, alias).userId));
});

Then("the response should contain the user's email", async ({ world }) => {
  const user = parseLastBody<UserDtoOut>(world as AdminUsersWorld);
  expect(user.email, 'admin profile view must expose the email').toBeTruthy();
});

Then("the response should contain the user's account status", async ({ world }) => {
  const user = parseLastBody<UserDtoOut>(world as AdminUsersWorld);
  // Free tightening over the BE's not-null check: the value must also be a
  // generated AccountStatus member, so enum drift breaks the oracle.
  expect(
    Object.values(AccountStatus),
    `accountStatus.value must be a generated AccountStatus member (got "${user.accountStatus?.value}")`,
  ).toContain(user.accountStatus?.value);
});

// ── Ban / unban / set-status ("the admin …" forms, admin-user-management) ────
// These record the response and let the feature's explicit "the response
// status should be {int}" lines assert it — mirroring AdminUserManagementSteps
// which captures errors instead of throwing.

When(
  'the admin bans user {string} with reason {string}',
  async ({ world }, alias: string, _reason: string) => {
    // The reason is client-side context only — logged, never stored (BE glue parity).
    await setStatus(world as AdminUsersWorld, alias, AccountStatus.BANNED);
  },
);

When('the admin unbans user {string}', async ({ world }, alias: string) => {
  await setStatus(world as AdminUsersWorld, alias, AccountStatus.ACTIVE);
});

When(
  'the admin sets user {string} status to {string}',
  async ({ world }, alias: string, statusName: string) => {
    await setStatus(world as AdminUsersWorld, alias, statusName);
  },
);

Then(
  'the user {string} should have status {string}',
  async ({ world }, alias: string, statusName: string) => {
    const w = world as AdminUsersWorld;
    const status = guardAccountStatus(statusName);
    const r = await adminApi(w).getUser(requireTarget(w, alias).userId);
    expect(r.ok, `GET /users/{id} for "${alias}": HTTP ${r.status}`).toBeTruthy();
    expect(r.json.accountStatus?.value, `"${alias}" accountStatus.value`).toBe(status);
  },
);

// ── Ban / unban / set-status ({string}-actor forms, admin-inactive-flow) ─────
// These hard-assert success inside the step — mirroring
// AdvancedSessionSecuritySteps, which throws on a non-2xx (the inactive-flow
// feature has no status-assert lines after these Whens).

When(
  '{string} sets user {string} status to {string}',
  async ({ world }, _adminAlias: string, alias: string, statusName: string) => {
    const r = await setStatus(world as AdminUsersWorld, alias, statusName);
    expect(
      r.ok,
      `admin set "${alias}" status=${statusName}: HTTP ${r.status} ${r.body.slice(0, 200)}`,
    ).toBeTruthy();
  },
);

When(
  '{string} bans user {string} with reason {string}',
  async ({ world }, _adminAlias: string, alias: string, _reason: string) => {
    const r = await setStatus(world as AdminUsersWorld, alias, AccountStatus.BANNED);
    expect(r.ok, `ban "${alias}": HTTP ${r.status} ${r.body.slice(0, 200)}`).toBeTruthy();
  },
);

When('{string} unbans user {string}', async ({ world }, _adminAlias: string, alias: string) => {
  const r = await setStatus(world as AdminUsersWorld, alias, AccountStatus.ACTIVE);
  expect(r.ok, `unban "${alias}": HTTP ${r.status} ${r.body.slice(0, 200)}`).toBeTruthy();
});

// ── Stored tokens ─────────────────────────────────────────────────────────────

Given(
  '{string} stores their current token as {string}',
  async ({ world }, alias: string, tokenName: string) => {
    const w = world as AdminUsersWorld;
    (w.adminUmTokens ??= {})[tokenName] = await captureSessionToken(
      requireTarget(w, alias).session,
    );
  },
);

Then(
  'soft assert {string} using stored token {string} calling {string} returns {int}',
  async (
    { playwright, world },
    alias: string,
    tokenName: string,
    path: string,
    expected: number,
  ) => {
    await probeStoredToken(world as AdminUsersWorld, playwright, alias, tokenName, path, expected);
  },
);

Then(
  'soft assert {string} using {string} returns {int}',
  async ({ playwright, world }, alias: string, tokenName: string, expected: number) => {
    // BE short form (AdminStatusFlowSteps) defaults the path to /users/me.
    await probeStoredToken(
      world as AdminUsersWorld,
      playwright,
      alias,
      tokenName,
      '/users/me',
      expected,
    );
  },
);

// ── Session refresh ───────────────────────────────────────────────────────────

When('{string} attempts to refresh their session token', async ({ world }, alias: string) => {
  // Failure-path probe: POST /auth/refresh-session with the CURRENT cookie jar.
  // The disabled-account rejection is a pure PG read on the BE — fully
  // exercisable with mock-session actors.
  const w = world as AdminUsersWorld;
  const r = await new AdminUsersApi(requireTarget(w, alias).session.api).attemptSessionRefresh();
  (w.adminUmRefreshResults ??= {})[alias] = r;
  w.adminUmLastActor = alias;
  record(w, r);
});

When('{string} refreshes their session token', async ({ playwright, world }, alias: string) => {
  // ADAPTATION (feature header): the real refresh success path needs a
  // Firebase-minted session (mock UIDs hit USER_NOT_FOUND), so the collapse
  // re-seeds a fresh mock-session for the SAME email — same post-condition:
  // a NEW valid cookie pair at the current tokenVersion; old snapshots stay dead.
  const w = world as AdminUsersWorld;
  const target = requireTarget(w, alias);
  const fresh = await TestSession.open(playwright, {
    id: alias,
    email: target.email,
    role: target.role,
  });
  await target.session.dispose().catch(() => undefined);
  target.session = fresh;
  const probe = await fresh.api.get('/users/me');
  (w.adminUmRefreshResults ??= {})[alias] = probe;
  w.adminUmLastActor = alias;
  record(w, probe);
});

Then('soft assert refresh succeeds', async ({ world }) => {
  const w = world as AdminUsersWorld;
  const alias = w.adminUmLastActor;
  const r = alias ? w.adminUmRefreshResults?.[alias] : undefined;
  expect
    .soft(
      r?.ok,
      `session re-establishment for "${alias ?? '(none)'}" should succeed ` +
        `(HTTP ${r?.status ?? 'n/a'}; body: ${(r?.body ?? '').slice(0, 200)})`,
    )
    .toBeTruthy();
});

Then(
  'soft assert {string} refresh fails with {string}',
  async ({ world }, alias: string, messageKey: string) => {
    const w = world as AdminUsersWorld;
    const r = w.adminUmRefreshResults?.[alias];
    if (!r) throw new Error(`no refresh attempt recorded for "${alias}"`);
    // Status class exactly as the BE glue asserts (401/403/419). The live BE
    // loses the messageKey at the Spring Security auth-failure boundary, so it
    // is asserted opportunistically WHEN present — messageKey only, never
    // localized message text.
    expect
      .soft(
        [401, 403, 419],
        `"${alias}" refresh should be rejected (${messageKey}); got ${r.status}; ` +
          `body: ${r.body.slice(0, 200)}`,
      )
      .toContain(r.status);
    const bodyKey = parseJson(r.body)?.['messageKey'];
    if (typeof bodyKey === 'string') {
      expect.soft(bodyKey, `"${alias}" refresh rejection messageKey`).toBe(messageKey);
    }
  },
);

// ── Soft session/status assertions (AdminStatusFlowSteps parity) ─────────────

Then(
  'soft assert {string} can access {string} with status {int}',
  async ({ world }, alias: string, path: string, expected: number) => {
    const w = world as AdminUsersWorld;
    const r = await requireTarget(w, alias).session.api.get(path);
    expect.soft(r.status, `"${alias}" GET ${path}; body: ${r.body.slice(0, 200)}`).toBe(expected);
  },
);

Then(
  'soft assert {string} accountStatus is {string}',
  async ({ world }, alias: string, statusName: string) => {
    const w = world as AdminUsersWorld;
    const status = guardAccountStatus(statusName);
    const r = await requireTarget(w, alias).session.api.get<UserDtoOut>('/users/me');
    expect.soft(r.ok, `"${alias}" GET /users/me: HTTP ${r.status}`).toBeTruthy();
    expect.soft(r.json.accountStatus?.value, `"${alias}" accountStatus.value`).toBe(status);
  },
);

// ── Gate for the real-Firebase refresh contract ──────────────────────────────

Given('the real-Firebase session refresh path is exercisable on this stack', async () => {
  test.skip(
    true,
    'POST /auth/refresh-session success requires a session minted from a REAL Firebase ' +
      'idToken — mock-session UIDs hit Firebase USER_NOT_FOUND inside ' +
      'createRefreshedSession (investigation: e2e-tests/integration/flows/' +
      'admin-inactive-flow.spec.ts). Unlock: real-credentials sign-in ' +
      '(login.steps.ts real-credentials gate) + ActorProfile.firebaseUid pinning.',
  );
});

Given('the administrator session uses the mock admin again', async ({ playwright, world }) => {
  // Counterpart of the real-admin swap: later steps in the same scenario hit
  // tokenVersion-guarded admin endpoints that 419 on the real account's
  // mock-minted JWT. The fixture admin has no such drift.
  const w = world as AdminUsersWorld;
  await w.adminUmAdmin?.dispose();
  w.adminUmAdmin = await TestSession.open(playwright, ACTORS['admin1']);
});
