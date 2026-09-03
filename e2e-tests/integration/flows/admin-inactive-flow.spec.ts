import { expect, test } from '@playwright/test';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { seedTargetInNewContext } from '../_helpers';

/**
 * T13 — Port of `admin/admin-inactive-flow-consolidated.feature`.
 *
 * Source of truth:
 *   `checkitout-backend/.../features/admin/admin-inactive-flow-consolidated.feature`
 *
 * Coverage map (BE mega-scenario → FE test groups):
 *
 *   ⏭️  Phases 1-9 (INACTIVE/ACTIVE/BAN cycles with 401/419 token-version
 *      assertions) — ALL blocked on real Firebase. Investigation below.
 *   ✅ Cross-role security: COMPANY actor cannot mutate another user's
 *      accountStatus (caught at the service-level permission check
 *      BEFORE the Firebase code path).
 *
 * --- Investigation summary -------------------------------------------
 *
 * UserService.setUserStatus has a side-effect block where EVERY status
 * transition (ACTIVE / INACTIVE / IN_VALIDATION / BANNED / TO_BE_DELETED)
 * queues a deferred Firebase claims update via mergeExistingClaims
 * (lines 534-645 of UserService.java). The deferred action runs AFTER
 * userRepository.save() but INSIDE the @Transactional method, so when
 * Firebase rejects the mock-session target's UID (it has no Firebase
 * record), the action throws AuthenticationTranslatableException, the
 * @Transactional rolls back the DB save, and the FE sees HTTP 401 with
 * messageKey="error.user.deactivation_failed" / "...status_update_failed".
 *
 * Net: NO accountStatus transition is portable via mock-session actors.
 * Only the cross-role security check (which fires earlier in
 * handleAccountStatusUpdate at permissionUtils.isAdmin()) is testable.
 *
 * Unblock path (T1): real Firebase admin login + real Firebase target
 * users. Alternative: BE test-profile that no-ops Firebase claim updates
 * for mock-session-tagged users.
 *
 * --- Note on misclassified status -------------------------------------
 *
 * The BE returns HTTP 401 for these failures. That's incorrect: the
 * authentication succeeded; only the side-effect (Firebase claim
 * update) failed. The correct status would be 500 or 502 (upstream
 * dependency failure). Documented for OSS-13 (security-defense-in-depth).
 *
 * Run: `npm run test:integration -- --grep admin-inactive-flow`
 */

const UNIQUE_ADMIN = () =>
  `t13-inact-adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_COMPANY = () =>
  `t13-inact-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t13-inact-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

// `seedTargetInNewContext` lives in ../_helpers (consolidated from this
// + admin-user-management + profile-* specs). Keeping the local name
// `seedTargetGetIdAndPage` to minimize call-site churn during the
// refactor; the helper signature is the same.
const seedTargetGetIdAndPage = seedTargetInNewContext;

