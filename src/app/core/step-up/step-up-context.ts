import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Context token consumed by the step-up interceptor. When non-null on an
 * outgoing request, the interceptor adds an `X-Step-Up-Token: <value>` header
 * and the BE can authorise the privileged write.
 *
 * Cleared per-request — single-use semantics match the BE which deletes the
 * token on successful read.
 */
export const STEP_UP_TOKEN = new HttpContextToken<string | null>(() => null);

/**
 * Helper for callers: builds an `HttpContext` carrying a step-up token.
 * Pass the result into the generated client's `options.context` parameter.
 */
export function withStepUpToken(token: string): HttpContext {
  return new HttpContext().set(STEP_UP_TOKEN, token);
}
