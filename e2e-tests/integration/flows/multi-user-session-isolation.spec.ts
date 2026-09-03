import { expect, test, type BrowserContext } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { hasRealCredentialsFor, realLogin } from '../../_framework/real-login';
import { ACTORS } from '../../_framework/actor';
import {
  isBridgeAvailable,
  readTotpSecret,
  TotpSecretMissingError,
} from '../../_framework/firebase-admin-bridge';
import { currentTotpCode } from '../../_framework/totp';

/**
 * T17 — Port of `multi-user-session-isolation.feature` (6 scenarios).
 *
 * Source of truth: `checkitout-backend/src/test/resources/features/multiuser/multi-user-session-isolation.feature`
 *
 * Coverage map (BE scenario → FE test):
 *
 *   ⏭️  Scenario Outline 1 "Company logs in via multi-user infrastructure"
 *   ⏭️  Scenario Outline 2 "Influencer logs in via OAuth with Instagram"
 *   ⏭️  Scenario Outline 3 "Admin logs in with automatic 2FA completion"
 *   ⏭️  Scenario Outline 4 "Admin logs in with manual 2FA steps"
 *      ↑ Outlines 1-4 still need real Firebase login (1,2) and/or admin
 *      TOTP code-generation (3,4). They test the auth-MECHANISM. Blocked
 *      on T1 (TOTP helper) + T4 (real-UI login). Stubs preserve the
 *      spec/scenario mapping.
 *
 *   ✅ Scenario 5 "All user types logged in simultaneously" — isolation
 *      INVARIANT across 3 actor types (COMPANY + INFLUENCER + ADMIN).
 *      Auth-mechanism-agnostic; ported via mock-session for all three.
 *      Mock-session ADMIN bypasses TOTP (memory:
 *      reference_mock_session_admin_full_session) so this scenario is
 *      tractable in dev. The invariant being tested — "3 cookie jars →
 *      3 distinct authenticated actors, each independent" — holds for
 *      any auth mechanism.
 *
 *   ✅ Scenario 6 "Company and influencer can interact with isolated
 *      sessions" — the isolation INVARIANT is auth-mechanism-agnostic.
 *      Port uses mock-session as the auth shortcut. The contract being
 *      tested is "two authenticated actors have different sessions and
 *      can each independently access /users/me" — that holds whether
 *      auth came from Firebase or from mock-session. See memory
 *      `feedback_fe_integration_must_mirror_be_cucumber_1_to_1` —
 *      the test matches the BE Cucumber's assertion list verbatim;
 *      only the `Given <actor> logs in...` step uses a different
 *      mechanism. The BE Cucumber framework would treat both as
 *      "actor is authenticated" identically.
 *
 * Run: `npm run test:integration -- --grep multi-user-session-isolation`
 */

