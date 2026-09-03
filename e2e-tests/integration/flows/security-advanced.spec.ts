import { expect, test, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { getMyId as getMyUserId } from '../_helpers';

/**
 * T23 — Port of `security-advanced.feature` (3 scenarios).
 *
 * Source of truth: `checkitout-backend/.../features/security-advanced.feature`
 *
 * Coverage map (BE scenario → FE test):
 *
 *   ✅ Scenario 1 "COMPANY owner-based GDPR — other-user 403, self 200"
 *   ✅ Scenario 2 "INFLUENCER owner-based GDPR — other-user 403, self 200"
 *   ✅ Scenario 3 "ADMIN 2FA partial-session denied / full-session allowed"
 *      → unblocked via mock-session's partial flag — `{role:"ADMIN",
 *      partial:true}` issues a partialSession cookie (pre-2FA state)
 *      while `{partial:false}` issues a full session (post-2FA).
 *      No real Firebase / TOTP code-gen needed for the
 *      authorization-shape verification.
 *
 * Bug class caught: owner-based authorization drift on /gdpr/location/*.
 * The BE enforces "user can only access their own GDPR data" via the
 * controller-level @PreAuthorize check. If that check breaks, users
 * could access each other's location export — serious RODO violation.
 *
 * Run: `npm run test:integration -- --grep security-advanced`
 */

const UNIQUE_COMPANY = () =>
  `t23-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t23-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function authGet(page: Page, path: string): Promise<import('@playwright/test').APIResponse> {
  return page.request.get(`${GREENFIELD_URL}/api${path}`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function authDelete(
  page: Page,
  path: string,
): Promise<import('@playwright/test').APIResponse> {
  return page.request.delete(`${GREENFIELD_URL}/api${path}`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

test.describe('@security-advanced — port of security-advanced.feature', () => {
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
  // BE Scenario 1: "COMPANY security restrictions - owner-based GDPR"
  //
  //   When "company1" GET /gdpr/location/export/user/999999 → 403
  //   When "company1" GET /gdpr/location/retention/user/999999 → 403
  //   When "company1" DELETE /gdpr/location/user/999999 → 403
  //   When "company1" GET /gdpr/location/export/user/{ownId} → 200
  //   When "company1" GET /gdpr/location/retention/user/{ownId} → 200
  // --------------------------------------------------------------------
  test('@company-security @gdpr COMPANY cannot access OTHER users GDPR data', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');

    // Bean-gated check: /gdpr/location/* may be bean-conditional in dev.
    // Probe and skip if 404.
    const probe = await authGet(page, '/gdpr/location/retention/user/999999');
    if (probe.status() === 404) {
      test.skip(
        true,
        '/gdpr/location/* endpoints not registered in this BE profile (likely @ConditionalOnProperty gated).',
      );
    }

    // Other-user 403 — exporting someone else's location data
    const exportRes = await authGet(page, '/gdpr/location/export/user/999999');
    expect(
      exportRes.status(),
      `GET /gdpr/location/export/user/999999 should be 403 — got ${exportRes.status()}`,
    ).toBe(403);

    const retentionRes = await authGet(page, '/gdpr/location/retention/user/999999');
    expect(
      retentionRes.status(),
      `GET /gdpr/location/retention/user/999999 should be 403 — got ${retentionRes.status()}`,
    ).toBe(403);

    const deleteRes = await authDelete(page, '/gdpr/location/user/999999');
    expect(
      deleteRes.status(),
      `DELETE /gdpr/location/user/999999 should be 403 — got ${deleteRes.status()}`,
    ).toBe(403);
  });

  test('@company-security @gdpr COMPANY CAN access their OWN GDPR data', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);

    const probe = await authGet(page, `/gdpr/location/retention/user/${userId}`);
    if (probe.status() === 404) {
      test.skip(true, '/gdpr/location/* endpoints not registered in this BE profile.');
    }

    const exportRes = await authGet(page, `/gdpr/location/export/user/${userId}`);
    expect(
      exportRes.status(),
      `GET /gdpr/location/export/user/{own} should be 200 — got ${exportRes.status()}`,
    ).toBe(200);

    const retentionRes = await authGet(page, `/gdpr/location/retention/user/${userId}`);
    expect(
      retentionRes.status(),
      `GET /gdpr/location/retention/user/{own} should be 200 — got ${retentionRes.status()}`,
    ).toBe(200);
  });

  // --------------------------------------------------------------------
  // BE Scenario 2: "INFLUENCER security restrictions - owner-based GDPR"
  // Mirror of Scenario 1 for INFLUENCER actor.
  // --------------------------------------------------------------------
  test('@influencer-security @gdpr INFLUENCER cannot access OTHER users GDPR data', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');

    const probe = await authGet(page, '/gdpr/location/retention/user/999999');
    if (probe.status() === 404) {
      test.skip(true, '/gdpr/location/* endpoints not registered in this BE profile.');
    }

    const exportRes = await authGet(page, '/gdpr/location/export/user/999999');
    expect(exportRes.status()).toBe(403);

    const retentionRes = await authGet(page, '/gdpr/location/retention/user/999999');
    expect(retentionRes.status()).toBe(403);

    const deleteRes = await authDelete(page, '/gdpr/location/user/999999');
    expect(deleteRes.status()).toBe(403);
  });

  test('@influencer-security @gdpr INFLUENCER CAN access their OWN GDPR data', async ({ page }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');
    const userId = await getMyUserId(page);

    const probe = await authGet(page, `/gdpr/location/retention/user/${userId}`);
    if (probe.status() === 404) {
      test.skip(true, '/gdpr/location/* endpoints not registered in this BE profile.');
    }

    const exportRes = await authGet(page, `/gdpr/location/export/user/${userId}`);
    expect(exportRes.status()).toBe(200);

    const retentionRes = await authGet(page, `/gdpr/location/retention/user/${userId}`);
    expect(retentionRes.status()).toBe(200);
  });

  // --------------------------------------------------------------------
  // BE Scenario 3: "ADMIN 2FA partial-session denied / full-session allowed"
  //   Given an ADMIN logs in with a partial (pre-2FA) session
  //   When they GET an admin-only endpoint
  //   Then the response should NOT be 200 (auth filter rejects with 401/302)
  //
  //   Given the same admin completes 2FA → full session
  //   When they GET the same admin endpoint
  //   Then the response should be 200
  //
  // Unblocked via mock-session's `partial` flag:
  //   - { role: ADMIN, partial: true }  → partialSession cookie issued
  //   - { role: ADMIN, partial: false } → full session cookie issued
  // (memory: reference_mock_session_admin_full_session). The
  // authorization-shape contract is what matters; the actual TOTP
  // verification flow is exercised separately by T7 step-up-auth.
  // --------------------------------------------------------------------
  test('@admin-2fa partial-session blocked on admin endpoints; full-session allowed', async ({
    browser,
  }) => {
    const adminEmail = `t23-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

    // Helper to seed a session at the requested partial-or-full state
    // and return the BrowserContext (own cookie jar). Uses raw fetch via
    // a one-off context — we can't use seedSession() because it always
    // sets partial:false.
    const seedAdminAt = async (partial: boolean) => {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const res = await page.request.post(`${GREENFIELD_URL}/api/test/auth/mock-session`, {
        data: { email: adminEmail, role: 'ADMIN', partial },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
      expect(
        res.status(),
        `mock-session admin partial=${partial} should be 200, got ${res.status()}`,
      ).toBe(200);
      return { ctx, page };
    };

    let partialCtx: import('@playwright/test').BrowserContext | undefined;
    let fullCtx: import('@playwright/test').BrowserContext | undefined;
    try {
      // Partial session — admin endpoint should be denied.
      const partial = await seedAdminAt(true);
      partialCtx = partial.ctx;

      const partialRes = await partial.page.request.get(
        `${GREENFIELD_URL}/api/users/paged?page=0&size=10`,
        { ignoreHTTPSErrors: true, failOnStatusCode: false },
      );
      expect(
        partialRes.status(),
        `partial-session GET /users/paged should NOT be 200 (auth filter rejects pre-2FA), got ${partialRes.status()}`,
      ).not.toBe(200);
      // 401 is the canonical reject — accept 302/403 too for defense-
      // in-depth variations.
      expect(
        [302, 401, 403].includes(partialRes.status()),
        `partial-session should be 302/401/403, got ${partialRes.status()}`,
      ).toBe(true);

      // Full session — same endpoint, same actor, now allowed.
      const full = await seedAdminAt(false);
      fullCtx = full.ctx;

      const fullRes = await full.page.request.get(
        `${GREENFIELD_URL}/api/users/paged?page=0&size=10`,
        { ignoreHTTPSErrors: true, failOnStatusCode: false },
      );
      expect(
        fullRes.status(),
        `full-session GET /users/paged should be 200, got ${fullRes.status()}: ${(await fullRes.text()).slice(0, 200)}`,
      ).toBe(200);
    } finally {
      await partialCtx?.close();
      await fullCtx?.close();
    }
  });
});
