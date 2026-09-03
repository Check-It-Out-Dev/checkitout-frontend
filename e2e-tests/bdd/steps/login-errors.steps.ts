import { GREENFIELD_URL } from '../../integration/_actor';
import { Then, When, expect } from './fixtures';

/**
 * Authentication error-handling oracle — Layer 2 (login-errors.feature).
 *
 * Negative paths of the real auth chain: the invalid-credential steps drive the
 * actual sign-in form against the live BE (no mocked 401s — the sibling
 * integration spec login-errors.spec.ts mocks the BE; this oracle does not),
 * and the invalid-TOTP steps reuse the login.steps.ts form/dialog machinery on
 * a real admin partial session. API-level error contracts (OAuth simulation,
 * token exchange validation) are asserted directly with their exact BE
 * messages. Shares `the response status should be {int}` (partnership.steps)
 * and the sign-in/2FA steps (login.steps) via the global step registry.
 */

// ── Invalid credentials through the real form ────────────────────────────────

When(
  'the user attempts to sign in with email {string} and password {string}',
  async ({ page, world }, email: string, password: string) => {
    await page.goto(`${GREENFIELD_URL}/auth/sign-in`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('sign-in-email'), 'sign-in form must render').toBeVisible();

    // First-visit consent — keeps parity with the happy-path oracle; harmless
    // when the banner is absent (bad-credential failures happen BEFORE exchange).
    const acceptCookies = page.getByTestId('cookie-banner-accept-all');
    if (await acceptCookies.isVisible().catch(() => false)) {
      await acceptCookies.click();
      await expect(page.getByTestId('cookie-banner')).toBeHidden();
    }

    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-password').fill(password);

    // Bad credentials fail at the Identity-Toolkit proxy (BEFORE exchange-token).
    const loginPromise = page.waitForResponse(
      (resp) =>
        /\/api\/auth\/firebase\/login\b/.test(resp.url()) && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByTestId('sign-in-submit').click();
    const login = await loginPromise;
    world.lastResponse = {
      status: login.status(),
      headers: login.headers(),
      body: await login.text().catch(() => ''),
    };
  },
);

Then(
  'the sign-in attempt is rejected with status {int} and message {string}',
  async ({ world }, status: number, message: string) => {
    expect(
      world.lastResponse?.status,
      `login status (body: ${(world.lastResponse?.body ?? '').slice(0, 300)})`,
    ).toBe(status);
    // Anti-enumeration contract: the SAME message for unknown email and wrong
    // password. messageKey error.auth.invalid_credentials backs the FE i18n.
    expect(world.lastResponse?.body ?? '').toContain(message);
  },
);

Then('the sign-in form shows the error state', async ({ page }) => {
  await expect(
    page.getByTestId('sign-in-error'),
    'the form must surface the auth failure to the user',
  ).toBeVisible({ timeout: 10_000 });
  // Still on the sign-in page — no navigation happened.
  expect(new URL(page.url()).pathname.startsWith('/auth/sign-in')).toBe(true);
});

// ── Invalid TOTP codes on a real admin partial session ───────────────────────

When('the admin submits an invalid TOTP code {string}', async ({ page, world }, code: string) => {
  const verifyPromise = page.waitForResponse(
    (resp) => /\/api\/twofactor\/verify\b/.test(resp.url()) && resp.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.getByTestId('two-factor-verify-code').fill(code);
  await page.getByTestId('two-factor-verify-submit').click();
  const verify = await verifyPromise;
  world.lastResponse = {
    status: verify.status(),
    headers: verify.headers(),
    body: await verify.text().catch(() => ''),
  };
});

Then(
  'the two-factor verification is rejected with {string}',
  async ({ page, world }, message: string) => {
    expect(
      world.lastResponse?.status,
      `verify status (body: ${(world.lastResponse?.body ?? '').slice(0, 300)})`,
    ).toBe(400);
    expect(world.lastResponse?.body ?? '').toContain(message);
    // The dialog stays open showing its error — the user can retry.
    await expect(page.getByTestId('two-factor-verify-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('two-factor-verify-code')).toBeVisible();
  },
);

// ── API-level error contracts ────────────────────────────────────────────────

When(
  'the influencer attempts the Instagram OAuth simulation with Firebase UID {string}',
  async ({ page, world }, uid: string) => {
    const res = await page.request.post(
      `${GREENFIELD_URL}/api/test/auth/simulate-influencer-oauth`,
      { data: { firebaseUid: uid }, ignoreHTTPSErrors: true },
    );
    world.lastResponse = { status: res.status(), headers: res.headers(), body: await res.text() };
  },
);

When('a token exchange is attempted without an idToken', async ({ page, world }) => {
  // Validation fires before the consent gate, so an empty body is a clean 400
  // "This field is required" — the exact contract the BE feature asserts.
  const res = await page.request.post(`${GREENFIELD_URL}/api/auth/exchange-token`, {
    data: {},
    ignoreHTTPSErrors: true,
  });
  world.lastResponse = { status: res.status(), headers: res.headers(), body: await res.text() };
});

Then('the error message should contain {string}', async ({ world }, fragment: string) => {
  expect(world.lastResponse?.body ?? '', 'error body must carry the contract message').toContain(
    fragment,
  );
});
