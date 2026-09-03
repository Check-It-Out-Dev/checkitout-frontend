import type { APIRequestContext } from '@playwright/test';
import { AuthFlowsApi } from '../../_framework/api/auth-flows.api';
import { NotificationsApi } from '../../_framework/api/notifications.api';
import { TestSession } from '../../_framework/api/test-session';
import { ACTORS } from '../../_framework/actor';
import { After, Given, Then, When, expect } from './fixtures';

/**
 * Influencer verification+password oracle — Layer 2
 * (influencer-verification-password.feature).
 *
 * The influencer's session comes from the OAuth simulation (real Firestore
 * Instagram token, server-side KMS decrypt) on an isolated context; the reset
 * hook flips the account to IN_VALIDATION/unverified; the verification email
 * really travels BE→GreenMail; complete-verification atomically verifies +
 * sets the password. The GreenMail capture/extraction steps are shared with
 * magic-link.steps.ts. Account activation is asserted by a FRESH OAuth login
 * (new session, new claims) — the FE-side equivalent of the BE's
 * "refreshes their session token".
 */

/** The BE corpus's influencer Firebase UID (Firestore instagramUsers/{uid}). */
const INFLUENCER_UID = 'SEWgduxUjRh4KDqxVWFs6zgThIa2';

interface InfluencerWorld {
  influencerSession?: TestSession;
  adminSession?: TestSession;
  influencerEmail?: string;
  influencerUserId?: number;
  oobCode?: string;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

function flows(world: InfluencerWorld): AuthFlowsApi {
  if (!world.influencerSession) throw new Error('influencer session missing — Background?');
  return new AuthFlowsApi(world.influencerSession.api);
}

/** OAuth-simulate into a FRESH isolated context; returns the session + profile basics. */
async function oauthLogin(playwright: {
  request: {
    newContext(o?: { baseURL?: string; ignoreHTTPSErrors?: boolean }): Promise<APIRequestContext>;
  };
}): Promise<{ session: TestSession; email: string; userId: number }> {
  const session = await TestSession.openViaOauthSimulation(playwright, INFLUENCER_UID);
  const me = await session.api.get<{ id: number; email: string }>('/users/me');
  if (!me.ok) throw new Error(`post-OAuth /users/me failed: HTTP ${me.status}`);
  return { session, email: me.json.email, userId: me.json.id };
}

Given(
  'the real influencer is signed in via the Instagram OAuth simulation',
  async ({ playwright, world }) => {
    const { session, email, userId } = await oauthLogin(playwright);
    world.influencerSession = session;
    world.influencerEmail = email;
    world.influencerUserId = userId;
  },
);

After(async ({ world }) => {
  // Global After hooks run for every scenario; the partnership hook may have
  // already disposed influencerSession — double-dispose must stay harmless.
  await world.influencerSession?.dispose().catch(() => undefined);
  await world.adminSession?.dispose().catch(() => undefined);
});

Given('the influencer is reset for verification', async ({ world }) => {
  await flows(world).resetInfluencerForVerification(world.influencerEmail!);
  // The reset hook does NOT null emailVerificationSentAt (the per-user send
  // cooldown, DB-backed) — set-email-verified(false) does. Without this, the
  // second send inside the re-verify scenario 429s past every retry.
  await flows(world).setEmailVerified(INFLUENCER_UID, false);
});

Given(
  'an admin enables all notification preferences for the influencer',
  async ({ playwright, world }) => {
    world.adminSession = await TestSession.open(playwright, ACTORS['admin1']);
    const r = await new NotificationsApi(world.adminSession.api).enableAllPreferences(
      world.influencerUserId!,
    );
    world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
    expect(r.ok, `enableAllPreferences (HTTP ${r.status}: ${r.body.slice(0, 200)})`).toBeTruthy();
  },
);

When('the influencer requests a verification email', async ({ world }) => {
  // Firebase's EXTERNAL quota on generateEmailVerificationLink
  // (TOO_MANY_ATTEMPTS_TRY_LATER) 429s repeated sends for the same account and
  // no test hook can clear a Google-side limit. The BE ships a dedicated
  // bypass hook for exactly this flake: synthetic oobCode in Redis + the REAL
  // SMTP email (GreenMail still captures it), and complete-verification
  // validates against Redis — the consumed path stays production-real.
  await flows(world).sendVerificationEmailBypass(INFLUENCER_UID);
});

When(
  'complete-verification is called with the extracted oobCode and password {string}',
  async ({ world }, password: string) => {
    const r = await flows(world).completeVerification(world.oobCode!, password);
    world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
  },
);

When(
  'complete-verification is called with oobCode {string} and password {string}',
  async ({ world }, oobCode: string, password: string) => {
    const r = await flows(world).completeVerification(oobCode, password);
    world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
  },
);

Then(
  'the verification response should contain userType {string}',
  async ({ world }, expected: string) => {
    const body = JSON.parse(world.lastResponse?.body ?? '{}') as {
      userType?: string;
      data?: { userType?: string };
    };
    const actual = body.userType ?? body.data?.userType;
    expect(
      actual,
      `verification response userType (body: ${(world.lastResponse?.body ?? '').slice(0, 200)})`,
    ).toBe(expected);
  },
);

Then('the response should contain messageKey {string}', async ({ world }, key: string) => {
  expect(world.lastResponse?.body ?? '').toContain(key);
});

Then(
  'the influencer account status is {string} after re-login',
  async ({ playwright, world }, expected: string) => {
    // Fresh OAuth login = fresh session claims — the FE-side equivalent of the
    // BE's session-token refresh after activation.
    await world.influencerSession?.dispose();
    const { session } = await oauthLogin(playwright);
    world.influencerSession = session;
    const me = await session.api.get<{ accountStatus?: { value?: string } }>('/users/me');
    expect(me.ok).toBeTruthy();
    expect(me.json.accountStatus?.value).toBe(expected);
  },
);

Then('the influencer has at least 1 unread notification', async ({ world }) => {
  const r = await new NotificationsApi(world.influencerSession!.api).unreadCount();
  expect(r.ok, `unread-count HTTP ${r.status}`).toBeTruthy();
  const count = r.json.count ?? r.json.unreadCount ?? 0;
  expect(count, `unread notifications (body: ${r.body.slice(0, 120)})`).toBeGreaterThan(0);
});

Then('the newest notification has type {string}', async ({ world }, type: string) => {
  const r = await new NotificationsApi(world.influencerSession!.api).list(0, 10);
  expect(r.ok, `notifications list HTTP ${r.status}`).toBeTruthy();
  const first = r.json.content?.[0];
  expect(
    first,
    `notifications page must not be empty (body: ${r.body.slice(0, 160)})`,
  ).toBeDefined();
  expect(first?.type).toBe(type);
});

Then('the influencer password is restored', async ({ world }) => {
  const original = process.env['FIREBASE_TEST_INFLUENCER_PASSWORD'];
  if (!original) return; // no canonical password on this machine — nothing to restore to
  await flows(world).setPassword(INFLUENCER_UID, original);
});
