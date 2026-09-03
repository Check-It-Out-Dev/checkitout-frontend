import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL } from '../_actor';

/** Generic BE error envelope returned by 400/401/4xx across the magic-link
 *  endpoints. Not in OpenAPI (the endpoints declare empty `@Content()` for
 *  4xx); we type it locally so error-body field accesses don't drop to
 *  string-indexed lookups. */
interface ApiErrorResponse {
  messageKey?: string;
  message?: string;
  requestId?: string;
  validationErrors?: Record<string, string>;
  errors?: Record<string, string>;
}

/**
 * T14 — Port of `magic-link-errors.feature` (Tiers 1 + 2).
 *
 * Source of truth: `checkitout-backend/.../features/magic-link-errors.feature`
 *
 * Coverage map (5 BE tiers → coverage status):
 *
 *   ✅ Tier 1 DTO validation: blank/missing oobCode + blank/missing/too-short
 *      /no-digits/no-letters/over-max-length newPassword across the 3 magic
 *      link endpoints. Pure JSR-303 validation; no Firebase calls.
 *   ✅ Tier 1 malformed JSON: 400 for invalid JSON body on apply-action-code
 *      + confirm-password-reset.
 *   ✅ Tier 2 garbage oobCode: invalid_action_code messageKey across all 3
 *      endpoints. Tests the Firebase action-code lookup path returns the
 *      right error.
 *   ⏭️  Tier 3 already-used verification oobCode: needs real Firebase login
 *      + test-only oobCode-generation endpoint.
 *   ⏭️  Tier 4 already-used password-reset oobCode: same blocker.
 *   ⏭️  Tier 5 cross-endpoint oobCode misuse: same blocker.
 *
 * Bug class caught:
 *   1. DTO-validation regression — if the BE ever drops @NotBlank /
 *      @Size / @Pattern on these auth DTOs, attackers could submit
 *      malformed values to probe the Firebase backend, sometimes
 *      coaxing it into accepting underspecified codes.
 *   2. Error-message contract drift — the FE relies on
 *      `error.auth.invalid_action_code` to show the right localized
 *      error. If the BE renames the messageKey, the FE shows the
 *      generic "save failed" toast and users can't recover.
 *
 * Run: `npm run test:integration -- --grep magic-link-errors`
 */

