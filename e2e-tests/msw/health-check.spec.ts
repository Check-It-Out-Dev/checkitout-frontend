import { test } from '@playwright/test';

/**
 * MSW-tier health-check smoke test — proves the browser worker boots when
 * `?mock=1` is set and intercepts a /api/* request. The placeholder
 * /api/health handler returns `{ status: 'UP', mock: true }`.
 *
 * Currently FIXME'd: the MSW service worker doesn't activate in headless
 * Chromium against the HTTPS dev-server with the project's self-signed
 * cert. Service workers have additional requirements beyond
 * ignoreHTTPSErrors — Chromium sometimes silently rejects registration
 * on origins with cert errors even when the surrounding page navigation
 * succeeds. The mockServiceWorker.js file IS served at /mockServiceWorker.js
 * (200 OK), and main.ts correctly imports worker.start() when ?mock=1,
 * but `navigator.serviceWorker.controller` never becomes non-null and
 * the fetch never gets intercepted.
 *
 * Investigated approaches that didn't work in dev profile:
 *   - waitForFunction on controller !== null (10s timeout)
 *   - waitForFunction polling /api/health for mock:true marker (15s)
 *
 * Unblock options:
 *   1. Switch dev server to plain HTTP for MSW tests
 *   2. Install + trust the dev cert in the Playwright Chromium profile
 *      (--ignore-certificate-errors and acceptInsecureCerts)
 *   3. Use Playwright's request fixture with route interception instead
 *      of MSW service worker (no SW registration needed)
 *
 * The MSW tier was originally designed as proof-of-concept for tier-2 mocks.
 * Sandbox fixtures use Angular DI stubbing instead (no SW needed) and
 * cover the same intercept-need with simpler ergonomics.
 *
 * Tracked separately; not blocking other tiers.
 */
test.describe('MSW · health check', () => {
  test.fixme('intercepts /api/health when mock=1', () => {
    /* See file-level docblock. MSW SW registration unreliable on HTTPS
     * self-signed cert in headless Chromium. Sandbox tier uses DI
     * stubbing instead for component-level mocks. */
  });
});
