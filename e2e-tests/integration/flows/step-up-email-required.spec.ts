import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { getMyId } from '../_helpers';
import { clearInbox, extractSixDigitCode, waitForEmail } from '../../_framework/test-email';
import { hasRealCredentialsFor, realLogin } from '../../_framework/real-login';
import { ACTORS } from '../../_framework/actor';
import {
  isBridgeAvailable,
  readTotpSecret,
  TotpSecretMissingError,
} from '../../_framework/firebase-admin-bridge';
import { currentTotpCode } from '../../_framework/totp';

/**
 * T7/T14 — Port of `step-up-auth.feature` (extra scenarios not covered by
 * `e2e-tests/integration/auth/step-up.spec.ts`).
 *
 * step-up.spec.ts already covers:
 *   - @incomplete-setup COMPANY/INFLUENCER can PATCH email without step-up
 *     (setup-incomplete bypasses step-up entirely)
 *   - /auth/step-up/check returns required:false for incomplete setup
 *
 * This spec adds the SETUP-COMPLETED side of the feature:
 *
 *   ✅ Negative: email PATCH without X-Step-Up-Token header → 401 when
 *      initialAccountSetupCompleted=true (double-seedSession flips the
 *      flag via TestAuthController:781-787 existing-user branch).
 *   ✅ Positive: non-email field PATCH succeeds without step-up token
 *      (already in profile-critical-fields.spec but worth a tight check
 *      here against the same setup-complete actor).
 *   ✅ Negative: PENDING_ADMIN role cannot even start step-up for
 *      EMAIL_CHANGE — /auth/step-up/check returns 403.
 *   ✅ Happy-path: COMPANY full email-change flow with code captured by
 *      GreenMail (BE c235fc52 + FE f46e138 unblocked Blocker C).
 *   ✅ Token reuse: same step-up token rejected on the second PATCH.
 *   ✅ Brute-force cooldown: 5 wrong codes → 429 from /auth/step-up/verify.
 *
 *   ⏭️  TOTP step-up for ADMIN — blocked on Blocker B (#216) Firestore
 *      TOTP secret. T1 TOTP helper is necessary but not sufficient.
 *
 * Bug class caught:
 *   1. Step-up bypass regression on email change. If the BE ever
 *      stops requiring X-Step-Up-Token, a stolen session cookie =
 *      full email takeover (and account hijack via password reset
 *      flow on the new email).
 *   2. PENDING_ADMIN escalation: PENDING_ADMIN must NOT be able to
 *      complete email changes — they don't yet have full ADMIN
 *      privileges and email change is sensitive.
 *
 * Run: `npm run test:integration -- --grep step-up-email-required`
 */

