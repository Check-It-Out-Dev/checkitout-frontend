import { expect, test } from '@playwright/test';
import { GREENFIELD_URL } from '../_actor';
import { hasRealCredentialsFor, realLogin } from '../../_framework/real-login';
import { ACTORS } from '../../_framework/actor';
import {
  isBridgeAvailable,
  readTotpSecret,
  TotpSecretMissingError,
} from '../../_framework/firebase-admin-bridge';
import { currentTotpCode, provisionedAdminTotpSecret } from '../../_framework/totp';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';

/**
 * T4 — Port of `src/test/resources/features/login.feature`.
 *
 * Real-Firebase happy-path login flow. Mints a real Firebase ID token
 * via Identity Toolkit, exchanges it for the BE's HttpOnly session
 * cookies, asserts /users/me round-trips with the expected role.
 *
 * Self-skipping: when `e2e-tests/.env` is absent OR the role's
 * credentials are blank, the test self-skips with a clear "credentials
 * missing" message. Mock-session-only runs stay green.
 *
 * Scenario coverage from login.feature:
 *
 *   Scenario 1 — @company @full-auth      → ported here (happy path)
 *   Scenario 2 — @admin @full-auth @2fa   → fixme (Blocker B: Firestore TOTP seed)
 *   Scenario 3 — @influencer @oauth @kms  → fixme (Blocker D: KMS Instagram token)
 *
 * Run: `npm run test:integration -- --grep login-real`
 */