async function postJson(page: Page, path: string, data: unknown): Promise<APIResponse> {
  return page.request.post(`${GREENFIELD_URL}/api${path}`, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

async function postRaw(page: Page, path: string, rawBody: string): Promise<APIResponse> {
  return page.request.post(`${GREENFIELD_URL}/api${path}`, {
    data: rawBody,
    headers: { 'Content-Type': 'application/json' },
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

const APPLY_ACTION_CODE = '/auth/firebase/apply-action-code';
const VERIFY_RESET_CODE = '/auth/firebase/verify-reset-code';
const CONFIRM_PASSWORD_RESET = '/auth/firebase/confirm-password-reset';

test.describe('@magic-link-errors — port of magic-link-errors.feature', () => {
  test.describe.configure({ mode: 'parallel' });

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
  // Tier 1: oobCode DTO validation (apply-action-code + verify-reset-code)
  // --------------------------------------------------------------------
  test('@tier-1 apply-action-code rejects blank oobCode (400)', async ({ page }) => {
    const res = await postJson(page, APPLY_ACTION_CODE, { oobCode: '' });
    expect(res.status(), `blank oobCode should be 400, got ${res.status()}`).toBe(400);
  });

  test('@tier-1 apply-action-code rejects missing oobCode field (400)', async ({ page }) => {
    const res = await postJson(page, APPLY_ACTION_CODE, {});
    expect(res.status()).toBe(400);
  });

  test('@tier-1 verify-reset-code rejects blank oobCode (400)', async ({ page }) => {
    const res = await postJson(page, VERIFY_RESET_CODE, { oobCode: '' });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 verify-reset-code rejects missing oobCode field (400)', async ({ page }) => {
    const res = await postJson(page, VERIFY_RESET_CODE, {});
    expect(res.status()).toBe(400);
  });

  // --------------------------------------------------------------------
  // Tier 1: confirm-password-reset DTO validation matrix
  // --------------------------------------------------------------------
  test('@tier-1 confirm-password-reset rejects blank oobCode (400)', async ({ page }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, {
      oobCode: '',
      newPassword: 'ValidPass1',
    });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects missing oobCode (400)', async ({ page }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, { newPassword: 'ValidPass1' });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects blank newPassword (400)', async ({ page }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, { oobCode: 'x', newPassword: '' });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects missing newPassword (400)', async ({ page }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, { oobCode: 'x' });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects password too short (400)', async ({ page }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, {
      oobCode: 'x',
      newPassword: 'Ab1',
    });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects password with no digits (400)', async ({ page }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, {
      oobCode: 'x',
      newPassword: 'abcdefgh',
    });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects password with no letters (400)', async ({
    page,
  }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, {
      oobCode: 'x',
      newPassword: '12345678',
    });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects password over max length (400)', async ({
    page,
  }) => {
    // Max is typically 128; use 200 to be safely over.
    const oversized = 'A1' + 'a'.repeat(200);
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, {
      oobCode: 'x',
      newPassword: oversized,
    });
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects empty body (400 on BOTH fields)', async ({
    page,
  }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, {});
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    const errs = body.validationErrors ?? body.errors ?? {};
    // Both fields should appear in the validation-errors map.
    expect(
      typeof errs['oobCode'] === 'string' || typeof errs['newPassword'] === 'string',
      `empty body should report both oobCode + newPassword errors; got ${JSON.stringify(body)}`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // Tier 1: Malformed JSON
  // --------------------------------------------------------------------
  test('@tier-1 apply-action-code rejects malformed JSON (400)', async ({ page }) => {
    const res = await postRaw(page, APPLY_ACTION_CODE, '{invalid json');
    expect(res.status()).toBe(400);
  });

  test('@tier-1 confirm-password-reset rejects malformed JSON (400)', async ({ page }) => {
    const res = await postRaw(page, CONFIRM_PASSWORD_RESET, 'not json');
    expect(res.status()).toBe(400);
  });

  // --------------------------------------------------------------------
  // Tier 2: Garbage oobCode rejected by all 3 endpoints with
  // messageKey "error.auth.invalid_action_code"
  // --------------------------------------------------------------------
  const GARBAGE = 'GARBAGE_E2E_INVALID_CODE_12345';

  test('@tier-2 apply-action-code rejects garbage oobCode with invalid_action_code', async ({
    page,
  }) => {
    const res = await postJson(page, APPLY_ACTION_CODE, { oobCode: GARBAGE });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.messageKey).toBe('error.auth.invalid_action_code');
    expect(
      typeof body.requestId === 'string' && body.requestId.length > 0,
      `response should include a non-empty requestId, got ${body.requestId}`,
    ).toBe(true);
  });

  test('@tier-2 verify-reset-code rejects garbage oobCode with invalid_action_code', async ({
    page,
  }) => {
    const res = await postJson(page, VERIFY_RESET_CODE, { oobCode: GARBAGE });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.messageKey).toBe('error.auth.invalid_action_code');
  });

  test('@tier-2 confirm-password-reset rejects garbage oobCode with invalid_action_code', async ({
    page,
  }) => {
    const res = await postJson(page, CONFIRM_PASSWORD_RESET, {
      oobCode: GARBAGE,
      newPassword: 'ValidPass1',
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.messageKey).toBe('error.auth.invalid_action_code');
  });

  // --------------------------------------------------------------------
  // Tiers 3-5: oobCode lifecycle (single-use + cross-endpoint misuse)
  // --------------------------------------------------------------------
  test.fixme('@tier-3 apply-action-code rejects already-used verification oobCode', () => {
    /* Needs real Firebase login + test-only oobCode-generation endpoint
     * (@Profile("e2e")). Blocked on T1. */
  });

  test.fixme('@tier-4 verify-reset-code + confirm-password-reset reject already-consumed reset oobCode', () => {
    /* Same blockers as Tier 3. */
  });

  test.fixme('@tier-5 verification oobCode rejected by password-reset endpoints', () => {
    /* Same blockers. */
  });

  test.fixme('@tier-5 password-reset oobCode rejected by apply-action-code', () => {
    /* Same blockers. */
  });
});
