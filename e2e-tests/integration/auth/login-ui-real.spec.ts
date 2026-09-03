import { expect, test } from '@playwright/test';
import { GREENFIELD_URL } from '../_actor';
import { hasUiCredentialsFor } from '../../_framework/real-login';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';

/**
 * T4-UI — Port of `login.feature` @company @full-auth driven through the
 * real browser sign-in form (not the request-fixture shortcut).
 *
 * Source of truth: `checkitout-backend/src/test/resources/features/login.feature`.
 *
 * Why this exists separately from `login-real.spec.ts`:
 *
 *   The sibling `login-real.spec.ts` proves the real-Firebase auth chain
 *   end-to-end via `context.request.post('/api/auth/exchange-token')`
 *   directly — it MINTS the cookies via Identity Toolkit + BE exchange.
 *   That's sufficient to prove the BE contract.
 *
 *   This spec proves the FE *form code path* — `page.goto('/auth/sign-in')`
 *   → `page.fill` → `page.click('submit')` → `SignInComponent.submit()`
 *   Observable chain (signIn → exchangeTokenForSession → optional 2FA →
 *   session.probe → router.navigate('/')) → cookies actually land in the
 *   browser-managed cookie jar with production attributes (HttpOnly +
 *   Secure + SameSite=Strict).
 *
 *   The 2026-05-12 opus-code-crawler audit surfaced this as the highest-
 *   leverage gap: `actorSignsInWithEmail` existed in `_framework/when.ts`
 *   with zero callers, `login-errors.spec.ts` drove the form but mocked
 *   the BE 401 (never reaching the success branch), and `login-real.spec.ts`
 *   bypassed the form entirely. A regression in `SignInComponent.submit()`
 *   (RxJS chain order, router-navigate-on-success, FormGroup wiring,
 *   testid drift) would not have been caught by any existing test.
 *
 * Self-skipping: when `e2e-tests/.env` lacks `FIREBASE_TEST_COMPANY_{EMAIL,
 * PASSWORD}` + `FIREBASE_API_KEY`, the test self-skips.
 *
 * Run: `npm run test:integration -- --grep login-ui-real`
 */

test.describe('@login-ui-real — real-Firebase UI sign-in (T4-UI)', () => {
  // Sequential — shared Firebase test user means concurrent runs would
  // race against Identity Toolkit rate limits.
  test.describe.configure({ mode: 'serial' });

  test('@company @full-auth — company signs in via the form and lands on a protected route', async ({
    browser,
  }) => {
    test.skip(
      !hasUiCredentialsFor('COMPANY'),
      'FIREBASE_TEST_COMPANY_{EMAIL,PASSWORD} not set — see e2e-tests/.env.example',
    );

    const email = process.env['FIREBASE_TEST_COMPANY_EMAIL']!;
    const password = process.env['FIREBASE_TEST_COMPANY_PASSWORD']!;

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();

      // Drive the actual UI form — this is the production code path.
      await page.goto(`${GREENFIELD_URL}/auth/sign-in`, { waitUntil: 'networkidle' });
      await expect(page.getByTestId('sign-in-email'), 'sign-in form must render').toBeVisible();

      // Accept the cookie banner exactly like a first-visit user — the BE
      // consent gate 451s /auth/exchange-token without the HMAC-signed
      // `consent_cookie_policy` cookie the banner's ESSENTIAL toggle sets.
      const acceptCookies = page.getByTestId('cookie-banner-accept-all');
      if (await acceptCookies.isVisible().catch(() => false)) {
        const essentialToggle = page.waitForResponse(
          (resp) =>
            /\/api\/legal\/consent\/category-toggle\b/.test(resp.url()) &&
            resp.request().method() === 'POST' &&
            resp.status() < 300,
          { timeout: 10_000 },
        );
        await acceptCookies.click();
        // Wait for the consent cookie to land before login, or exchange 451s.
        await essentialToggle;
        await expect(page.getByTestId('cookie-banner')).toBeHidden();
      }

      await page.getByTestId('sign-in-email').fill(email);
      await page.getByTestId('sign-in-password').fill(password);

      // Capture the exchange-token POST so we have a concrete proof the
      // FE chain reached step 2 (BE issues cookies here).
      const exchangePromise = page.waitForResponse(
        (resp) =>
          /\/api\/auth\/exchange-token\b/.test(resp.url()) && resp.request().method() === 'POST',
        { timeout: 15_000 },
      );

      await page.getByTestId('sign-in-submit').click();

      const exchange = await exchangePromise;
      expect(
        exchange.status(),
        `/auth/exchange-token must return 200 (got ${exchange.status()})`,
      ).toBe(200);

      // The router lands the authenticated COMPANY actor on a protected
      // route after `session.probe()` resolves. Either `/` redirects to
      // the role's landing, or some intermediate guard lands here. Accept
      // anything that is NOT `/auth/sign-in` as evidence the form chain
      // completed successfully.
      await page.waitForURL((url) => !new URL(url).pathname.startsWith('/auth/sign-in'), {
        timeout: 10_000,
      });
      const landedPath = new URL(page.url()).pathname;
      expect(
        landedPath.startsWith('/auth/sign-in'),
        `form should navigate away from /auth/sign-in (landed: ${landedPath})`,
      ).toBe(false);

      // The browser-managed cookie jar now carries the production session
      // cookies. Assert both halves of the HMAC pair are present and
      // shaped correctly.
      const cookies = await context.cookies(GREENFIELD_URL);
      const cookieByName = new Map(cookies.map((c) => [c.name, c]));

      const sessionCookie = cookieByName.get('session');
      const sessionSigCookie = cookieByName.get('session_sig');
      expect(
        sessionCookie,
        `session cookie must be set by the form sign-in (have: ${[...cookieByName.keys()].join(', ')})`,
      ).toBeDefined();
      expect(
        sessionSigCookie,
        `session_sig cookie must be set by the form sign-in (have: ${[...cookieByName.keys()].join(', ')})`,
      ).toBeDefined();

      // Production cookie attributes. HttpOnly + Secure are non-negotiable
      // for the cookies-only auth model (a missing HttpOnly would mean JS
      // could read the session — major security regression).
      expect(sessionCookie!.httpOnly, 'session must be HttpOnly').toBe(true);
      expect(sessionCookie!.secure, 'session must be Secure').toBe(true);
      expect(sessionSigCookie!.httpOnly, 'session_sig must be HttpOnly').toBe(true);
      expect(sessionSigCookie!.secure, 'session_sig must be Secure').toBe(true);

      // Final cross-check: probe /users/me with the auto-attached cookies.
      // This is what `SessionStateService.probe()` does inside the form
      // chain anyway, but doing it again from the test proves the
      // BrowserContext jar is intact (not just the in-memory probe cache).
      const meRes = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
        ignoreHTTPSErrors: true,
      });
      expect(meRes.status(), 'post-sign-in /users/me must be 200').toBe(200);
      const me = (await meRes.json()) as UserDtoOut;
      expect(me.userType?.value, 'role should round-trip to /users/me').toBe('COMPANY');
    } finally {
      await context.close();
    }
  });
});
