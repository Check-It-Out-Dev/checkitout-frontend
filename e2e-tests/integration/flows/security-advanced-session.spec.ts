import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { seedTargetInNewContext } from '../_helpers';
import { hasRealCredentialsFor, realLogin } from '../../_framework/real-login';
import { ACTORS } from '../../_framework/actor';

/**
 * T14 — Port of `security-advanced-session.feature` (partial).
 *
 * Source of truth: `checkitout-backend/.../features/security-advanced-session.feature`
 *
 * Coverage map (9 BE Cucumber scenarios → coverage status):
 *
 *   ✅ Scenario 1: Cookie content tampering + wrong HMAC sig → 401.
 *   ✅ Scenario 2: Cross-user session cookie injection succeeds (200).
 *      Documented security note: cross-user cookies are NOT blocked
 *      by HMAC alone — security relies on preventing cookie theft.
 *   ⏭️  Scenario 3: User-Agent mismatch — @requires-ua-validation gate
 *      (BE feature flag). The session fingerprint check needs to be
 *      enabled in BE config; off by default in dev.
 *   ⏭️  Scenario 4: GeoIP impossible travel — @requires-geoip gate.
 *      Needs IP spoofing endpoint; production uses real client IP.
 *   ⏭️  Scenarios 5-9: ban/unban + token-version 419 cycles — all
 *      blocked on Firebase claim updates (mock-session targets have
 *      no Firebase record). Same blocker as admin-user-management
 *      group-b/c and admin-inactive-flow phases 1-9.
 *
 * Bug class caught: HMAC signature-validation regression. If the BE
 * ever skips signature verification or accepts a default/empty sig,
 * attackers could forge sessions trivially — full account takeover
 * for any known session ID. This spec catches that bypass directly.
 *
 * Run: `npm run test:integration -- --grep security-advanced-session`
 */

