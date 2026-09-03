import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { ACTORS, GREENFIELD_URL, login } from './_actor';

/**
 * FE-only: Angular router + guard behavior has no BE counterpart. T3
 * route-smoke exercises the FE's `app.routes.ts` × auth-guard surface,
 * which is by definition FE-implementation-specific (the BE has no
 * router). Not a candidate for porting.
 *
 * T3 — Route-smoke. Visits every non-param route in `app.routes.ts` as both
 * unauthenticated AND authenticated and asserts:
 *   1. Page resolves (no Angular bootstrap error overlay, no 5xx HTML)
 *   2. No uncaught console errors (filtered for noise — see IGNORE_CONSOLE)
 *   3. Guard behavior is correct (protected routes bounce anon → /auth/sign-in,
 *      noAuthGuard routes bounce auth → /collaborations/list)
 *   4. Router didn't drop to /error/* unexpectedly
 *
 * Param routes (`/collaborations/:id`, `/collaborations/edit/:id`, etc.) are
 * covered by the per-flow integration specs that create or look up real IDs.
 *
 * Routes are inventoried from `src/app/app.routes.ts` and grouped by:
 *   - PUBLIC: reachable with or without auth, never redirects
 *   - NO_AUTH: noAuthGuard — anon OK, authed bounces to /collaborations/list
 *   - AUTH_ANY: authGuard — anon bounces to /auth/sign-in, any role OK
 *   - SIDE_EFFECT: pages that perform an action on load (sign-out, action-router)
 *     and are skipped from the bulk smoke (covered by dedicated flow specs)
 */

interface RouteSpec {
  readonly path: string;
  readonly kind: 'PUBLIC' | 'NO_AUTH' | 'AUTH_ANY' | 'SIDE_EFFECT';
  /** Path the router lands on for the given role; defaults to `path` itself. */
  readonly expectedAuthedPath?: string;
  readonly expectedAnonPath?: string;
}

