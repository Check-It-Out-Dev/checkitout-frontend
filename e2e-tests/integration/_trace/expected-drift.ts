/**
 * Stage 5b — shared expected-drift constants.
 *
 * Drift classes that show up identically across multiple flows belong here
 * (DRY) — each spec imports + composes with its own page-specific drifts.
 * Per-flow drift stays in the spec itself + its triage doc.
 *
 * **Don't grow this file silently.** Every entry must have a written triage
 * doc explaining why the drift is intentional. The doc lives at
 * `docs/parity-review/<date>/<flow>-trace.md` (or for shared drift like
 * the boot-time set, the original `auth-login-trace.md`).
 */

import type { ExpectedCall } from './types';

/**
 * Calls legacy makes on every authenticated shell mount that greenfield
 * deliberately doesn't. All inherited specs include this list verbatim.
 *
 * Source triage: docs/parity-review/2026-05-09/auth-login-trace.md
 *
 * Closes when:
 * - notifications port lands → drops the 2 notifications/* entries
 * - cookie-consent banner ports → drops cookie-categories (uses
 *   localStorage cio.consent for now)
 * - greenfield gets public-config wiring → drops public-config
 *
 * Until then, every authenticated-shell flow inherits this drift.
 *
 * Note: greenfield DOES hit `/api/users/me` once on shell mount (added
 * with the incomplete-profile banner #133); legacy hits it twice (shell
 * mount + landing init), so net 1 removal stays in this list.
 */
export const BOOT_TIME_LEGACY_ONLY: readonly ExpectedCall[] = [
  { method: 'GET', path: '/api/public-config' },
  { method: 'GET', path: '/api/legal/cookie-categories' },
  { method: 'GET', path: '/api/actuator/health' },
  { method: 'GET', path: '/api/users/me' },
  { method: 'GET', path: '/api/city/paged' },
  { method: 'GET', path: '/api/notifications' },
  { method: 'GET', path: '/api/notifications/unread/count' },
];

/**
 * Calls greenfield makes that legacy does NOT — intended greenfield behavior,
 * the mirror of BOOT_TIME_LEGACY_ONLY.
 *
 * greenfield's authenticated shell checks profile completeness on mount and
 * fetches the user's primary address (`GET /api/address/user/:id/primary`).
 * For a fixture company with no primary address the BE answers 404 and
 * greenfield surfaces it as a "Primary Address" missing-field chip; legacy has
 * no equivalent prefetch. The numeric id segment canonicalizes to `:id`.
 */
export const BOOT_TIME_GREENFIELD_ONLY: readonly ExpectedCall[] = [
  { method: 'GET', path: '/api/address/user/:id/primary' },
];

/**
 * The mock-session call itself (test fixture, not part of any user flow).
 * Both apps hit this; ignored from comparison.
 */
export const FIXTURE_PATHS_TO_IGNORE: readonly string[] = ['/api/test/auth/mock-session'];
