import { ACTORS } from '../../_framework/actor';
import type { ApiResult } from '../../_framework/api/http-client';
import {
  StepUpApi,
  openMockSession,
  seedMockSession,
  type MockSessionActor,
  type MockSessionRole,
} from '../../_framework/api/step-up.api';
import { TestSession } from '../../_framework/api/test-session';
import {
  TotpSecretMissingError,
  isBridgeAvailable,
  readTotpSecret,
  seedTotpSecret,
} from '../../_framework/firebase-admin-bridge';
import { clearInbox, extractSixDigitCode, listInbox } from '../../_framework/test-email';
import { ADMIN_TEST_TOTP_SECRET, currentTotpCode } from '../../_framework/totp';
import { BE_URL } from '../../integration/_actor';
import { After, Given, Then, When, expect, test } from './fixtures';

import { StepUpActionType } from '../../../src/app/api/model/step-up-action-type';
import { StepUpChallengeType } from '../../../src/app/api/model/step-up-challenge-type';
import type { StepUpCheckResponse } from '../../../src/app/api/model/step-up-check-response';
import type { StepUpTokenResponse } from '../../../src/app/api/model/step-up-token-response';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';

/**
 * Step-up authentication oracle — Layer 2 (step-up-auth.feature), driven
 * THROUGH the Layer-1 StepUpApi against the LIVE BE, mirroring the BE glue
 * (StepUpAuthSteps.java): check → request code → GreenMail capture → verify →
 * one-time token → PATCH /users/{id} email with X-Step-Up-Token.
 *
 * Actor model (multi-actor, name-keyed like the BE ActorRegistry):
 *   - company1 / influencer1 / pendingAdmin1 → FRESH throwaway mock-session
 *     users per scenario (email-changing steps must not leak into the shared
 *     fixed actors on the persistent dev DB — the same containment the
 *     integration tier uses in step-up-email-required.spec.ts).
 *   - admin1 → the FIXED shared admin actor: a stable firebaseUid means the
 *     Firestore totpSecrets/{uid} doc seeded for the TOTP scenario is reused
 *     across runs instead of accumulating.
 *   All uid-keyed staging (set-initial-setup / set-email-verified / TOTP
 *   provisioning) runs on the firebaseUid CAPTURED from the mock-session
 *   response at seed time, so the oracle is deterministic on a fresh dev DB
 *   (the concern behind ActorProfile.firebaseUid).
 *
 * GreenMail is read over HTTP (TestEmailController /api/test/email, origin
 * BE_URL — the fixtures Before hook only guarantees the BE, not the FE dev
 * server). The "requests step-up code" step purges the inbox first, exactly
 * like the BE glue's greenMail.reset().
 *
 * Soft assertions are Playwright expect.soft (≙ BE SoftAssertionContext);
 * "soft assert update status is {int}" and "all soft assertions should pass"
 * are REUSED from profile.steps.ts via the shared world.lastResponse key.
 *
 * State lives on a local World view (cast pattern — fixtures.ts untouched)
 * under stepUp*-prefixed keys so the other oracles' After hooks ignore it.
 */