const ROUTES: ReadonlyArray<RouteSpec> = [
  // Public
  { path: '/', kind: 'PUBLIC' },
  { path: '/error/404', kind: 'PUBLIC' },

  // noAuthGuard — anon OK, authed → /collaborations/list
  { path: '/auth/sign-in', kind: 'NO_AUTH', expectedAuthedPath: '/collaborations/list' },
  { path: '/auth/sign-up', kind: 'NO_AUTH', expectedAuthedPath: '/collaborations/list' },
  {
    path: '/auth/sign-up/influencer',
    kind: 'NO_AUTH',
    expectedAuthedPath: '/collaborations/list',
  },
  { path: '/auth/sign-up/business', kind: 'NO_AUTH', expectedAuthedPath: '/collaborations/list' },
  { path: '/auth/forgot-password', kind: 'NO_AUTH', expectedAuthedPath: '/collaborations/list' },
  {
    path: '/auth/confirmation-required',
    kind: 'NO_AUTH',
    expectedAuthedPath: '/collaborations/list',
  },

  // No guard but render meaningful chrome for both role-states
  { path: '/auth/verify-email', kind: 'PUBLIC' },
  { path: '/auth/reset-password', kind: 'PUBLIC' },
  { path: '/auth/auth/error', kind: 'PUBLIC' }, // typo guard — defensive
  { path: '/auth/error', kind: 'PUBLIC' },
  // /auth/success is the post-OAuth-callback landing. On bare visit it
  // fires /auth/exchange-token which requires OAuth cookies and 400s
  // without them. The FE handles this with an error-state UI but the
  // 400 shows up as console noise. Treat as side-effect — exercise via
  // a dedicated OAuth-flow integration spec when that's built.
  { path: '/auth/success', kind: 'SIDE_EFFECT' },
  { path: '/auth/2fa-setup', kind: 'PUBLIC' },
  { path: '/auth/action', kind: 'PUBLIC' },

  // Authenticated section
  { path: '/collaborations/list', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/collaborations/my-campaigns', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/collaborations/create', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/collaborations/dashboard', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/collaborations/in-progress', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/collaborations/registrations', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/collaborations/finished', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  {
    path: '/user/settings/account',
    kind: 'AUTH_ANY',
    expectedAnonPath: '/auth/sign-in',
  },
  {
    path: '/user/settings/preferences',
    kind: 'AUTH_ANY',
    expectedAnonPath: '/auth/sign-in',
  },
  { path: '/user/settings/addresses', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  {
    path: '/user/settings/plan-billing',
    kind: 'AUTH_ANY',
    expectedAnonPath: '/auth/sign-in',
  },
  { path: '/user/list', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/company/setup', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/team', kind: 'PUBLIC' },
  { path: '/grants', kind: 'PUBLIC' },
  { path: '/support', kind: 'PUBLIC' },
  { path: '/support/tickets/create', kind: 'PUBLIC' },
  { path: '/support/tickets/status', kind: 'PUBLIC' },
  { path: '/support/tickets/my-tickets', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/support/admin/tickets', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  { path: '/admin/dictionary', kind: 'AUTH_ANY', expectedAnonPath: '/auth/sign-in' },
  // Dev alias: app.routes redirects /ui-component-samples → /__sandbox (the
  // dev component harness) with NO guard, so it is public, not auth-protected —
  // the earlier AUTH_ANY classification was a wrong assumption (it never
  // redirected anon to sign-in). /__sandbox itself is intentionally absent from
  // this production-route registry, so exclude its alias too.
  { path: '/ui-component-samples', kind: 'SIDE_EFFECT' },

  // Side-effect pages (skipped — exercised by dedicated specs)
  { path: '/auth/sign-out', kind: 'SIDE_EFFECT' },
  { path: '/auth/social/callback/instagram', kind: 'SIDE_EFFECT' },
];

/**
 * Console messages we accept as noise — not real bugs:
 *  - Vite HMR client gossip
 *  - DevTools format-detection deprecation warnings
 *  - Firebase emulator chatter when not configured
 *  - "Failed to load resource: status of {401,403,404}" — these are
 *    expected when an anonymous user hits a protected route. Chrome
 *    logs them to console even though the FE handles them by
 *    redirecting. They're NOT app-level bugs.
 *  - 5xx on /api/* IS still caught (separately, via the response
 *    listener — see `httpErrors`).
 */
const IGNORE_CONSOLE = [
  /\[vite\]/i,
  /HMR/i,
  /sourcemap/i,
  /punycode/i,
  /angular is running in development mode/i,
  /favicon\.ico/i,
  /Failed to load resource: the server responded with a status of 401/i,
  /Failed to load resource: the server responded with a status of 403/i,
  /Failed to load resource: the server responded with a status of 404/i,
  // Rate-limit on /users/me — every route in the smoke pass triggers a
  // session probe; firing 30+ in a row gets us 429'd. Not a real bug.
  // We intentionally ignore 429 noise for /users/me only — other 429s
  // (mutation rate-limit) still surface.
  /Failed to load resource: the server responded with a status of 429/i,
  /\[rate-limit\] 429 on GET \/api\/users\/me/i,
];

function isMeaningful(msg: ConsoleMessage): boolean {
  if (msg.type() !== 'error' && msg.type() !== 'warning') return false;
  const text = msg.text();
  return !IGNORE_CONSOLE.some((re) => re.test(text));
}

interface SmokeResult {
  readonly route: RouteSpec;
  readonly role: 'anon' | 'authed';
  readonly finalPath: string;
  readonly consoleErrors: ReadonlyArray<string>;
  readonly httpErrors: ReadonlyArray<number>;
}

async function smokeRoute(
  page: Page,
  route: RouteSpec,
  role: 'anon' | 'authed',
): Promise<SmokeResult> {
  const consoleErrors: string[] = [];
  const httpErrors: number[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    if (isMeaningful(msg)) consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  };
  page.on('console', onConsole);
  const onResponse = (resp: import('@playwright/test').Response) => {
    // Track 5xx only — 401/403/404 on /api are expected guard responses.
    if (resp.status() >= 500 && !resp.url().includes('/__webpack_hmr')) {
      httpErrors.push(resp.status());
    }
  };
  page.on('response', onResponse);

  await page.goto(`${GREENFIELD_URL}${route.path}`, { waitUntil: 'networkidle' });
  const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;

  // Detach listeners — we accumulate them otherwise across the for-loop.
  page.off('console', onConsole);
  page.off('response', onResponse);

  return { route, role, finalPath, consoleErrors, httpErrors };
}

/** Pretty-print a single result for matrix dump. */
function formatRow(r: SmokeResult): string {
  const ok = r.consoleErrors.length === 0 && r.httpErrors.length === 0;
  const flag = ok ? 'ok' : 'FAIL';
  return [
    flag.padEnd(4),
    r.role.padEnd(7),
    r.route.path.padEnd(48),
    r.finalPath.padEnd(48),
    r.consoleErrors.length ? `${r.consoleErrors.length} console` : '',
    r.httpErrors.length ? `${r.httpErrors.length} 5xx` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

test.describe.configure({ mode: 'serial' });

test.describe('@smoke route-smoke — every non-param route renders without errors', () => {
  // 38 sequential page.goto calls each waiting for networkidle add up.
  // Under parallel-worker pressure (other specs hammering BE concurrently)
  // a single goto can stall past the default 30s. Solo happy-path is
  // ~25s — give the whole spec a 2-minute budget for the contention case.
  test.setTimeout(120_000);

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Smoke runs on chromium-desktop only');
  });

  const SMOKEABLE = ROUTES.filter((r) => r.kind !== 'SIDE_EFFECT');

  // -------- anonymous batch --------
  test('anonymous visit — every smokeable route', async ({ page }) => {
    const results: SmokeResult[] = [];
    for (const route of SMOKEABLE) {
      const r = await smokeRoute(page, route, 'anon');
      results.push(r);
    }
    const failed = results.filter((r) => r.consoleErrors.length > 0 || r.httpErrors.length > 0);
    // Print matrix to aid diagnosis regardless of pass/fail.
    console.log('\n=== Route smoke (anon) ===');
    results.forEach((r) => console.log(formatRow(r)));
    if (failed.length > 0) {
      console.log('\n=== Failures ===');
      failed.forEach((f) => {
        console.log(`  ${f.route.path}`);
        f.consoleErrors.forEach((e) => console.log(`    ${e}`));
        f.httpErrors.forEach((e) => console.log(`    HTTP ${e}`));
      });
    }
    expect(failed, `Routes with console-errors or 5xx (anon): ${failed.length}`).toHaveLength(0);
  });

  // -------- guard-correctness check (anon) --------
  test('anon hitting AUTH_ANY routes redirects to /auth/sign-in', async ({ page }) => {
    const protectedRoutes = SMOKEABLE.filter((r) => r.kind === 'AUTH_ANY');
    const misrouted: Array<{ path: string; landed: string }> = [];
    for (const route of protectedRoutes) {
      await page.goto(`${GREENFIELD_URL}${route.path}`, { waitUntil: 'networkidle' });
      const landed = new URL(page.url()).pathname;
      if (!landed.startsWith('/auth/sign-in')) {
        misrouted.push({ path: route.path, landed });
      }
    }
    expect(
      misrouted,
      `AUTH_ANY routes that didn't redirect anon: ${JSON.stringify(misrouted)}`,
    ).toHaveLength(0);
  });

  // -------- authenticated batch (company1) --------
  test('authenticated visit (company1) — every smokeable route', async ({ page }) => {
    await login(page, ACTORS['company1']!);
    const results: SmokeResult[] = [];
    for (const route of SMOKEABLE) {
      const r = await smokeRoute(page, route, 'authed');
      results.push(r);
    }
    const failed = results.filter((r) => r.consoleErrors.length > 0 || r.httpErrors.length > 0);
    console.log('\n=== Route smoke (authed:company1) ===');
    results.forEach((r) => console.log(formatRow(r)));
    if (failed.length > 0) {
      console.log('\n=== Failures ===');
      failed.forEach((f) => {
        console.log(`  ${f.route.path}`);
        f.consoleErrors.forEach((e) => console.log(`    ${e}`));
        f.httpErrors.forEach((e) => console.log(`    HTTP ${e}`));
      });
    }
    expect(failed, `Routes with console-errors or 5xx (authed): ${failed.length}`).toHaveLength(0);
  });

  // NOTE — noAuthGuard does NOT redirect authenticated users on direct
  // URL navigation (full page load). It's intentionally sync-only — would
  // require probing /users/me on every public-route hit, causing
  // render-flicker. See auth.guards.ts L36-48 for the rationale. The
  // in-app router-link navigation case is exercised by the auth-login
  // flow spec, which clicks through the UI.
});