const UNIQUE_ADMIN = () =>
  `t14-sec-adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_COMPANY = () =>
  `t14-sec-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t14-sec-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function api(page: Page, path: string): Promise<APIResponse> {
  return page.request.get(`${GREENFIELD_URL}/api${path}`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

test.describe('@security-advanced-session — port of security-advanced-session.feature', () => {
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
  // Scenario 1: Cookie security — content tampering + HMAC forgery
  // --------------------------------------------------------------------
  test('@scenario-1 @cookie-tamper modified session cookie content returns 401', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    // Sanity: session works before tampering
    const sanity = await api(page, '/users/me');
    expect(sanity.status(), 'session should be valid pre-tamper').toBe(200);

    // Tamper: corrupt the session cookie value while keeping the _sig intact.
    // The BE recomputes HMAC over session-value+secret and compares to _sig.
    // Mismatched HMAC → 401.
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === 'session');
    expect(session, 'session cookie must exist before tampering').toBeDefined();
    if (session) {
      await page.context().addCookies([
        {
          name: 'session',
          value: session.value + 'TAMPERED',
          domain: session.domain,
          path: session.path,
          secure: session.secure,
          httpOnly: session.httpOnly,
          sameSite: session.sameSite,
        },
      ]);
    }

    const tampered = await api(page, '/users/me');
    expect(
      tampered.status(),
      `tampered session should be 401, got ${tampered.status()}: ${await tampered.text()}`,
    ).toBe(401);
  });

  test('@scenario-1 @hmac-forgery wrong sig cookie returns 401', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    // Forge: replace ONLY the _sig cookie with a fabricated HMAC.
    // The session cookie is still valid; the BE recomputes HMAC and rejects
    // since the supplied sig won't match.
    const cookies = await page.context().cookies();
    const sig = cookies.find((c) => c.name === 'session_sig');
    expect(sig, 'session_sig cookie must exist').toBeDefined();
    if (sig) {
      await page.context().addCookies([
        {
          name: 'session_sig',
          value: 'forged-signature-attacker-guess',
          domain: sig.domain,
          path: sig.path,
          secure: sig.secure,
          httpOnly: sig.httpOnly,
          sameSite: sig.sameSite,
        },
      ]);
    }

    const forged = await api(page, '/users/me');
    expect(forged.status(), `wrong-sig request should be 401, got ${forged.status()}`).toBe(401);
  });

  // --------------------------------------------------------------------
  // Scenario 2: Cross-user cookie injection
  //
  // Documents the SECURITY MODEL: HMAC alone doesn't detect a stolen
  // valid cookie. Security relies on preventing cookie theft at the
  // transport layer (HttpOnly + Secure + SameSite=Lax + HTTPS).
  // --------------------------------------------------------------------
  test('@scenario-2 @cross-user another users valid cookies are accepted (200, by design)', async ({
    browser,
  }) => {
    // Two completely isolated contexts; both get valid sessions.
    const companyContext: BrowserContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const companyPage: Page = await companyContext.newPage();
    const influencerContext: BrowserContext = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const influencerPage: Page = await influencerContext.newPage();

    try {
      await seedSession(companyPage, UNIQUE_COMPANY(), 'COMPANY');
      await seedSession(influencerPage, UNIQUE_INFLUENCER(), 'INFLUENCER');

      // Verify both work independently
      expect((await api(companyPage, '/users/me')).status()).toBe(200);
      expect((await api(influencerPage, '/users/me')).status()).toBe(200);

      // Copy influencer's cookies into a NEW third context, hit /users/me there.
      // (Can't overwrite cookies in the company context cleanly because the
      // browser merges instead of replacing. Use a fresh context with
      // ONLY the influencer's session.)
      const infCookies = await influencerContext.cookies();
      const sessionCookies = infCookies.filter(
        (c) => c.name === 'session' || c.name === 'session_sig',
      );
      expect(sessionCookies.length, 'should have session + session_sig').toBeGreaterThanOrEqual(2);

      const attackerContext = await browser.newContext({ ignoreHTTPSErrors: true });
      const attackerPage = await attackerContext.newPage();
      try {
        await attackerContext.addCookies(
          sessionCookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
          })),
        );

        // The cookies are still cryptographically valid — BE accepts them.
        // This is the documented security model (HMAC validates the cookie,
        // not the holder of the cookie).
        const stolenRes = await api(attackerPage, '/users/me');
        expect(
          stolenRes.status(),
          `stolen valid cookies should return 200 by design (HMAC validates cookie, not holder), got ${stolenRes.status()}`,
        ).toBe(200);
      } finally {
        await attackerContext.close();
      }
    } finally {
      await companyContext.close();
      await influencerContext.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenarios 3-9: Blocked
  // --------------------------------------------------------------------
  test.fixme('@scenario-3 @ua-mismatch different User-Agent terminates the session', () => {
    /* @requires-ua-validation BE feature flag. Session fingerprint check
     * is off by default in dev profile. Toggle requires BE config change. */
  });

  test.fixme('@scenario-4 @impossible-travel country jump within 60min returns 401', () => {
    /* @requires-geoip BE feature flag. Production uses real client IP; the
     * test needs IP-spoofing per-request which isn't supported through the
     * dev BE filter chain without a separate test endpoint. */
  });

  // --------------------------------------------------------------------
  // Scenario 5: Admin bans COMPANY + INFLUENCER; banned users get rejected.
  //
  // Unblocked by BE 7cec6433 — the deferred Firebase-claim lambdas now
  // preserve the FirebaseAuthException cause, so the afb31f1c soft-skip
  // wrapper triggers for mock-session targets (no Firebase user record).
  //
  // BE response: 419 (tokenVersion mismatch). UserService.updateAccountStatus
  // calls user.incrementTokenVersion() AFTER applying the ban (line 698),
  // which means the banned user's existing JWT (with the OLD tokenVersion)
  // is invalidated on its next request. This collapses scenarios 5 + 6
  // into a single observable: ban → next request returns 419. The original
  // fixme assumed 403; that was a misread of the BE invalidation mechanism.
  // --------------------------------------------------------------------
  test('@scenario-5 @user-ban admin bans COMPANY + INFLUENCER, banned users denied', async ({
    page,
    browser,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    const co = await seedTargetInNewContext(browser, UNIQUE_COMPANY(), 'COMPANY');
    const inf = await seedTargetInNewContext(browser, UNIQUE_INFLUENCER(), 'INFLUENCER');
    try {
      // Sanity: both targets work before the ban
      expect((await api(co.page, '/users/me')).status(), 'COMPANY pre-ban').toBe(200);
      expect((await api(inf.page, '/users/me')).status(), 'INFLUENCER pre-ban').toBe(200);

      const banCo = await page.request.patch(`${GREENFIELD_URL}/api/users/${co.userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (banCo.status() === 401) {
        test.skip(true, `BE rejected ACTIVE→BANNED with 401. Pre-7cec6433 BE — restart to retry.`);
      }
      expect(banCo.status(), `COMPANY ban should be 200, got ${banCo.status()}`).toBe(200);

      const banInf = await page.request.patch(`${GREENFIELD_URL}/api/users/${inf.userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(banInf.status(), `INFLUENCER ban should be 200, got ${banInf.status()}`).toBe(200);

      // Ban mechanism: tokenVersion was bumped by the BE; existing sessions
      // get 419. We accept 401/403/419 as proof the ban invalidated the session.
      const coDenied = (await api(co.page, '/users/me')).status();
      expect(
        [401, 403, 419].includes(coDenied),
        `COMPANY post-ban should be 401/403/419, got ${coDenied}`,
      ).toBe(true);

      const infDenied = (await api(inf.page, '/users/me')).status();
      expect(
        [401, 403, 419].includes(infDenied),
        `INFLUENCER post-ban should be 401/403/419, got ${infDenied}`,
      ).toBe(true);
    } finally {
      await co.context.close();
      await inf.context.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenario 6: After admin ban, the next request MUST return 419 (not
  // an arbitrary 401) because the BE mechanism is tokenVersion-bump,
  // not session-cookie-clear. Mock-session JWTs DO carry tokenVersion
  // — earlier assumption ("Firebase-JWT specific") was wrong.
  // --------------------------------------------------------------------
  test('@scenario-6 @token-version 419 after admin ban', async ({ page, browser }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const target = await seedTargetInNewContext(browser, UNIQUE_COMPANY(), 'COMPANY');
    try {
      expect((await api(target.page, '/users/me')).status(), 'pre-ban').toBe(200);

      const ban = await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (ban.status() === 401) {
        test.skip(true, `BE rejected ban with 401 (pre-7cec6433). Restart BE to retry.`);
      }
      expect(ban.status(), `ban should be 200`).toBe(200);

      const postBan = (await api(target.page, '/users/me')).status();
      expect(postBan, `post-ban must be 419 (tokenVersion bump), got ${postBan}`).toBe(419);
    } finally {
      await target.context.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenario 7: Full ban → 419 → unban → re-issue → ACTIVE cycle.
  //
  // After admin unban, the user's OLD JWT is still invalid (tokenVersion
  // was bumped twice — once by ban, once by unban). Real users would hit
  // the silent-refresh path; in mock-session we simulate the refresh by
  // re-seeding the session, which produces a JWT with the current
  // tokenVersion. Then /users/me returns 200 again.
  // --------------------------------------------------------------------
  test('@scenario-7 @session-lifecycle full ban-refresh-unban cycle', async ({ page, browser }) => {
    const targetEmail = UNIQUE_COMPANY();
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const target = await seedTargetInNewContext(browser, targetEmail, 'COMPANY');
    try {
      expect((await api(target.page, '/users/me')).status(), 'pre-ban').toBe(200);

      // Step 1: ban
      const ban = await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (ban.status() === 401) {
        test.skip(true, `BE rejected ban with 401 (pre-7cec6433). Restart BE to retry.`);
      }
      expect(ban.status(), `ban should be 200`).toBe(200);
      expect((await api(target.page, '/users/me')).status(), 'post-ban must be 419').toBe(419);

      // Step 2: unban
      const unban = await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'ACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(unban.status(), `unban should be 200`).toBe(200);
      // OLD JWT still has the pre-ban tokenVersion → 419 even after unban
      expect(
        (await api(target.page, '/users/me')).status(),
        'old JWT post-unban still 419 (tokenVersion bumped twice)',
      ).toBe(419);

      // Step 3: simulate silent refresh — re-seed mock-session for the same
      // email, which issues a fresh JWT with the current tokenVersion.
      await target.page.context().clearCookies();
      await seedSession(target.page, targetEmail, 'COMPANY');
      expect(
        (await api(target.page, '/users/me')).status(),
        'after refresh, ACTIVE user can access /users/me',
      ).toBe(200);
    } finally {
      await target.context.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenario 8: Old JWTs stay blocked across multiple ban/unban cycles.
  //
  // tokenVersion is monotonically incrementing. A captured pre-ban JWT
  // remains 419 forever after any status change — even after the user
  // is re-activated and gets a NEW JWT. This proves the replay-resistance
  // property: stolen-or-leaked old JWTs can never be used post-ban.
  // --------------------------------------------------------------------
  test('@scenario-8 @token-version old tokens blocked across multiple ban/unban cycles', async ({
    page,
    browser,
  }) => {
    const targetEmail = UNIQUE_COMPANY();
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const target = await seedTargetInNewContext(browser, targetEmail, 'COMPANY');
    try {
      expect((await api(target.page, '/users/me')).status()).toBe(200);

      // Capture the pre-ban JWT cookies — these represent a "stolen old token"
      const stolenCookies = (await target.context.cookies()).filter(
        (c) => c.name === 'session' || c.name === 'session_sig',
      );
      expect(stolenCookies.length, 'should capture session + session_sig').toBeGreaterThanOrEqual(
        2,
      );

      // Cycle 1: ban → unban
      const ban1 = await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (ban1.status() === 401) {
        test.skip(true, `BE rejected ban with 401 (pre-7cec6433). Restart BE to retry.`);
      }
      expect(ban1.status()).toBe(200);
      await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'ACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });

      // Cycle 2: ban → unban
      await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'ACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });

      // Replay the stolen old JWT in a fresh attacker context — must STILL be 419
      const attackerContext = await browser.newContext({ ignoreHTTPSErrors: true });
      const attackerPage = await attackerContext.newPage();
      try {
        await attackerContext.addCookies(
          stolenCookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
          })),
        );
        const replayed = (await api(attackerPage, '/users/me')).status();
        expect(
          replayed,
          `stolen pre-ban JWT must be 419 even after 2 unban cycles, got ${replayed}`,
        ).toBe(419);
      } finally {
        await attackerContext.close();
      }
    } finally {
      await target.context.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenario 7 (production-path variant): same ban-refresh-unban cycle but
  // exercising the REAL prod endpoint POST /api/auth/refresh-session.
  //
  // BLOCKED: TokenExchangeService.createRefreshedSession calls the Firebase
  // Admin SDK on the user's firebaseUid. Mock-session users have a synthetic
  // firebaseUid (e.g. "E2E_COMPANY_1234") with no real Firebase Auth record,
  // so the SDK throws USER_NOT_FOUND → BE returns 502 "Firebase is
  // temporarily unavailable".
  //
  // The afb31f1c soft-skip wrapper only covers UserService.patch/update
  // deferred actions. Extending it to refresh-session is bigger BE work:
  // either (a) extract the wrapper as a shared infrastructure utility and
  // apply at TokenExchangeService Firebase touchpoints, or (b) use the
  // real-login.ts path so the test runs against a true Firebase user.
  //
  // The mock-session re-seed in @scenario-7 above proves the refresh
  // CONTRACT (new tokenVersion → 200) without exercising the production
  // endpoint. This variant stays fixme until the BE soft-skip extends.
  // --------------------------------------------------------------------
  // Real-Firebase variant — drives signInWithPassword → exchange-token →
  // full session for a real Firebase user. Then admin (separate context)
  // bans via PATCH; the refresh-session call now succeeds because the
  // target HAS a Firebase Auth record — no USER_NOT_FOUND.
  //
  // Self-skips cleanly if FIREBASE_TEST_COMPANY_{EMAIL,PASSWORD} are
  // missing from e2e-tests/.env. Safe to land before env populated.
  test('@scenario-7-prod @session-lifecycle production refresh-session against real Firebase user', async ({
    page,
    browser,
  }) => {
    test.skip(
      !hasRealCredentialsFor('COMPANY'),
      'FIREBASE_TEST_COMPANY_{EMAIL,PASSWORD} not set — see e2e-tests/.env.example',
    );

    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    const targetContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await realLogin(targetContext, ACTORS['company1']!, GREENFIELD_URL);
      const targetPage = await targetContext.newPage();

      const meRes = await targetPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(meRes.status(), 'pre-ban /users/me must succeed').toBe(200);
      const me = (await meRes.json()) as { id?: number };
      expect(typeof me.id, 'real-Firebase user has numeric id').toBe('number');

      // Admin bans → tokenVersion bumps; target's JWT becomes stale
      const ban = await page.request.patch(`${GREENFIELD_URL}/api/users/${me.id}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (ban.status() === 401) {
        test.skip(true, `BE rejected ban with 401 (pre-7cec6433). Restart BE to retry.`);
      }
      expect(ban.status(), 'ban must succeed').toBe(200);

      expect(
        (
          await targetPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
            ignoreHTTPSErrors: true,
            failOnStatusCode: false,
          })
        ).status(),
        'post-ban /users/me must be 419',
      ).toBe(419);

      // Production refresh path. BANNED user → 401 + cookies cleared.
      const refreshBanned = await targetPage.request.post(`${BE_URL}/api/auth/refresh-session`, {
        data: {},
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        refreshBanned.status(),
        `refresh for BANNED user must be 401, got ${refreshBanned.status()}`,
      ).toBe(401);

      // Admin unbans → tokenVersion bumps again. Target now ACTIVE.
      const unban = await page.request.patch(`${GREENFIELD_URL}/api/users/${me.id}`, {
        data: { accountStatus: 'ACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(unban.status(), 'unban must succeed').toBe(200);

      // Re-login: BANNED refresh cleared cookies, so we need a fresh session
      await realLogin(targetContext, ACTORS['company1']!, GREENFIELD_URL);

      expect(
        (
          await targetPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
            ignoreHTTPSErrors: true,
          })
        ).status(),
        'after re-login post-unban, /users/me must be 200',
      ).toBe(200);
    } finally {
      await targetContext.close();
    }
  });

  // --------------------------------------------------------------------
  // Scenario 9: ACTIVE → IN_VALIDATION transition also bumps tokenVersion
  // (UserService.updateAccountStatus increments unconditionally on ANY
  // status change at line 698). Same observable as scenario 6 with a
  // different transition.
  // --------------------------------------------------------------------
  test('@scenario-9 @token-version IN_VALIDATION transition increments tokenVersion', async ({
    page,
    browser,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const target = await seedTargetInNewContext(browser, UNIQUE_COMPANY(), 'COMPANY');
    try {
      expect((await api(target.page, '/users/me')).status(), 'pre-transition').toBe(200);

      const inval = await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'IN_VALIDATION' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (inval.status() === 401) {
        test.skip(true, `BE rejected IN_VALIDATION with 401 (pre-7cec6433). Restart BE to retry.`);
      }
      expect(inval.status(), `IN_VALIDATION should be 200`).toBe(200);

      const postInval = (await api(target.page, '/users/me')).status();
      expect(
        postInval,
        `post-IN_VALIDATION must be 419 (tokenVersion bump), got ${postInval}`,
      ).toBe(419);
    } finally {
      await target.context.close();
    }
  });
});
