import type { BrowserContext, Page } from '@playwright/test';
import type { ActorProfile } from './actor';

/**
 * Cookie-only auth recipe for Playwright. See memory
 * `reference_mock_session_token_pattern.md` for the why and
 * `feedback_no_client_token_storage.md` for the constraint.
 *
 * Two steps that have to be exactly right:
 *
 *   1. Hit `${origin}/api/test/auth/mock-session` (NOT BE_URL directly)
 *      so the dev-server proxy rewrites cookie Domain/SameSite/Path for
 *      the http:4201 origin.
 *   2. Mint the session with an IN-PAGE same-origin fetch — the BE binds
 *      the session to a UA+IP fingerprint, so a cookie seeded from Node's
 *      APIRequestContext is rejected on every browser request (401 →
 *      authGuard bounce to /auth/sign-in). Fetching from inside the page
 *      makes the fingerprint match by construction.
 *
 * No localStorage / sessionStorage seed is required: greenfield's
 * authGuard probes `/users/me` (cookies attached automatically via
 * `withCredentials=true`) and the BE's JwtAuthenticationFilter
 * authenticates via the cookies.
 */
export const GREENFIELD_URL =
  process.env['GREENFIELD_URL'] ?? process.env['PW_BASE_URL'] ?? 'https://localhost:4201';

/**
 * Whether the session cookies served from `origin` should carry the Secure attribute.
 *
 * A browser DISCARDS a Secure cookie that arrives over plain http, so a backend that set one there
 * would hand out a session nobody keeps. The nightly full-stack tier serves the app over http on the
 * runner and configures the backend accordingly -- it prints "session cookie without Secure: sign-in
 * will work" before the tests start -- so asserting Secure unconditionally asserts that sign-in is
 * broken. Asserting it against the scheme keeps the check meaningful in BOTH environments: over
 * https Secure is mandatory, over http its absence is the correct behaviour, and a backend that got
 * either one backwards fails here.
 *
 * Takes the origin rather than closing over GREENFIELD_URL, because the integration tier resolves
 * its own copy of that constant and the two must not be able to disagree.
 */
export function sessionCookiesShouldBeSecure(origin: string = GREENFIELD_URL): boolean {
  return origin.startsWith('https://');
}

/**
 * Authenticate the actor against the given origin via cookies.
 *
 * `origin` defaults to `GREENFIELD_URL` for greenfield-only callers
 * (visual-parity, scenarios). Integration tests pass both legacy and
 * greenfield origins since they need both apps to be authenticated to
 * capture comparable traces.
 *
 * The same recipe works for both: legacy and greenfield are both
 * cookie-only — `context.request.post(/api/test/auth/mock-session)`
 * sets `session` + `session_sig` HttpOnly cookies on the BrowserContext
 * which subsequent `page.goto()` calls carry automatically.
 */
export async function authenticate(
  _context: BrowserContext,
  page: Page,
  profile: ActorProfile,
  origin: string = GREENFIELD_URL,
): Promise<void> {
  // The session must be minted FROM INSIDE THE BROWSER: the BE binds the
  // session to a UA+IP fingerprint (JwtAuthenticationFilter rejects a cookie
  // presented with a different fingerprint — session-hijack control). A
  // context.request seed carries Node's identity, so every subsequent page
  // request 401'd and the authGuard bounced to /auth/sign-in. An in-page
  // same-origin fetch makes the fingerprint match by construction.
  if (!page.url().startsWith(origin)) {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  }
  const result = await page.evaluate(
    async ({ email, role }) => {
      const res = await fetch('/api/test/auth/mock-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, role, partial: false }),
      });
      return { status: res.status, body: await res.text() };
    },
    { email: profile.email, role: profile.role },
  );
  if (result.status !== 200) {
    throw new Error(
      `mock-session failed at ${origin} for ${profile.id}: ${result.status} ${result.body}`,
    );
  }
  // Cookies are now set in the browser (session + session_sig, HttpOnly).
  // No body-token reading, no localStorage seed — greenfield's authGuard
  // probes /users/me which authenticates via the cookies. The token in
  // the response body is intentionally ignored here.
}
