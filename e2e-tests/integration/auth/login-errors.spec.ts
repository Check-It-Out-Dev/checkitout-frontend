import { expect, test, type Page, type Route } from '@playwright/test';
import { BE_URL, GREENFIELD_URL } from '../_actor';

/**
 * T5 — Port of `src/test/resources/features/login-errors.feature`.
 *
 * The BE feature has 5 testable cases (excluding the @2fa @kms TOTP and
 * @oauth scenarios that need T1 / OAuth-callback infrastructure):
 *   - Company: nonexistent email + valid-looking password → 401
 *   - Company: existing email + wrong password → 401
 *   - Admin:   nonexistent email + valid-looking password → 401
 *   - Admin:   existing email + wrong password → 401
 *   - (skipped) Admin 2FA invalid TOTP — needs T1 TOTP infrastructure
 *   - (skipped) Influencer OAuth errors — needs OAuth callback simulation
 *
 * Strategy: intercept the FE's POST to `/api/auth/firebase/login` and
 * return a synthetic 401 + the BE's anti-enumeration error message.
 * This makes the test deterministic — no Firebase quota burn, no
 * dependency on test BE having password-validation wired up exactly the
 * same as prod. The behavior we're validating is FE-side: form shows
 * the error UI + no session cookie gets set + URL stays on /auth/sign-in.
 *
 * The BE-side correctness of "401 for bad credentials" is already
 * validated by the BE Cucumber feature this ports.
 *
 * Run: `npm run test:integration -- --grep login-errors`
 */

async function mockBeLoginRejection(page: Page, status: number, message: string): Promise<void> {
  await page.route('**/api/auth/firebase/login', async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ message, error: 'unauthorized' }),
    });
  });
}

async function probeUsersMe(page: Page): Promise<number> {
  const res = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
    ignoreHTTPSErrors: true,
  });
  return res.status();
}

interface BadCreds {
  readonly email: string;
  readonly password: string;
  readonly role: 'company' | 'admin';
}

async function attemptBadLogin(page: Page, creds: BadCreds): Promise<void> {
  // Mock the BE response to a deterministic 401.
  await mockBeLoginRejection(page, 401, 'Invalid credentials provided');

  await page.goto(`${GREENFIELD_URL}/auth/sign-in`, { waitUntil: 'networkidle' });

  // Drive the form. The mat-form-field testid lands on the underlying <input>.
  await page.getByTestId('sign-in-email').fill(creds.email);
  await page.getByTestId('sign-in-password').fill(creds.password);
  await page.getByTestId('sign-in-submit').click();

  // Error banner appears once the BE rejection lands. The component sets
  // `errorKey()` from the catchError branch in submit().
  const errorBanner = page.getByTestId('sign-in-error');
  await expect(
    errorBanner,
    `${creds.role} ${creds.email} should surface auth error UI`,
  ).toBeVisible({
    timeout: 5_000,
  });

  // URL stays on /auth/sign-in (no navigation away).
  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  // No session was issued — /users/me 401s.
  const meStatus = await probeUsersMe(page);
  expect(meStatus, `${creds.role} should have no session after bad-credentials attempt`).toBe(401);
}

test.describe('@authentication @login @negative — port of login-errors.feature', () => {
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

  // ----- Company variants (2 examples from BE Scenario Outline) -----

  test('@company nonexistent email surfaces error UI', async ({ page }) => {
    await attemptBadLogin(page, {
      email: 'nonexistent.user@example.com',
      password: 'AnyPassword123!',
      role: 'company',
    });
  });

  test('@company existing email + wrong password surfaces error UI', async ({ page }) => {
    await attemptBadLogin(page, {
      email: 'norbert.marchewka4444431@gmail.com',
      password: 'WrongPassword123!',
      role: 'company',
    });
  });

  // ----- Admin variants (2 examples — same form, anti-enumeration shape) -----

  test('@admin nonexistent email surfaces error UI', async ({ page }) => {
    await attemptBadLogin(page, {
      email: 'nonexistent.admin@example.com',
      password: 'AnyPassword123!',
      role: 'admin',
    });
  });

  test('@admin existing email + wrong password surfaces error UI', async ({ page }) => {
    await attemptBadLogin(page, {
      email: 'norbert.marchewka44@gmail.com',
      password: 'WrongPassword123!',
      role: 'admin',
    });
  });
});
