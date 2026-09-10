import type { Page } from '@playwright/test';
import { REAL_COMPANY_FIREBASE_UID } from '../../_framework/actor';
import { TestSession } from '../../_framework/api/test-session';
import { isBridgeAvailable, readTotpSecret } from '../../_framework/firebase-admin-bridge';
import { hasUiCredentialsFor } from '../../_framework/real-login';
import { currentTotpCode } from '../../_framework/totp';
import { GREENFIELD_URL } from '../../integration/_actor';
import { Given, Then, When, expect, test } from './fixtures';

import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import { UserType } from '../../../src/app/api/model/user-type';

/**
 * User Login oracle — Layer 2 (functional), UI-driven (login.feature).
 *
 * Unlike the API-level partnership oracle, these steps drive the REAL greenfield
 * sign-in form (the production code path through SignInComponent), because the
 * whole point of the BE source feature is full-fidelity auth: real Firebase
 * password login, the admin's partial-session -> TOTP-verify -> full-session
 * upgrade, and the Instagram-OAuth session issue. mock-session would bypass
 * exactly what this oracle exists to prove.
 *
 * Skip gates: company/admin scenarios need FIREBASE_TEST_{ROLE}_{EMAIL,PASSWORD}
 * (e2e-tests/.env, gitignored). The admin TOTP secret is KMS-decrypted from
 * Firestore via the admin bridge when available (the faithful port of the BE's
 * "I decrypt the admin TOTP secret from Firestore via KMS"), falling back to
 * E2E_ADMIN_TOTP_SECRET. The influencer scenario runs wherever the live BE has
 * Firestore + KMS access (server-side), like every live-BE oracle.
 */

type Cred = { email: string; password: string };

function credentialsFor(role: 'COMPANY' | 'ADMIN'): Cred {
  return {
    email: process.env[`FIREBASE_TEST_${role}_EMAIL`]!,
    password: process.env[`FIREBASE_TEST_${role}_PASSWORD`]!,
  };
}

/**
 * Accept the cookie banner exactly like a first-visit user — the BE consent
 * gate 451s /auth/exchange-token without the HMAC-signed consent_cookie_policy
 * cookie the banner's ESSENTIAL toggle sets. Waits for the toggle round-trip.
 */
async function acceptCookieBannerIfPresent(page: Page): Promise<void> {
  const acceptCookies = page.getByTestId('cookie-banner-accept-all');
  if (await acceptCookies.isVisible().catch(() => false)) {
    const essentialToggle = page.waitForResponse(
      (resp) =>
        /\/api\/legal\/consent\/category-toggle\b/.test(resp.url()) &&
        resp.request().method() === 'POST' &&
        resp.status() < 300,
      { timeout: 10_000 },
    );
    await acceptCookies.click();
    await essentialToggle;
    await expect(page.getByTestId('cookie-banner')).toBeHidden();
  }
}

/** Fill + submit the sign-in form; record the /auth/exchange-token status on the world. */
async function signInThroughForm(
  page: Page,
  world: { lastResponse?: { status: number; headers: Record<string, string>; body?: string } },
  cred: Cred,
): Promise<void> {
  await page.goto(`${GREENFIELD_URL}/auth/sign-in`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('sign-in-email'), 'sign-in form must render').toBeVisible();
  await acceptCookieBannerIfPresent(page);

  await page.getByTestId('sign-in-email').fill(cred.email);
  await page.getByTestId('sign-in-password').fill(cred.password);

  const exchangePromise = page.waitForResponse(
    (resp) =>
      /\/api\/auth\/exchange-token\b/.test(resp.url()) && resp.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.getByTestId('sign-in-submit').click();
  const exchange = await exchangePromise;
  world.lastResponse = { status: exchange.status(), headers: exchange.headers() };
}

// ── Skip gates ───────────────────────────────────────────────────────────────

Given('real {word} credentials are available', async ({ playwright }, role: string) => {
  test.skip(
    !hasUiCredentialsFor(role as 'COMPANY' | 'ADMIN'),
    `FIREBASE_TEST_${role}_{EMAIL,PASSWORD} not set — see e2e-tests/.env.example`,
  );
  // Ensure the BE user row exists AND carries the REAL Firebase UID before
  // any real-token flow: exchange-token 401s and uid-keyed /test hooks 400
  // when the row is missing (fresh DB) or was minted with a mock uid. The
  // seed is idempotent; the throwaway session is disposed immediately.
  const uid = role === 'COMPANY' ? REAL_COMPANY_FIREBASE_UID : process.env['ADMIN_FIREBASE_UID'];
  if (uid) {
    const seed = await TestSession.open(playwright, {
      id: `${role.toLowerCase()}-real-seed`,
      email: process.env[`FIREBASE_TEST_${role}_EMAIL`]!,
      role: role as 'COMPANY' | 'ADMIN',
      firebaseUid: uid,
    });
    await seed.dispose();
  }
});

// ── Form sign-in (company + admin) ───────────────────────────────────────────

When('the {word} user signs in through the sign-in form', async ({ page, world }, role: string) => {
  await signInThroughForm(page, world, credentialsFor(role as 'COMPANY' | 'ADMIN'));
});

Then('the token exchange should return 200', async ({ page, world }) => {
  expect(world.lastResponse?.status, '/auth/exchange-token status').toBe(200);
  // The form chain completes with a router.navigate away from the sign-in page.
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/auth/sign-in'), {
    timeout: 10_000,
  });
});

