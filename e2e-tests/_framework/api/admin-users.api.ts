import type { APIRequestContext } from '@playwright/test';
import { BE_URL } from '../../integration/_actor';
import { ApiHttp, type ApiResult } from './http-client';
import type { TestSession } from './test-session';

import type { AccountStatus } from '../../../src/app/api/model/account-status';
import type { PageUserDtoOut } from '../../../src/app/api/model/page-user-dto-out';
import type { UserDtoIn } from '../../../src/app/api/model/user-dto-in';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';

/**
 * Layer 1 — Admin user-management domain service, for the two BE admin
 * features (admin-user-management + admin/admin-inactive-flow-consolidated),
 * mirroring the BE glue (AdminUserManagementSteps.java +
 * AdvancedSessionSecuritySteps.java + AdminStatusFlowSteps.java):
 *
 *   - user listing        → GET  /users/paged?page&size   (Spring Page<UserDtoOut>)
 *   - profile view        → GET  /users/{id}
 *   - ban / unban / set-status → PATCH /users/{id} { accountStatus } — ONE wire
 *     call behind all three BE steps ("ban" = BANNED, "unban" = ACTIVE; the ban
 *     reason is client-side context only, logged-not-stored, same as the BE glue)
 *   - session refresh     → POST /auth/refresh-session (empty JSON body — the
 *     integration tier confirmed the BE accepts `{}` when called directly)
 *
 * Plus the stored-token primitives for the BE's "stores their current token as X"
 * / "using stored token X returns N" steps: the FE analogue of the BE's raw
 * session+session_sig cookie capture is a storageState() snapshot of the actor's
 * HttpOnly cookie jar, replayed from a throwaway APIRequestContext.
 *
 * Typed on the generated models (AccountStatus / UserDtoIn / UserDtoOut /
 * PageUserDtoOut) so a BE contract change breaks this oracle at compile time.
 */

/** The sparse PATCH /users/{id} body used by every admin status operation. */
export type AccountStatusPatch = Pick<UserDtoIn, 'accountStatus'>;

export class AdminUsersApi {
  constructor(private readonly http: ApiHttp) {}

  /** GET /users/paged — ADMIN-only paginated listing (BE glue: page=0&size=20). */
  listUsersPaged(page = 0, size = 20): Promise<ApiResult<PageUserDtoOut>> {
    return this.http.get<PageUserDtoOut>('/users/paged', { page, size });
  }

  /** GET /users/{id} — ADMIN-only full-profile view of any user. */
  getUser(userId: number): Promise<ApiResult<UserDtoOut>> {
    return this.http.get<UserDtoOut>(`/users/${userId}`);
  }

  /**
   * PATCH /users/{id} { accountStatus } — the single endpoint behind the BE's
   * ban / unban / set-status steps. `accountStatus` is typed on the generated
   * enum (UserDtoIn.accountStatus: AccountStatus), so a renamed status breaks
   * compilation before it can reach the wire.
   */
  setAccountStatus(userId: number, accountStatus: AccountStatus): Promise<ApiResult<UserDtoOut>> {
    const body: AccountStatusPatch = { accountStatus };
    return this.http.patch<UserDtoOut>(`/users/${userId}`, body);
  }

  /**
   * POST /auth/refresh-session with the session's CURRENT cookie jar. Succeeds
   * only for sessions minted from a real Firebase idToken — for mock-session
   * UIDs the BE's createRefreshedSession hits Firebase USER_NOT_FOUND — but the
   * FAILURE contract (disabled account → 401) is a pure PG read and fully
   * exercisable (see e2e-tests/integration/flows/admin-inactive-flow.spec.ts).
   */
  attemptSessionRefresh(): Promise<ApiResult<unknown>> {
    return this.http.post('/auth/refresh-session', {});
  }
}

/**
 * A frozen copy of one actor's session cookie jar (session + session_sig),
 * the FE analogue of the BE glue's storedTokens map. Snapshots stay valid
 * as probe material after the live session is re-seeded or invalidated.
 */
export type SessionCookieSnapshot = Awaited<ReturnType<APIRequestContext['storageState']>>;

/**
 * Structural type for the Playwright worker fixture, widened over
 * test-session.ts's PlaywrightRequestFactory to carry `storageState`
 * (needed to replay a snapshot into a fresh cookie jar).
 */
export type SnapshotRequestFactory = {
  request: {
    newContext(options?: {
      baseURL?: string;
      ignoreHTTPSErrors?: boolean;
      storageState?: SessionCookieSnapshot;
    }): Promise<APIRequestContext>;
  };
};

/** "stores their current token as X" — capture the actor's current cookie jar. */
export async function captureSessionToken(session: TestSession): Promise<SessionCookieSnapshot> {
  return session.raw.storageState();
}

/**
 * "using stored token X calling P returns N" — replay a snapshot from an
 * isolated throwaway context and GET the API path with it. The live actor's
 * session is untouched; only the frozen cookies are on the wire.
 */
export async function probeWithStoredToken(
  playwright: SnapshotRequestFactory,
  snapshot: SessionCookieSnapshot,
  path: string,
): Promise<ApiResult<unknown>> {
  const ctx = await playwright.request.newContext({
    baseURL: BE_URL,
    ignoreHTTPSErrors: true,
    storageState: snapshot,
  });
  try {
    return await new ApiHttp(ctx).get(path);
  } finally {
    await ctx.dispose();
  }
}
