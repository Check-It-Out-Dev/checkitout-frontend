import { environment } from '../../../environments/environment';

/**
 * True in the sandbox build (`environment.sandbox.ts` via fileReplacements, `npm run build:sandbox`):
 * the real backend on the dev-lite profile behind the persona guard, two shared accounts, reset every
 * night. The sign-in page shows the persona picker instead of the Firebase form; nothing else branches.
 * Design of record: docs/ci/SANDBOX.md.
 */
export function isSandboxMode(): boolean {
  return environment.sandbox;
}