test.describe('@login-real — real-Firebase happy-path login (T4)', () => {
  // Run sequentially: shared Firebase test users mean concurrent runs
  // would race against /api/auth/exchange-token state (session cookies
  // are scoped per BrowserContext, but Firebase rate-limits per-account
  // sign-in attempts).
  test.describe.configure({ mode: 'serial' });

  test('@company @full-auth — company logs in with real Firebase + receives session cookie', async ({
    browser,
  }) => {
    test.skip(
      !hasRealCredentialsFor('COMPANY'),
      'FIREBASE_TEST_COMPANY_{EMAIL,PASSWORD} not set — see e2e-tests/.env.example',
    );

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();

      // Real-Firebase login: Identity Toolkit signInWithPassword → BE
      // /auth/exchange-token. After this the BrowserContext has the
      // production-shaped HttpOnly session + session_sig cookies.
      await realLogin(context, ACTORS['company1']!, GREENFIELD_URL);

      // /users/me round-trips with the new session. Body shape per
      // openapi.json — typed against the codegen DTO.
      const meRes = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(meRes.status(), 'real-Firebase login should yield 200 on /users/me').toBe(200);

      const me = (await meRes.json()) as UserDtoOut;
      expect(me.userType?.value, 'role claim should round-trip to /users/me').toBe('COMPANY');
      expect(typeof me.id, 'session cookie should resolve to a numeric local user id').toBe(
        'number',
      );

      // Two HttpOnly cookies (session + session_sig). The signing pair
      // is the BE's HMAC anti-tamper envelope; both must be present.
      const cookies = await context.cookies(GREENFIELD_URL);
      const cookieNames = cookies.map((c) => c.name).sort();
      expect(cookieNames, 'session + session_sig HttpOnly pair should be set').toEqual(
        expect.arrayContaining(['session', 'session_sig']),
      );

      // Defense-in-depth: HttpOnly + Secure flags on both, matching what
      // the BE issues in production (see SessionSecurityService).
      const sessionCookie = cookies.find((c) => c.name === 'session');
      expect(sessionCookie?.httpOnly, 'session cookie must be HttpOnly').toBe(true);
      expect(sessionCookie?.secure, 'session cookie must be Secure').toBe(true);
    } finally {
      await context.close();
    }
  });

  // Admin happy-path — 2-stage flow: partial session → TOTP verify →
  // full session. Unblocked 2026-05-12 by the Firebase Admin bridge
  // (8f0aaf8) + the provisioning script that seeded
  // `totpSecrets/85VJgS6shAWTqby4rHypN355RWv2.encryptedSecret` with
  // the well-known test vector `JBSWY3DPEHPK3PXP`. The bridge reads
  // it back via KMS decrypt; `currentTotpCode` generates a valid code
  // for the current 30s window.
  test('@admin @full-auth @2fa — admin completes partial-then-full session with real TOTP', async ({
    browser,
  }) => {
    test.skip(
      !hasRealCredentialsFor('ADMIN'),
      'FIREBASE_TEST_ADMIN_{EMAIL,PASSWORD} not set — see e2e-tests/.env.example',
    );
    // Either the run provisioned a secret it already knows (the emulator path, no credential
    // anywhere) or the bridge can decrypt one out of Firestore with KMS. Neither, and there is no
    // way to generate a valid code, so there is nothing to assert.
    const provisioned = provisionedAdminTotpSecret();
    test.skip(
      !provisioned && !isBridgeAvailable(),
      'no provisioned secret (E2E_TOTP_SECRET) and no Firebase Admin bridge — see e2e-tests/.env.example',
    );

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();

      // Step 1: realLogin admin → Identity Toolkit ID token → BE issues
      // PARTIAL session cookie + body contains `requires2FA: true`.
      await realLogin(context, ACTORS['admin1']!, GREENFIELD_URL);

      // Step 2: read + KMS-decrypt the seeded TOTP secret for this admin
      // out of Firestore. The bridge handles the
      // service-account.json + KMS keyring lookup; we just pass the UID.
      const adminUid = process.env['ADMIN_FIREBASE_UID'] ?? '85VJgS6shAWTqby4rHypN355RWv2';
      let totpSecret: string;
      if (provisioned) {
        // Provisioned through the backend's own service, so the ciphertext in Firestore is whatever
        // this run's cipher produces and nothing here needs to decrypt it.
        totpSecret = provisioned;
      } else {
        try {
          totpSecret = await readTotpSecret(adminUid);
        } catch (err) {
          if (err instanceof TotpSecretMissingError) {
            test.skip(
              true,
              `totpSecrets/${adminUid} not provisioned — run \`node --experimental-strip-types e2e-tests/scripts/provision-admin-totp.mjs\` first.`,
            );
          }
          throw err;
        }
      }
      const code = currentTotpCode(totpSecret);

      // Step 3: POST /twofactor/verify with the live code. BE marks the
      // Firebase claim `twoFactorVerified=true` + re-issues the partial
      // session as full on the next exchange-token.
      const verifyRes = await page.request.post(`${GREENFIELD_URL}/api/twofactor/verify`, {
        data: { code },
        ignoreHTTPSErrors: true,
      });
      expect(
        verifyRes.status(),
        `2FA verify with real TOTP must succeed (got ${verifyRes.status()}: ${await verifyRes.text()})`,
      ).toBe(200);

      // Step 4: re-exchange to upgrade partial → full session. Mirrors
      // the FE's SignInComponent post-2FA branch.
      const finalExchange = await page.request.post(`${GREENFIELD_URL}/api/auth/exchange-token`, {
        data: {},
        ignoreHTTPSErrors: true,
      });
      expect(finalExchange.status(), 'final exchange-token must be 200').toBe(200);

      // Step 5: /users/me round-trips with the admin role.
      const meRes = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(meRes.status(), 'admin /users/me must be 200').toBe(200);
      const me = (await meRes.json()) as UserDtoOut;
      expect(me.userType?.value, 'admin role should round-trip to /users/me').toBe('ADMIN');
    } finally {
      await context.close();
    }
  });

  test.fixme('@influencer @oauth @kms — influencer logs in via OAuth with KMS-decrypted Instagram token', async () => {
    // Blocker D: KMS-decrypted Instagram token from Firestore. Requires
    // out-of-band KMS keyring + Firestore document + Instagram OAuth
    // mock-server. Out of scope for FE port until BE provides a
    // test-only Instagram OAuth simulator.
  });
});