// ── Admin 2FA challenge → KMS TOTP → verify ──────────────────────────────────

Then('a two-factor challenge should be presented', async ({ page, world }) => {
  // Exchange returns 200 with requires2FA=true + a PARTIAL session; the FE
  // opens the TwoFactorVerifyDialog on that flag.
  expect(world.lastResponse?.status, 'partial-session exchange status').toBe(200);
  await expect(
    page.getByTestId('two-factor-verify-code'),
    '2FA verify dialog must open for an admin with TOTP configured',
  ).toBeVisible({ timeout: 10_000 });
});

When('the admin submits the current TOTP code from the KMS-decrypted secret', async ({ page }) => {
  // Faithful port of the BE step: decrypt the admin's REAL TOTP secret from
  // Firestore through GCP KMS (firebase-admin-bridge). Fall back to the
  // deterministic e2e secret when the bridge is unavailable on this machine.
  const adminUid = process.env['ADMIN_FIREBASE_UID'];
  let secret = process.env['E2E_ADMIN_TOTP_SECRET'] ?? '';
  if (isBridgeAvailable() && adminUid) {
    const decrypted = await readTotpSecret(adminUid).catch(() => null);
    if (decrypted) secret = decrypted;
  }
  test.skip(!secret, 'No TOTP secret available (bridge + E2E_ADMIN_TOTP_SECRET both missing)');

  const verifyPromise = page.waitForResponse(
    (resp) => /\/api\/twofactor\/verify\b/.test(resp.url()) && resp.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByTestId('two-factor-verify-code').fill(currentTotpCode(secret));
  await page.getByTestId('two-factor-verify-submit').click();
  const verify = await verifyPromise;
  expect(verify.status(), `/twofactor/verify should accept the TOTP code`).toBeLessThan(400);
});

Then('the two-factor verification should succeed', async ({ page }) => {
  // Dialog closes and the sign-in chain resumes (full session + navigate).
  await expect(page.getByTestId('two-factor-verify-code')).toBeHidden({ timeout: 10_000 });
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/auth/sign-in'), {
    timeout: 15_000,
  });
});

// ── Influencer OAuth simulation ──────────────────────────────────────────────

/**
 * The BE feature's influencer UID — the Firestore document id under
 * instagramUsers/{uid} holding the KMS-encrypted Instagram token
 * (checkitout-backend login.feature Examples table).
 */
const INFLUENCER_OAUTH_UID = 'E2E_INFLUENCER_001';

When('the influencer authenticates via the Instagram OAuth simulation', async ({ page, world }) => {
  // POST through the PAGE's request context so the issued session cookies land
  // in this browser context's jar — the same place a production OAuth redirect
  // would put them.
  const res = await page.request.post(`${GREENFIELD_URL}/api/test/auth/simulate-influencer-oauth`, {
    data: { firebaseUid: INFLUENCER_OAUTH_UID },
    ignoreHTTPSErrors: true,
  });
  world.lastResponse = {
    status: res.status(),
    headers: res.headers(),
    body: await res.text(),
  };
});

Then('the OAuth response should contain Instagram user data', async ({ world }) => {
  const body = JSON.parse(world.lastResponse?.body ?? '{}') as {
    instagramUsername?: string;
    tokenValid?: boolean;
  };
  expect(
    body.instagramUsername,
    'OAuth simulation must return the Instagram username',
  ).toBeTruthy();
  expect(body.tokenValid, 'the KMS-decrypted Instagram token must be valid').toBe(true);
});

// ── Shared session assertions ────────────────────────────────────────────────

Then('the browser should hold the session cookie pair', async ({ context }) => {
  const cookies = await context.cookies(GREENFIELD_URL);
  const byName = new Map(cookies.map((c) => [c.name, c]));
  const session = byName.get('session');
  const sessionSig = byName.get('session_sig');
  expect(
    session,
    `session cookie must be set (have: ${[...byName.keys()].join(', ')})`,
  ).toBeDefined();
  expect(sessionSig, 'session_sig cookie must be set').toBeDefined();
  expect(session!.httpOnly, 'session must be HttpOnly').toBe(true);
  expect(sessionSig!.httpOnly, 'session_sig must be HttpOnly').toBe(true);
});

Then('the authenticated user should have role {string}', async ({ page }, role: string) => {
  // Contract guard: the feature's role must be a real generated enum member.
  expect(Object.values(UserType), `"${role}" is not a UserType member`).toContain(role);
  const meRes = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
    ignoreHTTPSErrors: true,
  });
  expect(meRes.status(), 'post-sign-in /users/me must be 200').toBe(200);
  const me = (await meRes.json()) as UserDtoOut;
  expect(me.userType?.value, 'role should round-trip to /users/me').toBe(role);
});
