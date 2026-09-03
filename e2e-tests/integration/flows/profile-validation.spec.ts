import { expect, test, type Page } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { getMyId as getMyUserId, uploadTrackedPhoto } from '../_helpers';

/**
 * T22 — Port of `profile/validation-edge-cases.feature` (2 consolidated
 * scenarios with 30+ soft-assertion TEST sections).
 *
 * Source of truth: `checkitout-backend/.../features/profile/validation-edge-cases.feature`
 *
 * Coverage strategy: each validation assertion in the Cucumber consolidated
 * scenario maps to one Playwright test. The mock-session COMPANY actor
 * suffices — no Firebase login required. Email-change scenarios resolve
 * to 401 (step-up token missing) which the Cucumber also accepts.
 *
 * Skipped: "Critical field updated successfully" + "refreshes their session
 * token" steps — those are admin-state machinery, not contract assertions.
 * The validation REJECT path is what catches contract drift.
 *
 * Run: `npm run test:integration -- --grep profile-validation`
 */

const UNIQUE_COMPANY = () =>
  `t22-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function patchUser(
  page: Page,
  userId: number,
  data: Record<string, unknown>,
): Promise<import('@playwright/test').APIResponse> {
  return page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

test.describe('@profile @validation-edge-cases — port of validation-edge-cases.feature', () => {
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

  // ===================================================================
  // firstName validation
  // ===================================================================
  test('@firstName too short (< 2 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { firstName: 'A' });
    expect(res.status(), `firstName="A" should be 400 — got ${res.status()}`).toBe(400);
  });

  test('@firstName too long (> 50 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { firstName: 'A'.repeat(51) });
    expect(res.status()).toBe(400);
  });

  test('@firstName valid 2-char boundary returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { firstName: 'AB' });
    expect(res.status(), `firstName="AB" should be 200 — got ${res.status()}`).toBeLessThan(300);
  });

  test('@firstName valid 50-char boundary returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { firstName: 'A'.repeat(50) });
    expect(res.status()).toBeLessThan(300);
  });

  // ===================================================================
  // lastName validation
  // ===================================================================
  test('@lastName too short (< 2 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { lastName: 'X' });
    expect(res.status()).toBe(400);
  });

  // ===================================================================
  // email validation (step-up gated → 401 without token)
  // ===================================================================
  test('@email invalid format without step-up token returns 401', async ({ page }) => {
    // The Cucumber documents this asserts 401 because step-up is required
    // for email changes (after setup-completed). For incomplete-setup
    // actors (which mock-session creates), step-up is skipped per T7 —
    // so we may get 400 (validation) instead. Accept both.
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { email: 'not-an-email' });
    expect(
      [400, 401].includes(res.status()),
      `invalid email should be 400|401 — got ${res.status()}`,
    ).toBe(true);
  });

  // ===================================================================
  // phoneNumber validation
  // ===================================================================
  test('@phone invalid format returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { phoneNumber: 'abc123' });
    expect(res.status()).toBe(400);
  });

  test('@phone too short (< 7 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { phoneNumber: '12345' });
    expect(res.status()).toBe(400);
  });

  test('@phone too long (> 25 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, {
      phoneNumber: '+12345678901234567890123456',
    });
    expect(res.status()).toBe(400);
  });

  test('@phone valid international format returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    // Use a per-test unique suffix on the phone — parallel workers patching
    // the literal `+48-123-456-789` simultaneously trigger BE unique-phone
    // constraint conflicts (409). The Cucumber asserts shape, not literal.
    const uniqueSuffix = Date.now().toString().slice(-7);
    const res = await patchUser(page, userId, { phoneNumber: `+48-${uniqueSuffix}` });
    expect(
      res.status(),
      `valid international phone should be 200 — got ${res.status()}`,
    ).toBeLessThan(300);
  });

  test('@phone valid with parentheses returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const uniqueSuffix = Date.now().toString().slice(-7);
    const res = await patchUser(page, userId, { phoneNumber: `+1(555)${uniqueSuffix}` });
    expect(res.status()).toBeLessThan(300);
  });

  // ===================================================================
  // profilePicture — uploadId-only contract (pentest 3.1)
  //
  // The client never chooses the stored URL: any raw URL — HTTP, HTTPS,
  // oversized — fails to resolve to a tracked upload owned by the caller
  // and is rejected with 400. Only a tracked uploadId from the signed-URL
  // pipeline is accepted; the BE stores + returns ITS canonical URL.
  // ===================================================================
  test('@profilePicture raw HTTP URL is rejected (uploadId-only) with 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, {
      profilePicture: 'http://example.com/photo.jpg',
    });
    expect(res.status()).toBe(400);
  });

  test('@profilePicture raw HTTPS URL is rejected (uploadId-only) with 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, {
      profilePicture: 'https://example.com/photo.jpg',
    });
    expect(res.status()).toBe(400);
  });

  test('@profilePicture overlong raw URL (> 2048 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const longPath = 'a'.repeat(2030);
    const res = await patchUser(page, userId, {
      profilePicture: `https://example.com/${longPath}.jpg`,
    });
    expect(res.status()).toBe(400);
  });

  test('@profilePicture tracked uploadId returns 200 with the BE-resolved canonical URL', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const upload = await uploadTrackedPhoto(page);
    if (!upload) {
      test.skip(true, 'upload controller absent (no Firebase Storage in this profile)');
    }
    const res = await patchUser(page, userId, { profilePicture: upload!.uploadId });
    expect(
      res.status(),
      `tracked uploadId should be 200 — got ${res.status()}: ${await res.text()}`,
    ).toBe(200);
    const body = (await res.json()) as { profilePicture?: string };
    expect(body.profilePicture, 'BE returns its canonical stored URL').toBe(upload!.publicUrl);
  });

  // ===================================================================
  // companyDescription validation
  // ===================================================================
  test('@companyDescription too long (> 1000 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, {
      companyDescription: 'a'.repeat(1001),
    });
    expect(res.status()).toBe(400);
  });

  test('@companyDescription boundary (1000 chars) returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, {
      companyDescription: 'a'.repeat(1000),
    });
    expect(res.status()).toBeLessThan(300);
  });

  // ===================================================================
  // NIP validation
  // ===================================================================
  test('@nip too long (> 20 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyUserId(page);
    const res = await patchUser(page, userId, { nip: '123456789012345678901' });
    expect(res.status()).toBe(400);
  });

  // ===================================================================
  // Preferences validation (PATCH /user-preferences/me)
  // ===================================================================
  async function patchPreferences(
    page: Page,
    data: Record<string, unknown>,
  ): Promise<import('@playwright/test').APIResponse> {
    return page.request.patch(`${GREENFIELD_URL}/api/user-preferences/me`, {
      data,
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
  }

  test('@preferences valid language "en" returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { language: 'en' });
    expect(res.status()).toBeLessThan(300);
  });

  test('@preferences valid language "pl" returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { language: 'pl' });
    expect(res.status()).toBeLessThan(300);
  });

  test('@preferences language too long (> 10 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { language: 'verylonglanguagecode' });
    expect(res.status()).toBe(400);
  });

  test('@preferences valid timezone returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { timezone: 'Europe/Warsaw' });
    expect(res.status()).toBeLessThan(300);
  });

  test('@preferences timezone too long (> 50 chars) returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { timezone: 'a'.repeat(51) });
    expect(res.status()).toBe(400);
  });

  test('@preferences communicationFrequency IMMEDIATE returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { communicationFrequency: 'IMMEDIATE' });
    expect(res.status()).toBeLessThan(300);
  });

  test('@preferences communicationFrequency invalid enum returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { communicationFrequency: 'INVALID' });
    expect(res.status()).toBe(400);
  });

  test('@preferences gdprMarketingConsent boolean returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const res = await patchPreferences(page, { gdprMarketingConsent: true });
    expect(res.status()).toBeLessThan(300);
  });
});
