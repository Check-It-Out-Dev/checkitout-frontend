/**
 * Sandbox build (`--configuration production,sandbox`): the real backend on the dev-lite + sandbox
 * profiles, two shared persona accounts, reset every night. The sign-in page shows the persona picker
 * instead of the Firebase form (docs/ci/SANDBOX.md §3).
 *
 * Served at https://checkitout.app/sandbox/ — one public address for the mocked demo and the real stack.
 * The build carries `baseHref: /sandbox/` (angular.json), the host strips the prefix before proxying, and
 * every API call goes to /sandbox/api so the demo's own /api (which answers 503 by design) is never hit.
 */
export const environment = {
  demo: false,
  sandbox: true,
  apiBase: '/sandbox/api',
};