interface StepUpWorld {
  /** name → seeded mock-session actor (BE ActorRegistry analogue). */
  stepUpActors?: Record<string, MockSessionActor>;
  /** Name of the actor whose GreenMail inbox the email steps read. */
  stepUpEmailActor?: string;
  /** 6-digit code extracted from the last captured step-up email. */
  stepUpCode?: string;
  /** One-time step-up token from the last successful /step-up/verify. */
  stepUpToken?: string;
  /** Plain TOTP secret backing the admin's Firestore totpSecrets/{uid} doc. */
  stepUpTotpSecret?: string;
  /** email/firstName captured at scenario start, for the admin restore. */
  stepUpOriginal?: { email?: string; firstName?: string };
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function record(w: StepUpWorld, r: ApiResult): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function snippet(w: StepUpWorld): string {
  return (w.lastResponse?.body ?? '(none)').slice(0, 300);
}

function actorOf(w: StepUpWorld, name: string): MockSessionActor {
  const actor = w.stepUpActors?.[name];
  if (!actor) throw new Error(`no session for actor "${name}" — did the sign-in Given run?`);
  return actor;
}

function apiOf(w: StepUpWorld, name: string): StepUpApi {
  return new StepUpApi(actorOf(w, name).session);
}

function requireUid(actor: MockSessionActor): string {
  if (!actor.firebaseUid) throw new Error(`actor ${actor.email} has no captured firebaseUid`);
  return actor.firebaseUid;
}

function requireUserId(actor: MockSessionActor): number {
  if (actor.userId == null) throw new Error(`actor ${actor.email} has no captured userId`);
  return actor.userId;
}

function roleFor(name: string): MockSessionRole {
  const n = name.toLowerCase();
  if (n.startsWith('pendingadmin')) return 'PENDING_ADMIN';
  if (n.startsWith('admin')) return 'ADMIN';
  if (n.startsWith('influencer')) return 'INFLUENCER';
  if (n.startsWith('company')) return 'COMPANY';
  throw new Error(`cannot infer a mock-session role from actor name "${name}"`);
}

function uniqueEmail(name: string): string {
  return `stepup-${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

/** Contract guard: the feature's action type must be a generated enum member. */
function toActionType(value: string): StepUpActionType {
  expect(
    Object.values(StepUpActionType) as string[],
    `"${value}" is not a StepUpActionType member`,
  ).toContain(value);
  return value as StepUpActionType;
}

function parseBody<T>(w: StepUpWorld): T | undefined {
  try {
    return JSON.parse(w.lastResponse?.body ?? '') as T;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Shared flow pieces (used by both the atomic and the composite steps) ─────

async function requestCode(w: StepUpWorld, name: string, action: string): Promise<void> {
  const actor = actorOf(w, name);
  // BE glue calls greenMail.reset() before requesting — purge over HTTP so a
  // stray email from a prior scenario can't surface as a false code match.
  await clearInbox(actor.session.raw, BE_URL);
  w.stepUpEmailActor = name;
  record(w, await apiOf(w, name).requestCode(toActionType(action)));
}

async function waitForEmails(w: StepUpWorld, minCount: number, seconds: number): Promise<void> {
  if (!w.stepUpEmailActor) throw new Error('no step-up code request preceded the GreenMail wait');
  const actor = actorOf(w, w.stepUpEmailActor);
  const deadline = Date.now() + seconds * 1000;
  let count = 0;
  for (;;) {
    count = (await listInbox(actor.session.raw, { to: actor.email, origin: BE_URL })).length;
    if (count >= minCount || Date.now() >= deadline) break;
    await sleep(250);
  }
  expect(
    count,
    `GreenMail should have received at least ${minCount} email(s) within ${seconds}s (to=${actor.email})`,
  ).toBeGreaterThanOrEqual(minCount);
}

async function extractCode(w: StepUpWorld, name: string): Promise<void> {
  const actor = actorOf(w, name);
  const inbox = await listInbox(actor.session.raw, { to: actor.email, origin: BE_URL });
  expect(inbox.length, `GreenMail inbox for ${actor.email} must not be empty`).toBeGreaterThan(0);
  // listInbox returns newest first — [0] is the BE glue's "last received".
  w.stepUpCode = extractSixDigitCode(inbox[0]!.body);
}

async function verifyCode(w: StepUpWorld, name: string, action: string): Promise<void> {
  expect(w.stepUpCode, 'no extracted step-up code — did the GreenMail steps run?').toBeTruthy();
  const r = await apiOf(w, name).verify(toActionType(action), w.stepUpCode!);
  record(w, r);
  // Mirror the BE glue: stash the one-time token only on success.
  if (r.ok && r.json.token) w.stepUpToken = r.json.token;
}

async function patchEmail(
  w: StepUpWorld,
  name: string,
  email: string,
  token?: string,
): Promise<void> {
  const actor = actorOf(w, name);
  record(w, await new StepUpApi(actor.session).patchUserEmail(requireUserId(actor), email, token));
}

After(async ({ world }) => {
  const w = world as StepUpWorld;
  for (const actor of Object.values(w.stepUpActors ?? {})) {
    await actor.session.dispose().catch(() => undefined);
  }
});

// ── Actor seeding (mock-session collapse of the BE Background logins) ────────

Given('{string} is signed in via mock session', async ({ playwright, world }, name: string) => {
  const w = world as StepUpWorld;
  const role = roleFor(name);
  // admin1 = FIXED shared admin (stable uid → stable Firestore TOTP doc);
  // everyone else is a fresh throwaway user (email-state containment).
  const email = role === 'ADMIN' ? ACTORS['admin1'].email : uniqueEmail(name);
  // setupCompleted:true is the deterministic baseline — the BE Background's
  // real accounts are setup-complete; scenarios needing the incomplete state
  // flip it via the explicit initialAccountSetupCompleted step below.
  const actor = await openMockSession(playwright, { email, role, setupCompleted: true });
  (w.stepUpActors ??= {})[name] = actor;
});

Given(
  '{string} logs in as PENDING_ADMIN via mock session',
  async ({ playwright, world }, name: string) => {
    const w = world as StepUpWorld;
    // The BE glue's fixed pending-admin identity (never PATCHes anything).
    const email = 'e2e-pending-admin@test.com';
    const session = await TestSession.openAnonymous(playwright);
    const r = await seedMockSession(session, { email, role: 'PENDING_ADMIN' });
    if (!r.ok) {
      await session.dispose().catch(() => undefined);
      // Integration-tier precedent: some BE profiles reject the role outright.
      test.skip(
        r.status === 400 || r.status === 404,
        `mock-session does not accept the PENDING_ADMIN role in this BE profile (HTTP ${r.status})`,
      );
      throw new Error(
        `mock-session PENDING_ADMIN failed: HTTP ${r.status} ${r.body.slice(0, 160)}`,
      );
    }
    (w.stepUpActors ??= {})[name] = {
      session,
      email,
      role: 'PENDING_ADMIN',
      firebaseUid: r.json.firebaseUid,
      userId: r.json.userId,
    };
  },
);

// ── Profile-state staging (uid-keyed /test hooks, PG-side) ───────────────────

Given(
  '{string} has emailVerified set to {word}',
  async ({ world }, name: string, value: string) => {
    const w = world as StepUpWorld;
    const actor = actorOf(w, name);
    // PG half of the BE glue's toggle only — mock-session uids have no
    // Firebase Auth record, and PG is what the step-up flow reads.
    await new StepUpApi(actor.session).setEmailVerifiedPg(requireUid(actor), value === 'true');
  },
);

Given(
  '{string} has initialAccountSetupCompleted set to {word}',
  async ({ world }, name: string, value: string) => {
    const w = world as StepUpWorld;
    const actor = actorOf(w, name);
    await new StepUpApi(actor.session).setInitialSetup(requireUid(actor), value === 'true');
  },
);

Given('{string} stores their original profile values', async ({ world }, name: string) => {
  const w = world as StepUpWorld;
  const actor = actorOf(w, name);
  const r = await actor.session.api.get<UserDtoOut>('/users/me');
  expect(r.ok, `GET /users/me failed: HTTP ${r.status}`).toBeTruthy();
  w.stepUpOriginal = { email: r.json.email, firstName: r.json.firstName };
});

// ── Step-up flow: check / request / GreenMail / verify ───────────────────────

When(
  '{string} checks step-up requirement for {string}',
  async ({ world }, name: string, action: string) => {
    const w = world as StepUpWorld;
    record(w, await apiOf(w, name).check(toActionType(action)));
  },
);

When(
  '{string} requests step-up code for {string}',
  async ({ world }, name: string, action: string) => {
    await requestCode(world as StepUpWorld, name, action);
  },
);

// Regex form: the literal "email(s)" would need cucumber-expression escaping.
Then(
  /^GreenMail should have received at least (\d+) email\(s\) within (\d+) seconds$/,
  async ({ world }, minCount: string, seconds: string) => {
    await waitForEmails(world as StepUpWorld, Number(minCount), Number(seconds));
  },
);

Then(
  '{string} extracts the 6-digit code from the last GreenMail email',
  async ({ world }, name: string) => {
    await extractCode(world as StepUpWorld, name);
  },
);

When(
  '{string} verifies step-up code for {string}',
  async ({ world }, name: string, action: string) => {
    await verifyCode(world as StepUpWorld, name, action);
  },
);

When(
  '{string} submits wrong step-up code {string} for {string}',
  async ({ world }, name: string, wrongCode: string, action: string) => {
    const w = world as StepUpWorld;
    record(w, await apiOf(w, name).verify(toActionType(action), wrongCode));
  },
);

When(
  '{string} completes full step-up flow for {string}',
  async ({ world }, name: string, action: string) => {
    const w = world as StepUpWorld;
    // Mirrors the BE composite: request → GreenMail wait (5s) → extract → verify.
    await requestCode(w, name, action);
    await waitForEmails(w, 1, 5);
    await extractCode(w, name);
    await verifyCode(w, name, action);
  },
);

// ── Admin TOTP challenge ─────────────────────────────────────────────────────

Given('{string} has a KMS-provisioned TOTP secret for step-up', async ({ world }, name: string) => {
  const w = world as StepUpWorld;
  test.skip(
    !isBridgeAvailable(),
    'Firebase Admin bridge unavailable (service-account.json / KMS) — see e2e-tests/.env.example',
  );
  const uid = requireUid(actorOf(w, name));
  // Read-first so an already-provisioned secret (e.g. the real admin's
  // totpSecrets doc) is NEVER clobbered; seed the well-known test vector only
  // when the doc is missing — the same KMS ENCRYPT round-trip the
  // provisioning script and the admin-2fa-kms oracle use.
  try {
    w.stepUpTotpSecret = await readTotpSecret(uid);
  } catch (err) {
    if (!(err instanceof TotpSecretMissingError)) throw err;
    await seedTotpSecret(uid, ADMIN_TEST_TOTP_SECRET);
    w.stepUpTotpSecret = ADMIN_TEST_TOTP_SECRET;
  }
});

When('{string} verifies step-up with TOTP code', async ({ world }, name: string) => {
  const w = world as StepUpWorld;
  expect(w.stepUpTotpSecret, 'no TOTP secret — did the KMS-provision Given run?').toBeTruthy();
  // BE glue pins actionType EMAIL_CHANGE for the TOTP path; generate the code
  // for the CURRENT 30s window (any earlier one may have rolled over).
  const r = await apiOf(w, name).verify(
    StepUpActionType.EMAIL_CHANGE,
    currentTotpCode(w.stepUpTotpSecret!),
  );
  record(w, r);
  if (r.ok && r.json.token) w.stepUpToken = r.json.token;
});

// ── The step-up-protected operation: email PATCH ─────────────────────────────

When(
  '{string} updates their email to {string} with step-up token',
  async ({ world }, name: string, email: string) => {
    const w = world as StepUpWorld;
    expect(w.stepUpToken, 'no step-up token — did the verify step succeed?').toBeTruthy();
    await patchEmail(w, name, email, w.stepUpToken!);
  },
);

When(
  '{string} updates their email to {string} without step-up token',
  async ({ world }, name: string, email: string) => {
    await patchEmail(world as StepUpWorld, name, email);
  },
);

When('{string} updates their email to {string}', async ({ world }, name: string, email: string) => {
  await patchEmail(world as StepUpWorld, name, email);
});

When(
  '{string} updates their firstName to {string}',
  async ({ world }, name: string, value: string) => {
    const w = world as StepUpWorld;
    const actor = actorOf(w, name);
    record(
      w,
      await new StepUpApi(actor.session).patchUser(requireUserId(actor), { firstName: value }),
    );
  },
);

// ── Session refresh + admin cleanup ──────────────────────────────────────────

When('{string} re-authenticates', async ({ world }, name: string) => {
  const w = world as StepUpWorld;
  const actor = actorOf(w, name);
  // The BE's fresh password login collapses to re-seeding the mock session on
  // the SAME cookie jar: the BE reissues cookies carrying the current
  // tokenVersion (setupCompleted omitted → tri-state leaves the flag alone).
  const r = await seedMockSession(actor.session, { email: actor.email, role: actor.role });
  expect(
    r.ok,
    `re-authenticate mock-session: HTTP ${r.status} ${r.body.slice(0, 160)}`,
  ).toBeTruthy();
});

When(
  '{string} restores user {string} email to original value',
  async ({ world }, adminName: string, targetName: string) => {
    // Deliberate no-op (adaptation): the BE glue restores via
    // /test/auth/update-firebase-user + /test/auth/sync-user-from-firestore,
    // which need the target uid to exist in the REAL Firebase project. This
    // port's edited actors are per-scenario throwaway mock-session users —
    // nothing shared needs restoring, and on the 502 Firebase-noise path the
    // BE rolls the PG email change back anyway. Sanity: both actors exist.
    const w = world as StepUpWorld;
    actorOf(w, adminName);
    actorOf(w, targetName);
  },
);

When(
  '{string} updates user {string} firstName to original value',
  async ({ world }, adminName: string, targetName: string) => {
    const w = world as StepUpWorld;
    const admin = actorOf(w, adminName);
    const target = actorOf(w, targetName);
    if (!w.stepUpOriginal) {
      throw new Error('no stored original profile values — did the stores-original Given run?');
    }
    // Fresh mock-session users are created without names — nothing to restore
    // on the first run against a clean dev DB (profile.steps.ts precedent).
    if (!w.stepUpOriginal.firstName) return;
    const r = await new StepUpApi(admin.session).patchUser(requireUserId(target), {
      firstName: w.stepUpOriginal.firstName,
    });
    record(w, r);
    expect(r.ok, `admin firstName restore failed: HTTP ${r.status} ${snippet(w)}`).toBeTruthy();
  },
);

// ── Soft assertions (Playwright expect.soft ≙ BE SoftAssertionContext) ───────
// "soft assert update status is {int}" + "all soft assertions should pass"
// come from profile.steps.ts (shared world.lastResponse) — not redefined here.

Then('soft assert step-up status is {int}', async ({ world }, expected: number) => {
  const w = world as StepUpWorld;
  expect
    .soft(w.lastResponse?.status, `step-up status; response body: ${snippet(w)}`)
    .toBe(expected);
});

Then('soft assert step-up challengeType is {string}', async ({ world }, expected: string) => {
  const w = world as StepUpWorld;
  // Contract guard: the feature's challenge type must be a generated enum member.
  expect(
    Object.values(StepUpChallengeType) as string[],
    `"${expected}" is not a StepUpChallengeType member`,
  ).toContain(expected);
  const body = parseBody<StepUpCheckResponse>(w);
  expect
    .soft(body?.challengeType, `challengeType; response body: ${snippet(w)}`)
    .toBe(expected as StepUpChallengeType);
});

Then('soft assert step-up required is {word}', async ({ world }, expected: string) => {
  const w = world as StepUpWorld;
  const body = parseBody<StepUpCheckResponse>(w);
  expect
    .soft(body?.required === true, `step-up required; response body: ${snippet(w)}`)
    .toBe(expected === 'true');
});

Then('soft assert step-up response contains token', async ({ world }) => {
  const w = world as StepUpWorld;
  const body = parseBody<StepUpTokenResponse>(w);
  expect
    .soft(typeof body?.token, `step-up token present; response body: ${snippet(w)}`)
    .toBe('string');
  expect.soft(body?.success, 'step-up verify success flag').toBe(true);
});

// Adapted from the BE's "soft assert update status is 200" for email PATCHes:
// with mock-session uids the downstream Firebase Auth update can 502 AFTER
// the step-up filter accepted (and consumed) the token — live-verified by
// e2e-tests/integration/flows/step-up-email-required.spec.ts.

Then('soft assert the email update was accepted by the step-up filter', async ({ world }) => {
  const w = world as StepUpWorld;
  const status = w.lastResponse?.status ?? -1;
  expect
    .soft(status, `a valid step-up token must not be rejected (401); body: ${snippet(w)}`)
    .not.toBe(401);
  expect
    .soft(
      [200, 502],
      `email PATCH with a valid token: 200, or 502 Firebase noise for mock-session uids — got ${status}; body: ${snippet(w)}`,
    )
    .toContain(status);
});

Then('soft assert the email update was not blocked by step-up', async ({ world }) => {
  const w = world as StepUpWorld;
  const status = w.lastResponse?.status ?? -1;
  expect
    .soft(
      [401, 403, 412],
      `incomplete-setup email PATCH must not hit a step-up refusal — got ${status}; body: ${snippet(w)}`,
    )
    .not.toContain(status);
  expect
    .soft(
      [200, 502],
      `email PATCH without step-up: 200, or 502 Firebase noise for mock-session uids — got ${status}; body: ${snippet(w)}`,
    )
    .toContain(status);
});
