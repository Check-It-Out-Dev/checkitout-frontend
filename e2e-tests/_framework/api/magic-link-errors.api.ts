import type { APIRequestContext } from '@playwright/test';
import type { ApiResult } from './http-client';
import type { TestSession } from './test-session';

/**
 * Layer 1 — magic-link ERROR-contract helpers (magic-link-errors.feature).
 *
 * Complements AuthFlowsApi (which owns the typed production magic-link
 * endpoints): this class carries only what the negative-path oracle
 * additionally needs —
 *   - RAW-body posts that bypass JSON serialization, so under-specified DTOs
 *     and malformed JSON reach the BE VERBATIM (mirrors the BE glue's
 *     sendPostWithDocString / sendPostWithRawBody in MagicLinkSteps.java);
 *   - the e2e-profile /test hooks that mint an oobCode directly (no email
 *     round-trip, no Firebase rate limit) for the single-use and
 *     cross-endpoint misuse tiers.
 *
 * Contract mirrors the BE glue (MagicLinkSteps.java):
 *   POST /test/auth/generate-verification-oob   { email, firebaseUid } → { oobCode }
 *   POST /test/auth/generate-password-reset-oob { email }              → { oobCode }
 */

/**
 * The BE's 4xx error envelope for the magic-link endpoints. NOT in OpenAPI —
 * the endpoints declare an empty `@Content()` for error statuses — so it is
 * typed here, the same local-typing decision the integration tier made in
 * e2e-tests/integration/flows/magic-link-errors.spec.ts.
 */
export interface MagicLinkErrorBody {
  messageKey?: string;
  message?: string;
  requestId?: string;
  validationErrors?: Record<string, string>;
}

export class MagicLinkErrorsApi {
  private readonly ctx: APIRequestContext;

  /**
   * Takes the whole TestSession (not just ApiHttp): the raw-body posts need
   * header-level control that the ApiHttp wrapper deliberately does not
   * expose, while the /test hooks ride the session's typed transport.
   */
  constructor(private readonly session: TestSession) {
    this.ctx = session.raw;
  }

  /**
   * POST an arbitrary raw string with a JSON content-type. The body goes on
   * the wire verbatim (no serialization), so the .feature's docstring bodies
   * — including deliberately malformed JSON — arrive exactly as written.
   */
  async postRaw(path: string, rawBody: string): Promise<ApiResult<MagicLinkErrorBody>> {
    const res = await this.ctx.post(`/api${path}`, {
      // Buffer, NOT string: with a json content-type Playwright JSON-
      // serializes string `data`, so '{invalid json' arrives as the VALID
      // JSON string "\"{invalid json\"" and the BE never hits its
      // malformed-JSON handler (observed: invalid_action_code instead of
      // the contract's "invalid JSON" message). Buffers go on the wire
      // verbatim.
      data: Buffer.from(rawBody, 'utf-8'),
      headers: { 'content-type': 'application/json' },
    });
    const body = await res.text();
    let json: MagicLinkErrorBody;
    try {
      json = body ? (JSON.parse(body) as MagicLinkErrorBody) : {};
    } catch {
      json = {};
    }
    return { status: res.status(), ok: res.ok(), headers: res.headers(), body, json };
  }

  /** Mint a verification oobCode straight into the Redis store (e2e profile). */
  async generateVerificationOob(email: string, firebaseUid: string): Promise<string> {
    const r = await this.session.api.post<{ oobCode?: string }>(
      '/test/auth/generate-verification-oob',
      { email, firebaseUid },
    );
    if (!r.ok || !r.json.oobCode) {
      throw new Error(`generate-verification-oob failed: HTTP ${r.status} ${r.body.slice(0, 200)}`);
    }
    return r.json.oobCode;
  }

  /** Mint a password-reset oobCode without the email round-trip (e2e profile). */
  async generatePasswordResetOob(email: string): Promise<string> {
    const r = await this.session.api.post<{ oobCode?: string }>(
      '/test/auth/generate-password-reset-oob',
      { email },
    );
    if (!r.ok || !r.json.oobCode) {
      throw new Error(
        `generate-password-reset-oob failed: HTTP ${r.status} ${r.body.slice(0, 200)}`,
      );
    }
    return r.json.oobCode;
  }
}
