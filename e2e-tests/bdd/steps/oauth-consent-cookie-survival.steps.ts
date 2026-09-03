import type { APIRequestContext } from '@playwright/test';
import { ConsentApi } from '../../_framework/api/consent.api';
import { ApiHttp } from '../../_framework/api/http-client';
import { TestSession } from '../../_framework/api/test-session';
import { BE_URL } from '../../integration/_actor';
import { After, Then, When, expect } from './fixtures';

import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import { UserType } from '../../../src/app/api/model/user-type';

/**
 * OAuth consent-cookie-survival oracle — Layer 2
 * (oauth-consent-cookie-survival.feature).
 *
 * Mirrors the BE glue (ConsentSteps.java §OAuth): the "OAuth callback" is the
 * BE's own stand-in — POST /test/auth/register-without-firebase as INFLUENCER —
 * which runs the same validateConsentCookiesPresent() path the real Instagram
 * callback does. "With consent cookies" rides the accumulating anonymous
 * TestSession jar seeded by the shared consent.steps.ts banner/prepare steps
 * (world.consentAnon); "without" uses a fresh cookie-less context; the
 * HMAC-tamper variant swaps in a context whose jar carries one flipped cookie
 * value (Playwright API jars are immutable in place, so tampering is a
 * storageState round-trip into a new request context — the _sig cookie stays
 * untouched, exactly like the BE glue).
 *
 * Shared world fields (consentAnon, lastResponse, registeredEmail/UserId,
 * adminSession, consentRecords) interop with consent.steps.ts so the reused
 * banner/prepare/admin steps and these steps see one scenario state. The
 * fields only THIS oracle needs live on a local World view (cast pattern —
 * fixtures.ts stays untouched).
 */

type Table = { rowsHash(): Record<string, string> };

interface OauthConsentWorld {
  /** Cookie-accumulating anonymous context (owned + disposed by consent.steps.ts). */
  consentAnon?: TestSession;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
  registeredEmail?: string;
  registeredUserId?: number;
  /** Jar with one tampered consent cookie — preferred by the callback step when set. */
  oauthTamperedCtx?: APIRequestContext;
  /** Re-login mock session opened WITHOUT consent cookies (scenario 4). */
  oauthReloginSession?: TestSession;
  /** userType the table registration used, for the re-login mock-session body. */
  oauthRegisteredUserType?: UserType;
}

function record(
  w: OauthConsentWorld,
  r: { status: number; headers: Record<string, string>; body: string },
): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function consentJar(w: OauthConsentWorld): TestSession {
  if (!w.consentAnon) {
    throw new Error('no consent-cookie context — did a banner/prepare step run first?');
  }
  return w.consentAnon;
}

/**
 * The ConsentApi the OAuth-callback stand-in should go through: the tampered
 * jar when the tamper step ran, otherwise the accumulated consent jar.
 */
function callbackApi(w: OauthConsentWorld): ConsentApi {
  if (w.oauthTamperedCtx) return new ConsentApi(new ApiHttp(w.oauthTamperedCtx));
  return new ConsentApi(consentJar(w).api);
}

/** Store the created user only on success — mirrors the BE glue's context.put. */
function stashRegistration(w: OauthConsentWorld, email: string, body: string): void {
  const parsed = JSON.parse(body || '{}') as { userId?: number; id?: number };
  w.registeredUserId = parsed.userId ?? parsed.id;
  w.registeredEmail = email;
}

/** The folded Set-Cookie line for one cookie (Playwright \n-joins repeats). */
function setCookieLine(w: OauthConsentWorld, name: string): string {
  const folded = w.lastResponse?.headers['set-cookie'] ?? '';
  const line = folded.split('\n').find((l) => l.trim().startsWith(`${name}=`));
  if (!line) {
    throw new Error(`Set-Cookie for "${name}" not found in: ${folded.slice(0, 300) || '(none)'}`);
  }
  return line;
}

After(async ({ world }) => {
  const w = world as OauthConsentWorld;
  await w.oauthTamperedCtx?.dispose().catch(() => undefined);
  await w.oauthReloginSession?.dispose().catch(() => undefined);
});

// ── OAuth callback stand-in (register-without-firebase as INFLUENCER) ────────

When('I simulate OAuth callback for a new influencer with consent cookies', async ({ world }) => {
  const w = world as OauthConsentWorld;
  const email = `oauth-influencer-${Date.now()}@e2e.test`;
  const r = await callbackApi(w).register(email, 'TestPassword123!', UserType.INFLUENCER);
  record(w, r);
  if (r.ok) stashRegistration(w, email, r.body);
});

When(
  'I simulate OAuth callback for a new influencer without consent cookies',
  async ({ playwright, world }) => {
    const w = world as OauthConsentWorld;
    // FRESH context — deliberately no consent cookies in its jar (simulates
    // cookies lost/blocked/stripped during the redirect chain).
    const bare = await TestSession.openAnonymous(playwright);
    try {
      const r = await new ConsentApi(bare.api).register(
        `oauth-noconsent-${Date.now()}@e2e.test`,
        'TestPassword123!',
        UserType.INFLUENCER,
      );
      record(w, r);
    } finally {
      await bare.dispose();
    }
  },
);

