import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL } from '../_actor';

/** BE error envelope — local since OpenAPI declares empty content for 4xx. */
interface ApiErrorResponse {
  messageKey?: string;
  message?: string;
  requestId?: string;
}

/**
 * T14 — Port of `influencer-verification-password.feature` (partial).
 *
 * Source of truth:
 *   `checkitout-backend/.../features/influencer-verification-password.feature`
 *
 * Coverage map:
 *
 *   ⏭️  Scenarios 1, 2, 3 (happy-path + re-verify + notification): all
 *      need real Firebase admin + GreenMail SMTP (e2e profile) to extract
 *      an oobCode from a real verification email. Blocked on T1.
 *   ✅ Scenario 4: invalid oobCode → 400 with messageKey
 *      "error.auth.invalid_action_code". Pure validation, no Firebase
 *      action-code lookup succeeds with a synthetic value.
 *
 * Bug class caught: Firebase action-code validation bypass. If the BE
 * ever accepts a malformed/invalid oobCode (e.g. empty string, repeated
 * use of an expired code), attackers could complete the influencer
 * verification flow without owning the email — full account takeover.
 *
 * Run: `npm run test:integration -- --grep influencer-verification-password`
 */

async function api(page: Page, path: string, data: unknown): Promise<APIResponse> {
  return page.request.post(`${GREENFIELD_URL}/api${path}`, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

test.describe('@influencer-verification-password — port of influencer-verification-password.feature', () => {
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
  // Scenario 4: Invalid oobCode → 400 + invalid_action_code
  // --------------------------------------------------------------------
  test('@scenario-4 @error invalid oobCode returns 400 with invalid_action_code messageKey', async ({
    page,
  }) => {
    const res = await api(page, '/auth/firebase/complete-verification', {
      oobCode: 'TOTALLY_INVALID_CODE',
      password: 'TestPass1',
    });
    expect(
      res.status(),
      `invalid oobCode should be 400, got ${res.status()}: ${await res.text()}`,
    ).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(
      body.messageKey,
      `body.messageKey should be error.auth.invalid_action_code, got ${JSON.stringify(body)}`,
    ).toBe('error.auth.invalid_action_code');
  });

  // --------------------------------------------------------------------
  // Scenarios 1-3: Happy-path + re-verify + notification
  // --------------------------------------------------------------------
  test.fixme('@scenario-1 @happy-path influencer verifies email and sets password via complete-verification', () => {
    /* Needs real Firebase admin (for "Admin enables prefs") + real
     * Firebase influencer (for OAuth login) + GreenMail SMTP (to capture
     * the verification email and extract oobCode). All blocked on T1
     * + e2e profile. */
  });

  test.fixme('@scenario-2 @happy-path influencer can re-verify after reset', () => {
    /* Same blockers as scenario 1, doubled (two verifications). */
  });

  test.fixme('@scenario-3 @account-activation influencer receives ACCOUNT_ACTIVATED notification after verification', () => {
    /* Scenario 1 blockers + Firebase claim update for account activation
     * preference enablement. */
  });
});
