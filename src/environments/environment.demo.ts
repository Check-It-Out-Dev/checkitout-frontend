/**
 * Demo build — fully mocked backend (see core/demo/demo.interceptor.ts).
 * This build must NEVER create accounts, take payments, or contact a real
 * backend: every /api call is served from in-memory fixtures built on the
 * same typed builders the test layers use (src/testing/builders — one
 * fixture source across L1-L4 tests AND the demo).
 */
export const environment = {
  demo: true,
  sandbox: false,
  apiBase: '/api',
};