Then('the response should indicate consent required error', async ({ world }) => {
  const w = world as OauthConsentWorld;
  expect(
    w.lastResponse?.status,
    `expected 400 for missing/invalid consent cookies; body: ${(w.lastResponse?.body ?? '').slice(0, 300)}`,
  ).toBe(400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(w.lastResponse?.body ?? '');
  } catch {
    parsed = undefined;
  }
  if (parsed && typeof parsed === 'object') {
    const { message, errorCode } = parsed as { message?: string; errorCode?: string };
    expect(
      `${message ?? ''} ${errorCode ?? ''}`.toLowerCase(),
      'error response should mention consent',
    ).toMatch(/consent|missing/);
  }
});

Then('no user should be created from the OAuth callback', async ({ world }) => {
  const w = world as OauthConsentWorld;
  expect(
    w.registeredUserId,
    'no user id must be stored when the callback is rejected',
  ).toBeUndefined();
});

// ── Consented registration + re-login without consent cookies (scenario 4) ───

When('I register with consent cookies', async ({ world }, table: Table) => {
  const w = world as OauthConsentWorld;
  const row = table.rowsHash();
  const userType = row['userType'];
  // Contract guard: the feature's userType must be a real generated enum member.
  expect(Object.values(UserType), `"${userType}" is not a UserType member`).toContain(userType);
  // ADAPTATION: timestamp the table email — the BE corpus runs on throwaway
  // Testcontainers; this oracle's dev DB persists, so the fixed BE email would
  // collide with email-already-used on re-runs (see feature header).
  const [local, domain] = row['email'].split('@');
  const email = `${local}-${Date.now()}@${domain}`;
  const r = await new ConsentApi(consentJar(w).api).register(email, row['password'], userType);
  record(w, r);
  if (r.ok) {
    stashRegistration(w, email, r.body);
    w.oauthRegisteredUserType = userType as UserType;
  }
});

When(
  'the registered user creates a mock session without consent cookies',
  async ({ playwright, world }) => {
    const w = world as OauthConsentWorld;
    if (!w.registeredEmail) {
      throw new Error('no registered user — did "I register with consent cookies" run?');
    }
    // FRESH context: its jar has no consent cookies; the mock-session POST is
    // made directly (not TestSession.open) so the response status is recorded
    // for the Then assertion — the session cookies land in this jar either way.
    const session = await TestSession.openAnonymous(playwright);
    const r = await session.api.post('/test/auth/mock-session', {
      email: w.registeredEmail,
      role: w.oauthRegisteredUserType ?? UserType.INFLUENCER,
      partial: false,
    });
    record(w, r);
    w.oauthReloginSession = session;
  },
);

Then('the user should be able to access {string}', async ({ world }, path: string) => {
  const w = world as OauthConsentWorld;
  if (!w.oauthReloginSession) {
    throw new Error('no re-login session — did "the registered user creates a mock session" run?');
  }
  // The feature only exercises /users/me, so the response is typed as the
  // generated UserDtoOut (contract coupling), mirroring auth.steps.ts.
  const r = await w.oauthReloginSession.api.get<UserDtoOut>(path);
  expect(r.status, `GET ${path} while re-logged in (body: ${r.body.slice(0, 160)})`).toBe(200);
  expect(r.json.id, 'authenticated /users/me returns the user id').toBeTruthy();
});

// ── Cookie attribute assertions (scenario 5) ─────────────────────────────────

Then(
  'the cookie {string} should have SameSite {string}',
  async ({ world }, name: string, sameSite: string) => {
    const line = setCookieLine(world as OauthConsentWorld, name);
    expect(
      line.toLowerCase(),
      `cookie "${name}" must be SameSite=${sameSite} to survive the OAuth redirect chain`,
    ).toContain(`samesite=${sameSite.toLowerCase()}`);
  },
);

Then('the cookie {string} should be HttpOnly', async ({ world }, name: string) => {
  const line = setCookieLine(world as OauthConsentWorld, name);
  expect(line.toLowerCase(), `cookie "${name}" must be HttpOnly`).toContain('httponly');
});

// ── HMAC tamper (scenario 6) ─────────────────────────────────────────────────

When('I tamper with the consent cookie {string}', async ({ playwright, world }, name: string) => {
  const w = world as OauthConsentWorld;
  const state = await consentJar(w).raw.storageState();
  const target = state.cookies.find((c) => c.name === name);
  expect(target, `consent cookie "${name}" must exist before tampering`).toBeDefined();
  // Replace the last character (X <-> Y, like the BE glue) — invalidates the
  // HMAC while the matching _sig cookie stays untouched. Playwright API jars
  // are immutable in place, so the tampered jar becomes a NEW request context
  // that the callback step prefers over the pristine one.
  const cookies = state.cookies.map((c) =>
    c.name === name
      ? { ...c, value: c.value.slice(0, -1) + (c.value.endsWith('X') ? 'Y' : 'X') }
      : c,
  );
  w.oauthTamperedCtx = await playwright.request.newContext({
    baseURL: BE_URL,
    ignoreHTTPSErrors: true,
    storageState: { cookies, origins: state.origins },
  });
});
