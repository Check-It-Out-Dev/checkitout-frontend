import type { ApiErrorResponse } from '../../../src/app/core/api-frozen/hidden-models';
import type { ApiHttp, ApiResult } from './http-client';

/**
 * Layer 1 — rate-limit probe endpoint (rate-limiting oracle).
 *
 * GET /api/test/health is the BE's canonical rate-limit probe: HealthController
 * (MAIN sources — present in every profile, dev included) is annotated
 * `@RateLimit(profile = STANDARD, keyType = USER_ENDPOINT)`, so an
 * authenticated call debits the caller's per-(hashed firebaseUid, GET,
 * /test/health) STANDARD bucket, and every response — allowed or blocked —
 * carries X-RateLimit-Limit / -Remaining / -Reset headers
 * (RateLimitInterceptor.addRateLimitHeaders, "Always add rate limit headers").
 *
 * The 429 body is NOT produced by the ControllerAdvice: the interceptor
 * serializes its own JSON (RateLimitInterceptor.sendRateLimitExceededResponse)
 * shaped like the generated ApiErrorResponse envelope plus a `retry_after`
 * field. `error` carries the locale-independent machine code
 * "rate_limit_exceeded"; `message` is MessageSource-localized (Polish on this
 * DB) and must never be asserted by the oracle.
 */

/** HealthController GET /test/health 200 payload (test-support endpoint — not in the OpenAPI spec). */
export interface TestHealthResponse {
  status?: string;
  timestamp?: string;
  application?: string;
  environment?: string;
}

/** Interceptor-written 429 body: the generated ApiErrorResponse envelope + retry_after. */
export type RateLimitExceededBody = ApiErrorResponse & { retry_after?: number };

export class RateLimitApi {
  constructor(private readonly http: ApiHttp) {}

  /** GET /api/test/health — STANDARD-profile, USER_ENDPOINT-keyed probe. */
  testHealth(): Promise<ApiResult<TestHealthResponse | RateLimitExceededBody>> {
    return this.http.get<TestHealthResponse | RateLimitExceededBody>('/test/health');
  }
}
