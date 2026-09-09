/**
 * Sandbox build (`--configuration production,sandbox`): the real backend on the dev-lite + sandbox
 * profiles, two shared persona accounts, reset every night. The sign-in page shows the persona picker
 * instead of the Firebase form (docs/ci/SANDBOX.md §3).
 */
export const environment = {
  demo: false,
  sandbox: true,
};