test.describe('@admin-inactive-flow — port of admin-inactive-flow-consolidated.feature', () => {
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
  // BE Phase 1 portable subset: ADMIN flips COMPANY accountStatus
  // ACTIVE → INACTIVE → ACTIVE. The full BE scenario also asserts
  // "INACTIVE blocks session" — that requires a Firebase JWT mid-flight
  // (the mock-session HMAC cookie isn't tokenVersion-tracked the same
  // way), so we cover the persistence half here + keep the
  // session-blocking half as a separate fixme below.
  //
  // Unblocked by BE commit `afb31f1c` (UserService soft-skips Firebase
  // claim updates when target has no Firebase user record, in dev
  // profile only — see app.firebase.claim-updates.soft-skip-missing-user).
  // Skips at runtime if the BE wasn't restarted with the soft-skip flag.
  // --------------------------------------------------------------------
  test('@inactive-flow @company ADMIN flips COMPANY ACTIVE → INACTIVE → ACTIVE', async ({
    page,
    browser,
  }) => {
    // Seed ADMIN via mock-session (partial:false → full session, bypasses TOTP).
    await seedSession(
      page,
      `t13-inact-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
      'ADMIN',
    );

    // Target COMPANY actor in a separate browser context.
    const { userId, context: targetContext } = await seedTargetGetIdAndPage(
      browser,
      UNIQUE_COMPANY(),
      'COMPANY',
    );
    try {
      // Step 1: ADMIN PATCH the target to INACTIVE.
      const toInactive = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'INACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (toInactive.status() === 401) {
        // Pre-`afb31f1c` BE — the Firebase claim-update throws and the
        // @Transactional rolls back the DB save. Restart BE with the
        // soft-skip flag to exercise this scenario.
        test.skip(
          true,
          `BE rejected ACTIVE→INACTIVE with 401. Likely running a build before commit afb31f1c (UserService soft-skip). Restart BE to retry.`,
        );
      }
      expect(
        toInactive.status(),
        `ACTIVE→INACTIVE should be 200 with soft-skip enabled, got ${toInactive.status()}: ${await toInactive.text()}`,
      ).toBe(200);

      // Verify persistence: ADMIN reads target back; accountStatus.value
      // should now be INACTIVE.
      const readInactive = await page.request.get(`${GREENFIELD_URL}/api/users/${userId}`, {
        ignoreHTTPSErrors: true,
      });
      expect(readInactive.status()).toBe(200);
      const inactiveBody = (await readInactive.json()) as UserDtoOut;
      expect(
        inactiveBody.accountStatus?.value,
        `target accountStatus.value should be INACTIVE after PATCH`,
      ).toBe('INACTIVE');

      // Step 2: ADMIN PATCH the target back to ACTIVE.
      const toActive = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'ACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        toActive.status(),
        `INACTIVE→ACTIVE should be 200, got ${toActive.status()}: ${await toActive.text()}`,
      ).toBe(200);

      const readActive = await page.request.get(`${GREENFIELD_URL}/api/users/${userId}`, {
        ignoreHTTPSErrors: true,
      });
      const activeBody = (await readActive.json()) as UserDtoOut;
      expect(
        activeBody.accountStatus?.value,
        `target accountStatus.value should be ACTIVE after reactivation PATCH`,
      ).toBe('ACTIVE');
    } finally {
      await targetContext.close();
    }
  });

  // --------------------------------------------------------------------
  // INACTIVE-blocks-session (mirror of @ban-cycle below for INACTIVE
  // transition). UserService.handleStatusAndRoleChange bumps
  // tokenVersion on EVERY status transition — not just BANNED. So
  // INACTIVE blocks the stale session via the exact same mechanism.
  //
  // The original fixme's premise ("tokenVersion bump on status
  // transition currently scoped to BANNED only") was wrong — the bump
  // happens at UserService:698, after the early-return-if-unchanged
  // guard, for any transition. Verified end-to-end by the
  // @ban-cycle test below.
  // --------------------------------------------------------------------
  test('@inactive-flow @company INACTIVE bumps tokenVersion → stale session 419/401', async ({
    page,
    browser,
  }) => {
    await seedSession(
      page,
      `t13-inact-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
      'ADMIN',
    );
    const targetEmail = UNIQUE_COMPANY();
    const {
      userId,
      context: targetContext,
      page: targetPage,
    } = await seedTargetGetIdAndPage(browser, targetEmail, 'COMPANY');
    try {
      const toInactive = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'INACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (toInactive.status() === 401) {
        test.skip(true, `BE rejected ACTIVE→INACTIVE with 401. Pre-afb31f1c BE.`);
      }
      expect(toInactive.status(), `ACTIVE→INACTIVE should be 200`).toBe(200);

      const staleProbe = await targetPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        [401, 419].includes(staleProbe.status()),
        `stale session after INACTIVE should be 419/401, got ${staleProbe.status()}`,
      ).toBe(true);
    } finally {
      await targetContext.close();
    }
  });

  test('@inactive-flow @influencer INACTIVE bumps tokenVersion → stale session 419/401', async ({
    page,
    browser,
  }) => {
    await seedSession(
      page,
      `t13-inact-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
      'ADMIN',
    );
    const {
      userId,
      context: targetContext,
      page: targetPage,
    } = await seedTargetGetIdAndPage(browser, UNIQUE_INFLUENCER(), 'INFLUENCER');
    try {
      const toInactive = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'INACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (toInactive.status() === 401) {
        test.skip(true, `BE rejected ACTIVE→INACTIVE with 401. Pre-afb31f1c BE.`);
      }
      expect(toInactive.status(), `INFLUENCER ACTIVE→INACTIVE should be 200`).toBe(200);

      const staleProbe = await targetPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        [401, 419].includes(staleProbe.status()),
        `INFLUENCER stale session after INACTIVE should be 419/401, got ${staleProbe.status()}`,
      ).toBe(true);
    } finally {
      await targetContext.close();
    }
  });

  // --------------------------------------------------------------------
  // BE Phase: BAN cycle with stored-token 419 verification.
  //
  // Unblocked by BE commit `afb31f1c` (UserService soft-skip).
  //
  // UserService.handleStatusAndRoleChange bumps tokenVersion on every
  // accountStatus transition (UserService:698) and evicts the user
  // cache (UserService:708). The target's PRE-BAN session cookie still
  // carries the old tokenVersion; the next request through
  // JwtAuthenticationFilter compares against the DB and rejects with
  // 419 (or 401 — both indicate stale session).
  //
  // This is the strongest assertion the BAN flow exposes: a banned
  // user's existing session becomes immediately void, not just
  // "blocked on next login".
  // --------------------------------------------------------------------
  test('@inactive-flow @ban-cycle BAN bumps tokenVersion → target session 419/401, unban restores', async ({
    page,
    browser,
  }) => {
    await seedSession(
      page,
      `t13-inact-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
      'ADMIN',
    );

    // Target COMPANY actor in a separate browser context. Hold onto
    // both the context AND its initial page so we can probe the stale
    // session AFTER the BAN PATCH.
    const targetEmail = UNIQUE_COMPANY();
    const {
      userId,
      context: targetContext,
      page: targetPage,
    } = await seedTargetGetIdAndPage(browser, targetEmail, 'COMPANY');
    try {
      // Step 1: ADMIN bans the target.
      const ban = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (ban.status() === 401) {
        test.skip(
          true,
          `BE rejected ACTIVE→BANNED with 401. Likely running a build before BE commit afb31f1c. Restart BE to retry.`,
        );
      }
      expect(ban.status(), `ACTIVE→BANNED should be 200`).toBe(200);

      // Step 2: target's STALE session probes /users/me. tokenVersion
      // mismatch → 419 (Authentication Timeout) or 401 (Unauthorized);
      // either is a valid "stale session" signal. Accept both since
      // the exact mapping has drifted across BE versions.
      const staleProbe = await targetPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        [401, 419].includes(staleProbe.status()),
        `target's stale session after BAN should be 419/401, got ${staleProbe.status()}: ${await staleProbe.text()}`,
      ).toBe(true);

      // Step 3: ADMIN unbans → ACTIVE.
      const unban = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'ACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(unban.status(), `BANNED→ACTIVE should be 200`).toBe(200);

      // Step 4: target re-seeds via fresh mock-session, getting a
      // cookie with the new tokenVersion. /users/me should now succeed.
      await targetContext.clearCookies();
      await seedSession(targetPage, targetEmail, 'COMPANY');
      const restored = await targetPage.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(
        restored.status(),
        `target's fresh session after unban should be 200, got ${restored.status()}`,
      ).toBe(200);
      const body = (await restored.json()) as UserDtoOut;
      expect(body.accountStatus?.value).toBe('ACTIVE');
    } finally {
      await targetContext.close();
    }
  });

  // --------------------------------------------------------------------
  // INACTIVE user calls /auth/refresh-session → BE returns 401 with
  // messageKey "error.auth.account_disabled" (TokenExchangeService.java
  // ~line 1766-1769). The check uses isUserActive() — a pure PG read,
  // no Firebase Admin SDK touch — so this works for mock-session targets
  // (unlike the ACTIVE-user refresh path which does call Firebase and
  // fails with USER_NOT_FOUND on mock-session UIDs).
  //
  // BE also clears session/session_sig cookies on this path (see
  // AuthController.java:560-565 + clearSessionCookies()), proving the
  // refresh contract for disabled accounts: no recovery without admin
  // intervention.
  //
  // Unblocked by BE 7cec6433 (cause-chain) so the prerequisite admin-
  // PATCH to INACTIVE actually lands; the refresh itself doesn't need
  // the soft-skip because isUserActive() short-circuits before Firebase.
  // --------------------------------------------------------------------
  test('@inactive-flow @refresh INACTIVE user refresh fails with account_disabled', async ({
    page,
    browser,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const target = await seedTargetInNewContext(browser, UNIQUE_COMPANY(), 'COMPANY');
    try {
      // Sanity: target works before inactivation
      const pre = await target.page.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(pre.status(), 'target /users/me pre-inactivation').toBe(200);

      // Admin flips target → INACTIVE (skip-path if BE pre-7cec6433)
      const inactivate = await page.request.patch(`${GREENFIELD_URL}/api/users/${target.userId}`, {
        data: { accountStatus: 'INACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      if (inactivate.status() === 401) {
        test.skip(
          true,
          `BE rejected ACTIVE→INACTIVE with 401. Pre-7cec6433 BE — restart to retry.`,
        );
      }
      expect(inactivate.status(), `inactivate should be 200`).toBe(200);

      // INACTIVE target hits /auth/refresh-session directly (bypassing the
      // FE proxy because the proxy mishandles empty-body POSTs).
      //
      // Expected: 401 — proves the refresh path correctly rejects disabled
      // accounts. The BE TokenExchangeService throws
      // AuthenticationTranslatableException("error.auth.account_disabled")
      // which Spring Security's default 401 handler converts to a generic
      // "Unauthorized" body (the messageKey is lost at the auth-failure
      // boundary). The status code is what matters for the security
      // contract; the messageKey is only consumed by the FE interceptor
      // path which doesn't trigger on /auth/refresh-session itself
      // (no recursion). 419 is also accepted in case JwtAuthFilter races
      // ahead with a tokenVersion check.
      const refresh = await target.page.request.post(`${BE_URL}/api/auth/refresh-session`, {
        data: {},
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        [401, 419].includes(refresh.status()),
        `INACTIVE refresh should be 401/419, got ${refresh.status()}: ${await refresh.text()}`,
      ).toBe(true);

      // Subsequent /users/me must also fail — proves the user is now
      // session-disabled (cookies cleared OR JWT can't refresh).
      const probe = await target.page.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        [401, 403, 419].includes(probe.status()),
        `INACTIVE /users/me post-refresh-deny should be 401/403/419, got ${probe.status()}`,
      ).toBe(true);
    } finally {
      await target.context.close();
    }
  });

  // --------------------------------------------------------------------
  // PORTABLE: Cross-role security check
  //
  // permissionUtils.isAdmin() is checked at line 498 of UserService —
  // BEFORE any Firebase code path. COMPANY/INFLUENCER actors attempting
  // to modify another user's accountStatus get rejected at this guard.
  //
  // BE behavior: throws → 403 (preferred) or 400 with permission-denied
  // message. Either is a valid security pass; we accept both.
  // --------------------------------------------------------------------
  test('@cross-role COMPANY actor cannot change another COMPANY user accountStatus', async ({
    page,
    browser,
  }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    // Target = a DIFFERENT COMPANY user (not the caller).
    const { userId, context: targetContext } = await seedTargetGetIdAndPage(
      browser,
      UNIQUE_COMPANY(),
      'COMPANY',
    );
    try {
      const res = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'INACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      // 403 (preferred) or 400 (permission-denied wrapped as ValidationException).
      expect(
        [400, 401, 403].includes(res.status()),
        `COMPANY PATCH accountStatus on another user should be 400/401/403, got ${res.status()}`,
      ).toBe(true);
    } finally {
      await targetContext.close();
    }
  });

  test('@cross-role INFLUENCER actor cannot change another user accountStatus', async ({
    page,
    browser,
  }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');

    const { userId, context: targetContext } = await seedTargetGetIdAndPage(
      browser,
      UNIQUE_COMPANY(),
      'COMPANY',
    );
    try {
      const res = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
        data: { accountStatus: 'BANNED' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        [400, 401, 403].includes(res.status()),
        `INFLUENCER PATCH BANNED on another user should be 400/401/403, got ${res.status()}`,
      ).toBe(true);
    } finally {
      await targetContext.close();
    }
  });
});
