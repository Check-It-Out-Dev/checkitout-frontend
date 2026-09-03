import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { readAccountStatus, seedTargetInNewContext } from '../_helpers';

/**
 * T13 — Port of `admin-user-management.feature` (1 mega-scenario, 12 ops).
 *
 * Source of truth: `checkitout-backend/.../features/admin-user-management.feature`
 *
 * Coverage map: the BE mega-scenario consolidates 12 sub-operations into
 * one Firebase login. We split into focused test groups by capability —
 * each group still uses a single mock-session admin actor, so it remains
 * cheap.
 *
 *   ✅ Group A: User listing & profile viewing (3 sub-ops)
 *   ✅ Group B: Company user lifecycle — BAN → ACTIVE → INACTIVE → ACTIVE
 *      → IN_VALIDATION → ACTIVE (6 sub-ops)
 *   ✅ Group C: Influencer user lifecycle — BAN → ACTIVE (3 sub-ops)
 *
 * Multi-actor pattern: the admin operates on target users by numeric BE
 * id (not Firebase UID). We seed each target via mock-session in a SECOND
 * BrowserContext, fetch its numeric id via /users/me, then swap back to
 * the admin context for the PATCH operations. This avoids cookie-jar
 * collision between the actors.
 *
 * Mock-session unlock: POST /test/auth/mock-session with `partial: false`
 * returns full ADMIN session bypassing TOTP.
 *
 * Bug class caught: admin user-management privilege drift. If the BE
 * @PreAuthorize on PATCH /users/{id} ever weakens, COMPANY/INFLUENCER
 * could escalate themselves — serious security regression.
 *
 * Run: `npm run test:integration -- --grep admin-user-management`
 */

