import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ApiHttp, ApiResult } from './http-client';
import { TestSession, type PlaywrightRequestFactory } from './test-session';
import type { UserProfilePatch } from './profile.api';

import { StepUpActionType } from '../../../src/app/api/model/step-up-action-type';
import type { StepUpCheckResponse } from '../../../src/app/api/model/step-up-check-response';
import type { StepUpRequestDto } from '../../../src/app/api/model/step-up-request-dto';
import type { StepUpRequestResponse } from '../../../src/app/core/api-frozen/hidden-models';
import type { StepUpTokenResponse } from '../../../src/app/api/model/step-up-token-response';
import type { StepUpVerifyDto } from '../../../src/app/api/model/step-up-verify-dto';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';

/**
 * Layer 1 — step-up authentication domain service (step-up-auth.feature port).
 *
 * Typed methods over the OpenAPI-generated step-up DTOs, mirroring the BE
 * Cucumber glue (StepUpAuthSteps.java) and the generated client
 * (src/app/api/api/step-up-auth.api.ts):
 *
 *   GET  /step-up/check?actionType=…  → StepUpCheckResponse
 *   POST /step-up/request {actionType} → StepUpRequestResponse (emits the
 *        6-digit code email that GreenMail captures)
 *   POST /step-up/verify {actionType, code} → StepUpTokenResponse (one-time
 *        token, consumed from Redis on first use)
 *   PATCH /users/{id} {email} + X-Step-Up-Token header — the protected op.
 *
 * The email PATCH goes through the raw APIRequestContext because ApiHttp
 * exposes no per-call headers and the X-Step-Up-Token header IS the contract
 * under test (same reason profile.api.ts uses raw for DELETE).
 *
 * Also hosts the mock-session opener this oracle needs: TestSession.open
 * discards the mock-session response body, but the step-up steps stage state
 * through uid-keyed /test hooks (set-initial-setup / set-email-verified) and
 * the KMS TOTP bridge, so the firebaseUid + userId the BE returns from
 * POST /test/auth/mock-session must be captured at seed time (deterministic
 * on a fresh dev DB — the same reason ActorProfile.firebaseUid exists).
 */

/** Roles POST /test/auth/mock-session accepts (superset of ActorRole). */
export type MockSessionRole = 'COMPANY' | 'INFLUENCER' | 'ADMIN' | 'PENDING_ADMIN';

/** JSON body of the BE's MockSessionResponse record. */
export interface MockSessionResponseBody {
  firebaseUid?: string;
  userId?: number;
  role?: string;
  partial?: boolean;
}

export interface MockSessionOptions {
  email: string;
  role: MockSessionRole;
  /**
   * EXPLICIT tri-state on the BE (TestAuthController): omitted leaves the
   * flag untouched; true/false forces initialAccountSetupCompleted.
   */
  setupCompleted?: boolean;
  /** Pin NEW rows to a specific Firebase UID (see ActorProfile.firebaseUid). */
  firebaseUid?: string;
}

/** One seeded mock-session actor with the identity the BE reported at seed. */
export interface MockSessionActor {
  readonly session: TestSession;
  readonly email: string;
  readonly role: MockSessionRole;
  readonly firebaseUid?: string;
  readonly userId?: number;
}

/** Build an ApiResult from a raw APIResponse (same shape ApiHttp returns). */
async function toResult<T = unknown>(res: APIResponse): Promise<ApiResult<T>> {
  const body = await res.text();
  let json: T;
  try {
    json = (body ? JSON.parse(body) : {}) as T;
  } catch {
    json = {} as T;
  }
  return { status: res.status(), ok: res.ok(), headers: res.headers(), body, json };
}

/**
 * POST /test/auth/mock-session through an EXISTING session's transport,
 * returning the parsed response (unlike TestSession.open, which discards it).
 * Re-seeding the same email+role on the same cookie jar is also the
 * "re-authenticates" collapse: the BE reissues fresh session cookies with the
 * current tokenVersion. Retries the transient 409 like TestSession.open.
 */
export async function seedMockSession(
  session: TestSession,
  opts: MockSessionOptions,
): Promise<ApiResult<MockSessionResponseBody>> {
  let last: ApiResult<MockSessionResponseBody> | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await session.api.post<MockSessionResponseBody>('/test/auth/mock-session', {
      email: opts.email,
      role: opts.role,
      partial: false,
      ...(opts.setupCompleted !== undefined ? { setupCompleted: opts.setupCompleted } : {}),
      ...(opts.firebaseUid ? { firebaseUid: opts.firebaseUid } : {}),
    });
    if (last.status !== 409) return last;
    await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
  }
  return last!;
}

/**
 * Open an isolated context and seed it via mock-session, capturing the
 * firebaseUid + userId from the seed response (with a /users/me fallback for
 * defensiveness). Throws on any seed failure — callers that need to inspect
 * the failure status (e.g. the PENDING_ADMIN role-support probe) should use
 * {@link seedMockSession} on a TestSession.openAnonymous context instead.
 */
