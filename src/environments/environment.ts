/**
 * Default build environment. The demo build (`--configuration demo`)
 * file-replaces this with environment.demo.ts — see angular.json.
 */
export const environment = {
  demo: false,
  sandbox: false,
  /**
   * Where the API lives, relative to the origin. Everything that talks to the backend reads this and
   * nothing hard-codes '/api': the sandbox is served under a path prefix on the same host as the demo
   * (checkitout.app/sandbox/), so its calls have to carry the prefix too.
   */
  apiBase: '/api',
};