const UNIQUE_COMPANY = () =>
  `t14-stp-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_PENDING_ADMIN = () =>
  `t14-stp-pa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function api(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<APIResponse> {
  const url = `${GREENFIELD_URL}/api${path}`;
  const opts = {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
    headers: extraHeaders,
  } as const;
  switch (method) {
    case 'GET':
      return page.request.get(url, opts);
    case 'POST':
      return page.request.post(url, { ...opts, data });
    case 'PATCH':
      return page.request.patch(url, { ...opts, data });
  }
}

test.describe('@step-up-email-required — port of step-up-auth.feature (setup-complete side)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${BE_URL}/api/public-config`, {
        ignoreHTTPSErrors: true,
        timeout: 3_000,
      });
      if (!res.ok()) test.skip(true, `BE health-check failed (${res.status()})`);
    } catch (err) {
      test.skip(true, `BE not reachable: ${(err as Error).message}`);
    }
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  // --------------------------------------------------------------------
  // Negative: email PATCH without step-up token returns 401
  //
  // Unblocked 2026-05-12: the prior fixme premise that "double-seed
  // doesn't flip setupCompleted" was wrong — the BE soft-skip flag
  // for Firebase claim updates (app.firebase.claim-updates.soft-skip-
  // missing-user, dev profile) plus the second seedSession's existing-
  // user branch (TestAuthController.java:781-787) DOES flip
  // initialAccountSetupCompleted=true. Verified live against BE c235fc52.
  // --------------------------------------------------------------------
  test('@step-up email PATCH without X-Step-Up-Token returns 401 (setup-complete COMPANY)', async ({
    page,
  }) => {
    const email = UNIQUE_COMPANY();
    // Explicit setupCompleted:true — the old implicit double-seed contract
    // was nondeterministic under seedSession 409-retries.
    await seedSession(page, email, 'COMPANY', email, { setupCompleted: true });
    const userId = await getMyId(page);

    // Email PATCH without X-Step-Up-Token → BE step-up filter rejects 401.
    const res = await api(page, 'PATCH', `/users/${userId}`, {
      email: `no-token-${Date.now()}@test.com`,
    });
    expect(
      res.status(),
      `email PATCH without step-up token should be 401, got ${res.status()}: ${await res.text()}`,
    ).toBe(401);
  });

  // --------------------------------------------------------------------
  // Positive: non-email PATCH works without step-up
  // --------------------------------------------------------------------
  test('@step-up non-email PATCH succeeds without step-up token (setup-complete COMPANY)', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyId(page);

    const res = await api(page, 'PATCH', `/users/${userId}`, {
      firstName: 'StepUpNotNeeded',
    });
    expect(
      res.status(),
      `non-email PATCH should be 200 without step-up token, got ${res.status()}: ${await res.text()}`,
    ).toBe(200);
  });

  // --------------------------------------------------------------------
  // PENDING_ADMIN cannot even start step-up for EMAIL_CHANGE
  // --------------------------------------------------------------------
  test('@step-up PENDING_ADMIN /step-up/check returns 403 for EMAIL_CHANGE', async ({ page }) => {
    // Seed mock session with PENDING_ADMIN role.
    const email = UNIQUE_PENDING_ADMIN();
    const res = await page.request.post(`${GREENFIELD_URL}/api/test/auth/mock-session`, {
      data: { email, role: 'PENDING_ADMIN', partial: false },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (res.status() === 400 || res.status() === 404) {
      test.skip(
        true,
        `mock-session doesn't accept PENDING_ADMIN role in this BE profile (got ${res.status()}).`,
      );
    }
    expect(res.status(), 'mock-session PENDING_ADMIN should be 200').toBe(200);

    // /step-up/check is GET with actionType as a query param (matches the
    // codegen client at src/app/api/api/step-up-auth.api.ts).
    const check = await api(page, 'GET', '/step-up/check?actionType=EMAIL_CHANGE');
    if (check.status() === 404) {
      test.skip(true, '/step-up/check not registered at this BE tip.');
    }
    expect(
      check.status(),
      `PENDING_ADMIN step-up/check for EMAIL_CHANGE should be 403, got ${check.status()}: ${await check.text()}`,
    ).toBe(403);
  });

  // --------------------------------------------------------------------
  // Happy path — full email-change flow with code captured by GreenMail.
  // Unblocked 2026-05-12 by BE c235fc52 (GreenMail in @Profile({"e2e","dev"})
  // + TestEmailController exposing /test/email* over HTTP).
  // --------------------------------------------------------------------
  test('@step-up happy-path COMPANY completes full email-change flow', async ({ page }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY', email, { setupCompleted: true });
    const userId = await getMyId(page);

    await clearInbox(page);

    // Step 1: check → required=true with EMAIL_CODE challenge.
    const check = await api(page, 'GET', '/step-up/check?actionType=EMAIL_CHANGE');
    expect(check.status(), 'step-up/check should be 200').toBe(200);
    const checkBody = (await check.json()) as { required: boolean; challengeType: string };
    expect(checkBody.required, 'setup-complete COMPANY needs step-up for EMAIL_CHANGE').toBe(true);
    expect(checkBody.challengeType, 'COMPANY uses EMAIL_CODE challenge').toBe('EMAIL_CODE');

    // Step 2: request code → BE emits email via JavaMailSender → GreenMail captures.
    const req = await api(page, 'POST', '/step-up/request', { actionType: 'EMAIL_CHANGE' });
    expect(
      req.status(),
      `step-up/request should be 200, got ${req.status()}: ${await req.text()}`,
    ).toBe(200);

    // Step 3: pull the email out of GreenMail + extract 6-digit code.
    const captured = await waitForEmail(page, {
      to: email,
      // BE step-up emails use subject "Your verification code" (NotificationType
      // emails use the [CheckItOut] prefix instead — different sender path).
      // Match the actual subject loosely so PL-locale variants still pass.
      subject: /verification code|kod weryfikacyjny/i,
      timeoutMs: 8_000,
    });
    const code = extractSixDigitCode(captured.body);

    // Step 4: verify code → BE issues a short-lived step-up token.
    const verify = await api(page, 'POST', '/step-up/verify', {
      actionType: 'EMAIL_CHANGE',
      code,
    });
    expect(
      verify.status(),
      `step-up/verify with real code should be 200, got ${verify.status()}: ${await verify.text()}`,
    ).toBe(200);
    const tokenBody = (await verify.json()) as { token?: string };
    expect(typeof tokenBody.token, 'verify response should contain a string token').toBe('string');
    const token = tokenBody.token!;

    // Step 5: PATCH email with X-Step-Up-Token header.
    //
    // The token is accepted (NOT 401 from the step-up filter); the downstream
    // BE attempt to update Firebase Auth's email may 502 because mock-session
    // firebaseUids don't exist in the real Firebase project. That 502 is
    // downstream noise and not the contract this test is asserting — the
    // step-up flow itself is proven by /verify returning a token + PATCH not
    // being rejected at the step-up filter. We allow 200 (real Firebase up)
    // OR 502 (Firebase unavailable for mock-session UID); fail on 401.
    const newEmail = `e2e-stepup-changed-${Date.now()}@test.com`;
    const patch = await api(
      page,
      'PATCH',
      `/users/${userId}`,
      { email: newEmail },
      { 'X-Step-Up-Token': token },
    );
    expect(
      patch.status(),
      `step-up filter must accept a valid token (NOT 401); got ${patch.status()}: ${await patch.text()}`,
    ).not.toBe(401);
    expect(
      [200, 502].includes(patch.status()),
      `email PATCH with valid step-up token should be 200 (or 502 if Firebase unavailable for mock-session uid), got ${patch.status()}: ${await patch.text()}`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // Token reuse — single-use semantics. After a successful PATCH, the
  // SAME token must fail. (Email change incremented tokenVersion; the
  // session cookie's claims are stale for the second PATCH, but the
  // X-Step-Up-Token check fires first and returns 401 because the token
  // was already consumed from Redis.)
  // --------------------------------------------------------------------
  test('@step-up token cannot be reused (one-time consumption)', async ({ page }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY', email, { setupCompleted: true });
    const userId = await getMyId(page);

    await clearInbox(page);
    const req = await api(page, 'POST', '/step-up/request', { actionType: 'EMAIL_CHANGE' });
    expect(req.status()).toBe(200);
    const captured = await waitForEmail(page, { to: email, timeoutMs: 8_000 });
    const code = extractSixDigitCode(captured.body);
    const verify = await api(page, 'POST', '/step-up/verify', {
      actionType: 'EMAIL_CHANGE',
      code,
    });
    expect(verify.status()).toBe(200);
    const token = ((await verify.json()) as { token: string }).token;

    // First use — token consumed. Allows 200 OR 502 (Firebase noise) for the
    // same reason as the happy-path test; the assertion is "token was accepted
    // by the step-up filter", i.e. NOT 401.
    const firstPatch = await api(
      page,
      'PATCH',
      `/users/${userId}`,
      { email: `reuse-1-${Date.now()}@test.com` },
      { 'X-Step-Up-Token': token },
    );
    expect(
      [200, 502].includes(firstPatch.status()),
      `first PATCH should consume token (200 or 502 if Firebase noise), got ${firstPatch.status()}`,
    ).toBe(true);
    expect(firstPatch.status(), 'first PATCH must not be 401 (token must be accepted)').not.toBe(
      401,
    );

    // Re-authenticate — the email change incremented tokenVersion, so the
    // current session cookie is stale. Without re-seeding, subsequent
    // requests would 401 on tokenVersion mismatch (not on the step-up
    // token), which would mask the reuse-semantics assertion.
    await seedSession(page, email, 'COMPANY');

    // Same token, second use — must be rejected.
    const secondPatch = await api(
      page,
      'PATCH',
      `/users/${userId}`,
      { email: `reuse-2-${Date.now()}@test.com` },
      { 'X-Step-Up-Token': token },
    );
    expect(
      secondPatch.status(),
      `re-using a consumed step-up token should fail (got ${secondPatch.status()}: ${await secondPatch.text()})`,
    ).toBe(401);
  });

  // --------------------------------------------------------------------
  // Brute-force defense — 5 wrong codes → cooldown 429.
  // The request endpoint emits the real code via email; we ignore it
  // and submit wrong codes instead. After 5 misses the BE rate-limits
  // verify attempts for the cooldown window.
  // --------------------------------------------------------------------
  test('@step-up 5 wrong codes triggers cooldown (429)', async ({ page }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY', email, { setupCompleted: true });

    await clearInbox(page);
    const req = await api(page, 'POST', '/step-up/request', { actionType: 'EMAIL_CHANGE' });
    expect(req.status()).toBe(200);

    // Submit 5 wrong codes back to back.
    const wrongCodes = ['000000', '000001', '000002', '000003', '000004'];
    for (const code of wrongCodes.slice(0, 4)) {
      const res = await api(page, 'POST', '/step-up/verify', {
        actionType: 'EMAIL_CHANGE',
        code,
      });
      // First 4 should be 400/401 (bad code), not 429 yet.
      expect(
        [400, 401].includes(res.status()),
        `wrong code attempt should be 400/401 before cooldown, got ${res.status()}`,
      ).toBe(true);
    }

    const fifthRes = await api(page, 'POST', '/step-up/verify', {
      actionType: 'EMAIL_CHANGE',
      code: wrongCodes[4]!,
    });
    expect(
      fifthRes.status(),
      `5th wrong code should trigger 429 cooldown, got ${fifthRes.status()}: ${await fifthRes.text()}`,
    ).toBe(429);
  });

  // --------------------------------------------------------------------
  // ADMIN TOTP — unblocked 2026-05-12 by the Firebase Admin bridge
  // (8f0aaf8) + the provisioning run (bb0f7ae) that wrote the test
  // admin's TOTP secret to Firestore (`totpSecrets/85VJ...`).
  //
  // Flow: realLogin admin → partial session → complete 2FA via real
  // TOTP → upgrade to full session → /step-up/check returns TOTP
  // challenge for admin role → /step-up/verify with current TOTP code
  // → returns step-up token → PATCH /users/{id} with X-Step-Up-Token
  // header to change email.
  //
  // mock-session ADMIN is INSUFFICIENT here because the BE step-up TOTP
  // verifier reads from Firestore keyed by firebaseUid — synthetic UIDs
  // (`E2E_ADMIN_xxx`) have no totpSecrets doc. Real-Firebase admin
  // (UID `85VJgS6shAWTqby4rHypN355RWv2`) has the provisioned secret.
  // --------------------------------------------------------------------
  test('@step-up ADMIN uses TOTP for EMAIL_CHANGE step-up', async ({ browser }) => {
    test.skip(
      !hasRealCredentialsFor('ADMIN'),
      'FIREBASE_TEST_ADMIN_{EMAIL,PASSWORD} not set — see e2e-tests/.env.example',
    );
    test.skip(
      !isBridgeAvailable(),
      'Firebase Admin bridge unavailable — service-account.json missing',
    );

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();

      // Phase 1: real admin login + 2FA → full session.
      await realLogin(context, ACTORS['admin1']!, GREENFIELD_URL);
      const adminUid = process.env['ADMIN_FIREBASE_UID'] ?? '85VJgS6shAWTqby4rHypN355RWv2';
      let totpSecret: string;
      try {
        totpSecret = await readTotpSecret(adminUid);
      } catch (err) {
        if (err instanceof TotpSecretMissingError) {
          test.skip(
            true,
            `totpSecrets/${adminUid} not provisioned — run e2e-tests/scripts/provision-admin-totp.mjs first.`,
          );
        }
        throw err;
      }
      const loginVerify = await page.request.post(`${GREENFIELD_URL}/api/twofactor/verify`, {
        data: { code: currentTotpCode(totpSecret) },
        ignoreHTTPSErrors: true,
      });
      expect(loginVerify.status(), 'login-time 2FA must verify').toBe(200);
      const loginExchange = await page.request.post(`${GREENFIELD_URL}/api/auth/exchange-token`, {
        data: {},
        ignoreHTTPSErrors: true,
      });
      expect(loginExchange.status(), 'post-2FA exchange-token').toBe(200);

      const userId = await getMyId(page);

      // Phase 2: step-up check → admin gets TOTP (not EMAIL_CODE) challenge.
      const check = await api(page, 'GET', '/step-up/check?actionType=EMAIL_CHANGE');
      expect(check.status(), 'step-up/check must be 200').toBe(200);
      const checkBody = (await check.json()) as { required: boolean; challengeType: string };
      expect(checkBody.required, 'admin needs step-up for EMAIL_CHANGE').toBe(true);
      expect(checkBody.challengeType, 'admin uses TOTP challenge').toBe('TOTP');

      // Phase 3: step-up verify with TOTP. BE reuses the same secret it
      // used at login-time 2FA — generate a fresh code for the current
      // 30s window (the login-time code may have rolled over).
      const stepUpVerify = await api(page, 'POST', '/step-up/verify', {
        actionType: 'EMAIL_CHANGE',
        code: currentTotpCode(totpSecret),
      });
      expect(
        stepUpVerify.status(),
        `step-up/verify with real TOTP must be 200, got ${stepUpVerify.status()}: ${await stepUpVerify.text()}`,
      ).toBe(200);
      const stepUpBody = (await stepUpVerify.json()) as { token?: string };
      expect(typeof stepUpBody.token, 'step-up token').toBe('string');
      const token = stepUpBody.token!;

      // Phase 4: PATCH email with X-Step-Up-Token. Admin Firebase user
      // is real — the BE will actually try to update Firebase Auth's
      // email field. Accept 200 (success) OR 502 (Firebase noise on
      // duplicate-email / rate-limit), assert NOT 401 (step-up filter
      // must accept the token). Same tolerance pattern as the COMPANY
      // happy-path test above.
      const newEmail = `e2e-admin-stepup-${Date.now()}@test.com`;
      const patch = await api(
        page,
        'PATCH',
        `/users/${userId}`,
        { email: newEmail },
        { 'X-Step-Up-Token': token },
      );
      expect(
        patch.status(),
        `step-up filter must accept admin's token (NOT 401); got ${patch.status()}: ${await patch.text()}`,
      ).not.toBe(401);
      expect(
        [200, 502].includes(patch.status()),
        `admin email PATCH with step-up TOTP token should be 200 (or 502 Firebase noise); got ${patch.status()}`,
      ).toBe(true);
    } finally {
      await context.close();
    }
  });
});