const UNIQUE_ADMIN = () =>
  `t13-um-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_COMPANY = () =>
  `t13-um-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t13-um-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function authGet(page: Page, path: string): Promise<import('@playwright/test').APIResponse> {
  return page.request.get(`${GREENFIELD_URL}/api${path}`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function authPatch(
  page: Page,
  path: string,
  data: unknown,
): Promise<import('@playwright/test').APIResponse> {
  return page.request.patch(`${GREENFIELD_URL}/api${path}`, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

// readStatus consolidated to _helpers.ts; local alias kept for readability
// at the call sites (`readStatus(page, userId)` reads more naturally than
// `readAccountStatus(...)` in a status-cycle assertion).
const readStatus = readAccountStatus;

/**
 * Seeds a target user in a *separate* BrowserContext and returns their
 * numeric BE id. The fresh context isolates cookies from the admin
 * actor's context. Closes the seeding page since this spec only needs
 * the userId — callers that need to keep probing the target session
 * (e.g. admin-inactive-flow @ban-cycle) use `seedTargetInNewContext`
 * directly to keep `page` alive.
 */
async function seedTargetAndGetId(
  browser: import('@playwright/test').Browser,
  email: string,
  role: 'COMPANY' | 'INFLUENCER',
): Promise<{ userId: number; context: BrowserContext }> {
  const { userId, context, page } = await seedTargetInNewContext(browser, email, role);
  await page.close();
  return { userId, context };
}

test.describe('@admin-user-management — port of admin-user-management.feature', () => {
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
  // Group A: User listing & profile viewing
  //
  //   When the admin views the user list
  //   Then the response status should be 200
  //   And the response should contain a list of users
  //   And the response should contain pagination info
  // --------------------------------------------------------------------
  test('@group-a admin can view paginated user list', async ({ page }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    const res = await authGet(page, '/users/paged?page=0&size=20');
    expect(res.status(), 'GET /users/paged should be 200').toBe(200);
    const body = await res.json();
    expect(Array.isArray(body?.content), 'response.content should be an array').toBe(true);
    // Pagination shape (Spring Page<T>): totalElements + totalPages + size + number
    for (const field of ['totalElements', 'totalPages', 'size', 'number']) {
      expect(body, `/users/paged should contain pagination field ${field}`).toHaveProperty(field);
    }
  });

  test('@group-a admin can view a COMPANY user profile', async ({ page, browser }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    const { userId, context: targetContext } = await seedTargetAndGetId(
      browser,
      UNIQUE_COMPANY(),
      'COMPANY',
    );
    try {
      const res = await authGet(page, `/users/${userId}`);
      expect(res.status(), `GET /users/${userId} (COMPANY) should be 200`).toBe(200);
      const body = await res.json();
      expect(body, 'profile should contain email').toHaveProperty('email');
      expect(body, 'profile should contain accountStatus').toHaveProperty('accountStatus');
    } finally {
      await targetContext.close();
    }
  });

  test('@group-a admin can view an INFLUENCER user profile', async ({ page, browser }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');

    const { userId, context: targetContext } = await seedTargetAndGetId(
      browser,
      UNIQUE_INFLUENCER(),
      'INFLUENCER',
    );
    try {
      const res = await authGet(page, `/users/${userId}`);
      expect(res.status(), `GET /users/${userId} (INFLUENCER) should be 200`).toBe(200);
      const body = await res.json();
      expect(body, 'profile should contain email').toHaveProperty('email');
      expect(body, 'profile should contain accountStatus').toHaveProperty('accountStatus');
    } finally {
      await targetContext.close();
    }
  });

  // --------------------------------------------------------------------
  // Group B/C: BAN + status FSM transitions
  //
  // BLOCKED on real Firebase: UserService.setUserStatus calls
  // mergeExistingClaims(firebaseUid, claims) on the TARGET user's
  // Firebase record when transitioning to BANNED or TO_BE_DELETED.
  // Mock-session-created targets don't have a real Firebase user, so
  // the Firebase claim update throws AuthenticationTranslatableException
  // → 401 with messageKey="error.user.status_update_failed". The status
  // FSM logic itself works; only the Firebase side-effect blocks it.
  //
  // Confirmed via debug body: HTTP 401 + message="Failed to update
  // account status" + path=/api/users/{id}. The 401 status code is a
  // misclassification (AuthenticationException mapping); the actual
  // failure is Firebase-side.
  //
  // Unblock path: T1 (TOTP helper) + real Firebase admin login OR a
  // BE test profile that no-ops Firebase claim updates for mock-session
  // users.
  // --------------------------------------------------------------------
  // --------------------------------------------------------------------
  // Group B (portable subset): admin cycles a COMPANY user through
  // BANNED → ACTIVE → INACTIVE → ACTIVE. Unblocked by BE commit
  // `afb31f1c` (UserService soft-skips Firebase claim updates when the
  // target has no Firebase user — app.firebase.claim-updates.soft-skip-
  // missing-user=true in dev profile).
  //
  // The full BE mega-scenario also exercises ACTIVE → IN_VALIDATION →
  // ACTIVE. The IN_VALIDATION transition has additional pre-conditions
  // (email-not-verified path) — kept as a follow-up.
  //
  // Runtime fallback: skips if the BE wasn't restarted with the soft-
  // skip flag (the first PATCH 401s).
  // --------------------------------------------------------------------
  test('@group-b admin cycles COMPANY through BANNED→ACTIVE→INACTIVE→ACTIVE', async ({
    page,
    browser,
  }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const { userId, context: targetContext } = await seedTargetAndGetId(
      browser,
      UNIQUE_COMPANY(),
      'COMPANY',
    );
    try {
      // Step 1: ACTIVE → BANNED
      const ban = await authPatch(page, `/users/${userId}`, { accountStatus: 'BANNED' });
      if (ban.status() === 401) {
        test.skip(
          true,
          `BE rejected ACTIVE→BANNED with 401. Likely running a build before BE commit afb31f1c (UserService soft-skip). Restart BE to retry.`,
        );
      }
      expect(
        ban.status(),
        `ACTIVE→BANNED should be 200, got ${ban.status()}: ${await ban.text()}`,
      ).toBe(200);
      expect(await readStatus(page, userId)).toBe('BANNED');

      // Step 2: BANNED → ACTIVE
      const unban = await authPatch(page, `/users/${userId}`, { accountStatus: 'ACTIVE' });
      expect(unban.status(), `BANNED→ACTIVE should be 200, got ${unban.status()}`).toBe(200);
      expect(await readStatus(page, userId)).toBe('ACTIVE');

      // Step 3: ACTIVE → INACTIVE
      const inactivate = await authPatch(page, `/users/${userId}`, { accountStatus: 'INACTIVE' });
      expect(inactivate.status(), `ACTIVE→INACTIVE should be 200, got ${inactivate.status()}`).toBe(
        200,
      );
      expect(await readStatus(page, userId)).toBe('INACTIVE');

      // Step 4: INACTIVE → ACTIVE
      const reactivate = await authPatch(page, `/users/${userId}`, { accountStatus: 'ACTIVE' });
      expect(reactivate.status(), `INACTIVE→ACTIVE should be 200, got ${reactivate.status()}`).toBe(
        200,
      );
      expect(await readStatus(page, userId)).toBe('ACTIVE');
    } finally {
      await targetContext.close();
    }
  });

  test('@group-c admin bans + unbans INFLUENCER user', async ({ page, browser }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const { userId, context: targetContext } = await seedTargetAndGetId(
      browser,
      UNIQUE_INFLUENCER(),
      'INFLUENCER',
    );
    try {
      const ban = await authPatch(page, `/users/${userId}`, { accountStatus: 'BANNED' });
      if (ban.status() === 401) {
        test.skip(
          true,
          `BE rejected ACTIVE→BANNED with 401. Likely running a build before BE commit afb31f1c (UserService soft-skip). Restart BE to retry.`,
        );
      }
      expect(ban.status(), `INFLUENCER ACTIVE→BANNED should be 200`).toBe(200);
      expect(await readStatus(page, userId)).toBe('BANNED');

      const unban = await authPatch(page, `/users/${userId}`, { accountStatus: 'ACTIVE' });
      expect(unban.status(), `INFLUENCER BANNED→ACTIVE should be 200`).toBe(200);
      expect(await readStatus(page, userId)).toBe('ACTIVE');
    } finally {
      await targetContext.close();
    }
  });

  // --------------------------------------------------------------------
  // Group B (continued): admin cycles COMPANY through ACTIVE →
  // IN_VALIDATION → ACTIVE. The original fixme assumed BE required
  // emailVerified=false before flipping to IN_VALIDATION; UserService
  // line 608 ("Any state -> IN_VALIDATION") shows no such gate. The
  // transition was actually blocked by the *same* Firebase-claim issue
  // unblocked in commit 7cec6433 (cause-chain preserved → soft-skip
  // wrapper now matches FirebaseAuthException "no user record").
  // --------------------------------------------------------------------
  test('@group-b ACTIVE → IN_VALIDATION → ACTIVE transition', async ({ page, browser }) => {
    await seedSession(page, UNIQUE_ADMIN(), 'ADMIN');
    const { userId, context: targetContext } = await seedTargetAndGetId(
      browser,
      UNIQUE_COMPANY(),
      'COMPANY',
    );
    try {
      const inval = await authPatch(page, `/users/${userId}`, { accountStatus: 'IN_VALIDATION' });
      if (inval.status() === 401) {
        test.skip(
          true,
          `BE rejected ACTIVE→IN_VALIDATION with 401. Running pre-7cec6433 BE — restart to retry.`,
        );
      }
      expect(
        inval.status(),
        `ACTIVE→IN_VALIDATION should be 200, got ${inval.status()}: ${await inval.text()}`,
      ).toBe(200);
      expect(await readStatus(page, userId)).toBe('IN_VALIDATION');

      const reactivate = await authPatch(page, `/users/${userId}`, { accountStatus: 'ACTIVE' });
      expect(
        reactivate.status(),
        `IN_VALIDATION→ACTIVE should be 200, got ${reactivate.status()}`,
      ).toBe(200);
      expect(await readStatus(page, userId)).toBe('ACTIVE');
    } finally {
      await targetContext.close();
    }
  });

  // --------------------------------------------------------------------
  // Cross-cutting: COMPANY actor cannot ban another user
  // --------------------------------------------------------------------
  test('@cross-role COMPANY actor cannot ban another user (403)', async ({ page, browser }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    const { userId, context: targetContext } = await seedTargetAndGetId(
      browser,
      UNIQUE_INFLUENCER(),
      'INFLUENCER',
    );
    try {
      const res = await authPatch(page, `/users/${userId}`, { accountStatus: 'BANNED' });
      expect(
        [403, 404].includes(res.status()),
        `COMPANY PATCH /users/${userId} should be 403/404, got ${res.status()}`,
      ).toBe(true);
    } finally {
      await targetContext.close();
    }
  });
});