export async function openMockSession(
  playwright: PlaywrightRequestFactory,
  opts: MockSessionOptions,
): Promise<MockSessionActor> {
  const session = await TestSession.openAnonymous(playwright);
  try {
    const r = await seedMockSession(session, opts);
    if (!r.ok) {
      throw new Error(
        `mock-session failed for ${opts.email} (${opts.role}): HTTP ${r.status} ${r.body.slice(0, 200)}`,
      );
    }
    let firebaseUid = r.json.firebaseUid;
    let userId = r.json.userId;
    if (!firebaseUid || userId == null) {
      const me = await session.api.get<UserDtoOut & { firebaseUserId?: string }>('/users/me');
      if (!me.ok) throw new Error(`post-seed GET /users/me failed: HTTP ${me.status}`);
      firebaseUid = firebaseUid ?? me.json.firebaseUserId;
      userId = userId ?? me.json.id;
    }
    return { session, email: opts.email, role: opts.role, firebaseUid, userId };
  } catch (err) {
    await session.dispose().catch(() => undefined);
    throw err;
  }
}

export class StepUpApi {
  private readonly http: ApiHttp;
  private readonly raw: APIRequestContext;

  constructor(session: TestSession) {
    this.http = session.api;
    this.raw = session.raw;
  }

  // ── Production step-up endpoints ────────────────────────────────────────────

  /** GET /step-up/check?actionType=… (matches the codegen client path). */
  check(actionType: StepUpActionType): Promise<ApiResult<StepUpCheckResponse>> {
    return this.http.get<StepUpCheckResponse>('/step-up/check', { actionType });
  }

  /** POST /step-up/request — emits the 6-digit EMAIL_CODE via JavaMailSender. */
  requestCode(actionType: StepUpActionType): Promise<ApiResult<StepUpRequestResponse>> {
    const dto: StepUpRequestDto = { actionType };
    return this.http.post<StepUpRequestResponse>('/step-up/request', dto);
  }

  /** POST /step-up/verify — EMAIL_CODE or TOTP code → one-time step-up token. */
  verify(actionType: StepUpActionType, code: string): Promise<ApiResult<StepUpTokenResponse>> {
    const dto: StepUpVerifyDto = { actionType, code };
    return this.http.post<StepUpTokenResponse>('/step-up/verify', dto);
  }

  /**
   * The step-up-protected operation: PATCH /users/{id} {email}, optionally
   * carrying the X-Step-Up-Token header. Raw context — ApiHttp has no per-call
   * header support and the header is exactly what this oracle exercises.
   */
  async patchUserEmail(
    userId: number,
    email: string,
    stepUpToken?: string,
  ): Promise<ApiResult<UserDtoOut>> {
    const body: UserProfilePatch = { email };
    const res = await this.raw.patch(`/api/users/${userId}`, {
      ...(stepUpToken ? { headers: { 'X-Step-Up-Token': stepUpToken } } : {}),
      data: body,
    });
    return toResult<UserDtoOut>(res);
  }

  /** Sparse non-email profile PATCH (never step-up-gated) — typed like profile.api. */
  patchUser(userId: number, patch: UserProfilePatch): Promise<ApiResult<UserDtoOut>> {
    return this.http.patch<UserDtoOut>(`/users/${userId}`, patch);
  }

  // ── /test staging hooks (uid-keyed, PG-side) ────────────────────────────────

  /**
   * POST /test/registry/set-initial-setup — flips initialAccountSetupCompleted
   * in PostgreSQL and evicts the user cache (the flag /step-up/check reads).
   * Same hook the BE glue calls in setInitialAccountSetupCompleted.
   */
  async setInitialSetup(firebaseUid: string, completed: boolean): Promise<void> {
    const r = await this.http.post('/test/registry/set-initial-setup', {
      firebaseUid,
      completed,
    });
    if (!r.ok) {
      throw new Error(`set-initial-setup failed: HTTP ${r.status} ${r.body.slice(0, 160)}`);
    }
  }

  /**
   * POST /test/registry/set-email-verified — the PG half of the BE glue's
   * emailVerified toggle. The Firebase half (/test/auth/update-firebase-user)
   * is deliberately NOT called here: mock-session firebaseUids don't exist in
   * the real Firebase project, and PG is what the step-up flow reads.
   */
  async setEmailVerifiedPg(firebaseUid: string, verified: boolean): Promise<void> {
    const r = await this.http.post('/test/registry/set-email-verified', {
      firebaseUid,
      verified,
    });
    if (!r.ok) {
      throw new Error(`set-email-verified failed: HTTP ${r.status} ${r.body.slice(0, 160)}`);
    }
  }
}
