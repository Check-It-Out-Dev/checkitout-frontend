import type { APIRequestContext, BrowserContext } from '@playwright/test';

/**
 * Parity-test state reset helpers.
 *
 * Stage 6g sweeps capture phantom↔sandbox screenshots that are pixel-diffed
 * against each other. Several pairs (cookie-banner, future stateful
 * phantoms — admin-status banners, reconsent modal, rate-limit amber bar)
 * render different visual states depending on shared global app-state that
 * survives across captures:
 *
 * - **Greenfield** stores consent decisions in `localStorage['cio.consent.v1']`
 *   (see `core/consent/consent.service.ts`).
 * - **Legacy** stores them in cookies: `cio_cc` (banner-level state) +
 *   `consent_cat_*` (per-category) + their HMAC `_sig` pairs.
 *
 * Without a reset between captures, a sweep can pick up "previous run accepted
 * cookies" state on one side but "first-visit" state on the other — the
 * resulting diff is meaningless. Use the helpers below before each
 * pair-capture to force both sides into a deterministic clean state.
 *
 * **Caller pattern** (inside a Stage 6g parity test):
 *
 * ```ts
 * import { resetForGreenfieldCapture, resetForLegacyCapture } from
 *   '../_framework/parity-state-reset';
 *
 * test.beforeEach(async ({ context }) => {
 *   await resetForGreenfieldCapture(context);
 * });
 * // ... navigate to /__sandbox/cookie-banner, screenshot
 *
 * await resetForLegacyCapture(context, LEGACY_URL);
 * // ... navigate to /__phantom/cookie-banner, screenshot
 * ```
 *
 * See `docs/parity-review/stage-6g-2026-05-13.md` §findings #1 + #236.
 */

/**
 * The localStorage key greenfield writes its consent state to. Must match
 * `STORAGE_KEY` in `src/app/core/consent/consent.service.ts` — if either
 * side renames, both have to. The unit test asserts that both string
 * literals are identical so the rename is caught.
 */
export const GREENFIELD_CONSENT_LOCAL_STORAGE_KEY = 'cio.consent.v1';

/**
 * BE test endpoint that clears session cookies (`session`, `session_sig`,
 * `partialSession`, `partialSessionSig`). Method: POST.
 *
 * NOTE: this endpoint does NOT clear the consent cookies (`cio_cc`,
 * `consent_cat_*`, `consent_cat_*_sig`). Use `BrowserContext.clearCookies()`
 * for those — they're set with `Path=/` and `Domain=.checkitout.app` (prod) /
 * `localhost` (dev), so Playwright's cookie filter clears them cleanly.
 */
export const CLEAR_SESSION_ENDPOINT = '/api/test/auth/clear-session';

/**
 * Pure function returning the init-script body that clears the greenfield
 * consent key. Extracted so the unit tier can assert that the literal in
 * here stays in sync with the service's STORAGE_KEY.
 *
 * Wrapped in try/catch because some Playwright contexts (private mode
 * emulation) reject `localStorage` access.
 */
export function buildGreenfieldConsentResetScript(): string {
  return `try { window.localStorage.removeItem(${JSON.stringify(GREENFIELD_CONSENT_LOCAL_STORAGE_KEY)}); } catch { /* private mode / SSR */ }`;
}

/**
 * Install an init-script on `context` that clears the greenfield consent
 * key before the page's first script runs. Idempotent — calling twice
 * registers two scripts that both no-op the second time.
 */
export async function clearGreenfieldConsentState(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: buildGreenfieldConsentResetScript() });
}

/**
 * Clear all consent-related and session-related cookies for the legacy
 * origin. Returns the list of cookie names that were cleared (for test
 * introspection / assertions).
 *
 * Strategy:
 *   1. `context.clearCookies()` with a name filter — wipes consent + session
 *      cookies in one call without touching unrelated cookies the test may
 *      have set (`PLAY_SESSION` for Cucumber, etc).
 *   2. Also POST `/api/test/auth/clear-session` for belt-and-suspenders on
 *      the BE side (in case the BE has any server-side session tracking
 *      beyond the cookies).
 */
export const LEGACY_RESET_COOKIE_NAMES: readonly string[] = [
  // banner-level state
  'cio_cc',
  // per-category HMAC pairs (3 categories)
  'consent_cat_ANALYTICS',
  'consent_cat_ANALYTICS_sig',
  'consent_cat_MARKETING',
  'consent_cat_MARKETING_sig',
  'consent_cat_COOKIES',
  'consent_cat_COOKIES_sig',
  // server-side session
  'session',
  'session_sig',
  'partialSession',
  'partialSessionSig',
];

/**
 * Clear legacy-side state via BrowserContext cookie removal + BE endpoint
 * POST. Both happen even if the second fails — partial reset is still
 * better than no reset, and the BE-side call is belt-and-suspenders.
 *
 * Pass the legacy origin (e.g. `http://localhost:4200` or
 * `https://localhost:4200` depending on the dev stack).
 */
export async function clearLegacyConsentAndSession(
  context: BrowserContext,
  legacyBaseUrl: string,
): Promise<void> {
  await Promise.all(LEGACY_RESET_COOKIE_NAMES.map((name) => context.clearCookies({ name })));
  await postClearSession(context.request, legacyBaseUrl);
}

/**
 * POST the BE clear-session endpoint and throw if it doesn't 2xx. Extracted
 * for unit-testability — accepts an `APIRequestContext` so tests can pass
 * a fake.
 */
export async function postClearSession(request: APIRequestContext, baseUrl: string): Promise<void> {
  const res = await request.post(`${baseUrl}${CLEAR_SESSION_ENDPOINT}`, {
    ignoreHTTPSErrors: true,
  });
  if (!res.ok()) {
    throw new Error(
      `${CLEAR_SESSION_ENDPOINT} failed at ${baseUrl}: ${res.status()} ${await res.text()}`,
    );
  }
}

/**
 * Two-sides convenience: run BOTH the greenfield reset AND the legacy
 * reset. Suitable for `test.beforeEach` in a parity sweep test that
 * captures both sides per iteration.
 *
 * If only one side is being captured this iteration, call the dedicated
 * helper instead — calling this with an unused side adds a no-op cost but
 * isn't harmful.
 */
export async function resetForParityCapture(
  context: BrowserContext,
  options: {
    readonly greenfield?: boolean;
    readonly legacyBaseUrl?: string | null;
  },
): Promise<void> {
  if (options.greenfield) {
    await clearGreenfieldConsentState(context);
  }
  if (options.legacyBaseUrl) {
    await clearLegacyConsentAndSession(context, options.legacyBaseUrl);
  }
}