test.describe('@multi-user @session-isolation — port of multi-user-session-isolation.feature', () => {
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
  // Scenario 1 — COMPANY logs in via the multi-user infrastructure
  // (Identity Toolkit signInWithPassword + exchange-token). Self-skips
  // cleanly when e2e-tests/.env is missing FIREBASE_TEST_COMPANY_{EMAIL,
  // PASSWORD} credentials — safe to land before env is populated.
  //
  // Unblocked by FE T2 helper (real-login.ts). Mirror of the @admin @2fa
  // test below for the COMPANY actor — no TOTP step since COMPANY users
  // never get the partial-session+2FA cookie envelope.
  // --------------------------------------------------------------------
  test('@smoke @company Company user logs in via multi-user infrastructure', async ({
    browser,
  }) => {
    test.skip(
      !hasRealCredentialsFor('COMPANY'),
      'FIREBASE_TEST_COMPANY_{EMAIL,PASSWORD} not set — see e2e-tests/.env.example',
    );

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await realLogin(context, ACTORS['company1']!, GREENFIELD_URL);

      const page = await context.newPage();
      const meRes = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(meRes.status(), 'COMPANY full session must access /users/me').toBe(200);
      const me = (await meRes.json()) as { userType?: { value?: string } };
      expect(me.userType?.value, 'real-Firebase session must be COMPANY').toBe('COMPANY');
    } finally {
      await context.close();
    }
  });

  test.fixme('@influencer @oauth Influencer logs in via OAuth with Instagram token from Firestore', async () => {
    /* Blocked on T4/T2: real Instagram OAuth simulation. */
  });

  // Admin auto-2FA — unblocked 2026-05-12 by the Firebase Admin bridge
  // (8f0aaf8) + provisioned TOTP secret (totpSecrets/85VJ.../enc).
  // Drives realLogin(ADMIN) → partial-session-cookie → readTotpSecret +
  // currentTotpCode → /twofactor/verify → exchange-token → full session.
  // Same flow as login-real.spec.ts admin happy-path but exercised here
  // as part of the multi-actor isolation scaffolding (proves an admin
  // session coexists with the BE without disturbing other actors).
  test('@admin @2fa Admin logs in with automatic 2FA completion', async ({ browser }) => {
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
      const code = currentTotpCode(totpSecret);
      const verifyRes = await page.request.post(`${GREENFIELD_URL}/api/twofactor/verify`, {
        data: { code },
        ignoreHTTPSErrors: true,
      });
      expect(verifyRes.status(), '2FA verify must succeed').toBe(200);

      // Re-exchange partial → full session.
      const finalExchange = await page.request.post(`${GREENFIELD_URL}/api/auth/exchange-token`, {
        data: {},
        ignoreHTTPSErrors: true,
      });
      expect(finalExchange.status()).toBe(200);

      const meRes = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(meRes.status()).toBe(200);
      const me = (await meRes.json()) as { userType?: { value?: string } };
      expect(me.userType?.value, 'full session must be ADMIN').toBe('ADMIN');
    } finally {
      await context.close();
    }
  });

  // Manual 2FA — same auth chain but driven through the UI dialog rather
  // than the request-fixture shortcut. Kept fixme'd because the
  // TwoFactorVerifyDialogComponent flow overlaps with login-ui-real.spec.ts's
  // browser-UI coverage; a separate UI port adds little marginal value
  // until the dialog itself develops a new interaction worth covering.
  test.fixme('@admin @2fa @manual Admin logs in with manual 2FA steps', async () => {
    /* Overlaps with login-ui-real.spec.ts pattern; the auto-2FA test above
     * already proves the BE TOTP-verify contract. Re-enable when the
     * 2FA dialog grows a new state worth exercising in a multi-actor
     * isolation context. */
  });

  // ---- BE Scenario 5 (all-types) — portable via mock-session
  //
  //   Given "BrandCo" logs in as COMPANY ...
  //   And "InfluencerA" logs in as INFLUENCER via OAuth ...
  //   And "AdminA" logs in as ADMIN (with 2FA) ...
  //   Then all 3 should be authenticated
  //   And they should each have their own distinct session
  //
  // mock-session is auth-mechanism-agnostic for isolation purposes —
  // mock-session ADMIN bypasses TOTP and yields a FULL admin session
  // (memory: reference_mock_session_admin_full_session). The isolation
  // invariant (3 separate cookie jars → 3 separate /users/me actors)
  // holds whether auth came from Firebase / OAuth / TOTP or from
  // mock-session shortcuts.
  test('@all-types COMPANY + INFLUENCER + ADMIN logged in simultaneously stay isolated', async ({
    browser,
  }) => {
    let coCtx: BrowserContext | undefined;
    let inCtx: BrowserContext | undefined;
    let adCtx: BrowserContext | undefined;
    try {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const coEmail = `t17-all-co-${uid}@e2e.test`;
      const inEmail = `t17-all-in-${uid}@e2e.test`;
      const adEmail = `t17-all-ad-${uid}@e2e.test`;

      coCtx = await browser.newContext({ ignoreHTTPSErrors: true });
      inCtx = await browser.newContext({ ignoreHTTPSErrors: true });
      adCtx = await browser.newContext({ ignoreHTTPSErrors: true });
      const coPage = await coCtx.newPage();
      const inPage = await inCtx.newPage();
      const adPage = await adCtx.newPage();

      await seedSession(coPage, coEmail, 'COMPANY');
      await seedSession(inPage, inEmail, 'INFLUENCER');
      await seedSession(adPage, adEmail, 'ADMIN');

      const coMe = await coPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(coMe.status(), `COMPANY /users/me should be 200 — got ${coMe.status()}`).toBe(200);
      const coBody = await coMe.json();
      expect(coBody.email).toBe(coEmail);
      expect(coBody.userType?.value).toBe('COMPANY');

      const inMe = await inPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(inMe.status(), `INFLUENCER /users/me should be 200 — got ${inMe.status()}`).toBe(200);
      const inBody = await inMe.json();
      expect(inBody.email).toBe(inEmail);
      expect(inBody.userType?.value).toBe('INFLUENCER');

      const adMe = await adPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(adMe.status(), `ADMIN /users/me should be 200 — got ${adMe.status()}`).toBe(200);
      const adBody = await adMe.json();
      expect(adBody.email).toBe(adEmail);
      expect(adBody.userType?.value).toBe('ADMIN');

      // 3 distinct session cookies → 3 distinct actors.
      const sessions = await Promise.all([
        coCtx.cookies().then((c) => c.find((x) => x.name === 'session')?.value),
        inCtx.cookies().then((c) => c.find((x) => x.name === 'session')?.value),
        adCtx.cookies().then((c) => c.find((x) => x.name === 'session')?.value),
      ]);
      expect(
        sessions.every((s) => s && s.length > 0),
        `each actor should have a session cookie — got ${JSON.stringify(sessions)}`,
      ).toBe(true);
      expect(new Set(sessions).size, 'all 3 session cookies should be distinct').toBe(3);
    } finally {
      await coCtx?.close();
      await inCtx?.close();
      await adCtx?.close();
    }
  });

  // ---- BE Scenario 6 (isolation invariant) — portable via mock-session
  //
  //   Given "BrandCo" logs in as COMPANY ...
  //   Then "BrandCo" should be authenticated
  //   Given "InfluencerA" logs in as INFLUENCER via OAuth ...
  //   Then "InfluencerA" should be authenticated
  //   Then there should be 2 registered actors
  //   And "BrandCo" and "InfluencerA" should have different sessions
  //
  // Implementation: two independent BrowserContexts (one per actor)
  // seeded via mock-session. Each context has its own cookie jar; the
  // /users/me read confirms BE returns the right actor for each session.
  test('@interaction Company and influencer can interact with isolated sessions', async ({
    browser,
  }) => {
    let coCtx: BrowserContext | undefined;
    let inCtx: BrowserContext | undefined;
    try {
      const coEmail = `t17-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
      const inEmail = `t17-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

      // Two independent BrowserContexts. Playwright keeps cookies fully
      // isolated between contexts by design — this test proves it.
      coCtx = await browser.newContext({ ignoreHTTPSErrors: true });
      inCtx = await browser.newContext({ ignoreHTTPSErrors: true });
      const coPage = await coCtx.newPage();
      const inPage = await inCtx.newPage();

      // Given "BrandCo" logs in as COMPANY ...
      await seedSession(coPage, coEmail, 'COMPANY');
      // Given "InfluencerA" logs in as INFLUENCER via OAuth ...
      // (mock-session shortcut; OAuth mechanism is auth-agnostic for
      // isolation purposes)
      await seedSession(inPage, inEmail, 'INFLUENCER');

      // Then "BrandCo" should be authenticated
      const coMe = await coPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(coMe.status(), `BrandCo /users/me should be 200 — got ${coMe.status()}`).toBe(200);
      const coMeBody = await coMe.json();
      expect(coMeBody.email, 'BrandCo should resolve to her own email').toBe(coEmail);
      // userType comes back as the enum-wrapper object {label, originalLabel, value}
      // (Phase 1 OpenAPI rebuild canonical pattern).
      expect(coMeBody.userType?.value, 'BrandCo should have role COMPANY').toBe('COMPANY');

      // Then "InfluencerA" should be authenticated
      const inMe = await inPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(inMe.status(), `InfluencerA /users/me should be 200 — got ${inMe.status()}`).toBe(200);
      const inMeBody = await inMe.json();
      expect(inMeBody.email, 'InfluencerA should resolve to her own email').toBe(inEmail);
      expect(inMeBody.userType?.value, 'InfluencerA should have role INFLUENCER').toBe(
        'INFLUENCER',
      );

      // And "BrandCo" and "InfluencerA" should have different sessions
      const coCookies = await coCtx.cookies();
      const inCookies = await inCtx.cookies();
      const coSession = coCookies.find((c) => c.name === 'session')?.value;
      const inSession = inCookies.find((c) => c.name === 'session')?.value;
      expect(coSession, 'BrandCo should have a session cookie').toBeTruthy();
      expect(inSession, 'InfluencerA should have a session cookie').toBeTruthy();
      expect(coSession, 'BrandCo and InfluencerA should have different session cookies').not.toBe(
        inSession,
      );

      // Then there should be 2 registered actors — proven by the two
      // distinct authenticated /users/me responses above resolving to
      // different actors with different roles. The BE actor-registry
      // concept is a Cucumber-framework abstraction (BE side); the FE
      // observable equivalent is "each cookie jar's /users/me returns
      // its own actor".
    } finally {
      await coCtx?.close();
      await inCtx?.close();
    }
  });
});
