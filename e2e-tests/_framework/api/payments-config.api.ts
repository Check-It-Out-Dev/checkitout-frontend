import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ApiHttp, ApiResult } from './http-client';
import type { TestSession } from './test-session';

import type { PublicConfigDto } from '../../../src/app/api/model/public-config-dto';

/**
 * Layer 1 — payments-toggle / public-config domain service, for the
 * payments-OFF oracle (BE corpus payments_off/payments-off.feature).
 *
 * Three concerns, mirroring the BE glue (PaymentsDisabledSteps.java), which
 * drives everything through a bare unauthenticated RestTemplate:
 *
 * - `publicConfig()` — GET /public-config typed on the generated
 *   PublicConfigDto, so a BE contract change to the toggle advertisement
 *   breaks the oracle at compile time. Doubles as the toggle probe the
 *   gated scenarios self-skip on.
 * - `getAnonymous()` — arbitrary anonymous GET (BE step "anonymous client
 *   GETs {path}"), untyped by design: the corpus asserts the STATUS contract
 *   of endpoints that are unreachable, not their bodies.
 * - `postRaw()` — POST with the BE feature's literal JSON body STRING sent
 *   byte-for-byte via Buffer. Playwright JSON-re-serializes a string `data`
 *   under a json content type (it would arrive quoted); Buffer bypasses that,
 *   matching the BE glue's HttpEntity<String> exactly.
 *
 * Construct from an ANONYMOUS TestSession (TestSession.openAnonymous) — the
 * whole feature is about what unauthenticated clients can(not) reach.
 */
export class PaymentsConfigApi {
  private readonly http: ApiHttp;
  private readonly raw: APIRequestContext;

  constructor(session: TestSession) {
    this.http = session.api;
    this.raw = session.raw;
  }

  /** Build an ApiResult from a raw APIResponse (same shape ApiHttp returns). */
  private async toResult<T = unknown>(res: APIResponse): Promise<ApiResult<T>> {
    const body = await res.text();
    let json: T;
    try {
      json = (body ? JSON.parse(body) : {}) as T;
    } catch {
      json = {} as T;
    }
    return { status: res.status(), ok: res.ok(), headers: res.headers(), body, json };
  }

  /** GET /public-config — the payments-toggle advertisement, on the generated dto. */
  publicConfig(): Promise<ApiResult<PublicConfigDto>> {
    return this.http.get<PublicConfigDto>('/public-config');
  }

  /** Anonymous GET of an arbitrary /api path (BE step "anonymous client GETs …"). */
  getAnonymous(path: string): Promise<ApiResult<unknown>> {
    return this.http.get(path);
  }

  /**
   * Anonymous POST of a RAW JSON body string, byte-for-byte (Buffer), with
   * optional extra headers (e.g. Stripe-Signature for the webhook scenario).
   */
  async postRaw(
    path: string,
    rawBody: string,
    headers?: Record<string, string>,
  ): Promise<ApiResult<unknown>> {
    return this.toResult(
      await this.raw.post(`/api${path}`, {
        headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
        data: Buffer.from(rawBody),
      }),
    );
  }
}
