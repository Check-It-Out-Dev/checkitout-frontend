import { http, HttpResponse } from 'msw';

/**
 * MSW request handlers. Used by:
 * - Browser worker (for in-app dev mocking, opt-in via `?mock=1`)
 * - Playwright `test:msw` tier (registered via worker.start in test setup)
 *
 * Strategy: handlers live in this file by hand only for the smallest demos /
 * cross-cutting concerns (e.g. `/api/health`). Full feature flows are
 * generated from BE Cucumber captures via `tools/recorded-to-msw.mjs` and
 * land under `src/mocks/generated/` (gitignored as needed).
 */
export const handlers = [
  // Smoke handler — proves MSW is intercepting `/api/*` and the auth/error
  // interceptors don't choke on the synthetic response. Replaced by the real
  // BE health-check once Phase 2 exit gate (A11) lands.
  http.get('/api/health', () => HttpResponse.json({ status: 'UP', mock: true })),
];
