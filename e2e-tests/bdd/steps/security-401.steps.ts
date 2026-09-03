import type { APIRequestContext } from '@playwright/test';
import { ACTORS } from '../../_framework/actor';
import { ApiHttp } from '../../_framework/api/http-client';
import type { ApiResult } from '../../_framework/api/http-client';
import { TestSession } from '../../_framework/api/test-session';
import { BE_URL } from '../../integration/_actor';
import { After, Given, Then, When, expect } from './fixtures';

import type { ApiErrorResponse } from '../../../src/app/core/api-frozen/hidden-models';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';

/**
 * Authentication-boundary oracle — Layer 2 (functional), for
 * security-401-unauthorized.feature, mirroring the BE glue (SecuritySteps.java
 * tryAccessProtectedEndpoint / tryAccessWithExpiredSession +
 * ErrorAssertionSteps.java verifyErrorMessageContains) against the LIVE BE.
 *
 * Two transports, both plain framework pieces (no new api file needed):
 *   - anonymous: TestSession.openAnonymous — an isolated APIRequestContext
 *     with an EMPTY cookie jar, exactly the "visitor" the BE glue models with
 *     a cookie-less RestTemplate exchange.
 *   - stale: the dispose-and-reuse-stale-cookies pattern — mock-session seeds
 *     the real HttpOnly session/session_sig pair, the pair is stored (the BE
 *     glue's context.getSessionCookie()/getSessionSigCookie() move), the
 *     original transport is disposed, and the pair is replayed as a manual
 *     Cookie header from a fresh transport with the signature no longer
 *     validating against the token. That lands in the SAME
 *     writeErrorResponse(401, error.auth.invalid_token) the BE's 15s-expired
 *     JWT lands in (ExpiredJwtException → generic catch) — see the feature
 *     header, adaptation 4, for why real expiry is not reachable here.
 *
 * Assertions are locale-stable: the filter's 401 body carries a LOCALIZED
 * message (Polish on this stack) and no messageKey, so the steps assert the
 * generated ApiErrorResponse envelope (status/error/path/requestId +
 * X-Request-ID header) and pin the dictionary key only once the wire exposes
 * it (feature header, adaptation 2). Localized message text is never matched.
 *
 * State lives on a local World view (cast pattern — fixtures.ts untouched)
 * under sec401-prefixed keys, except lastResponse: that is the tier's shared
 * field so the scenarios reuse `the response status should be {int}` from
 * partnership.steps.ts, keeping the BE source's own Then wording.
 */

interface Security401World {
  /** Anonymous transport for the visitor scenario (empty cookie jar). */
  sec401Anon?: TestSession;
  /** The signed-in company session whose cookie pair later goes stale. */
  sec401Session?: TestSession;
  /** The stored session cookie pair (the BE glue's stored-cookies analogue). */
  sec401Cookies?: { session: string; sessionSig: string };
  /** Fresh transport that replays the stale pair; disposed in After. */
  sec401StaleCtx?: APIRequestContext;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function record(w: Security401World, r: ApiResult): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function snippet(w: Security401World): string {
  return (w.lastResponse?.body ?? '(none)').slice(0, 300);
}

/** Parse the last body as the generated error envelope (L0 contract type). */
function parseEnvelope(w: Security401World): ApiErrorResponse {
  try {
    return JSON.parse(w.lastResponse?.body ?? '') as ApiErrorResponse;
  } catch {
    throw new Error(`401 body is not the JSON error envelope: ${snippet(w)}`);
  }
}

function requireSession(w: Security401World): TestSession {
  if (!w.sec401Session) {
    throw new Error('no signed-in session — did the signed-in Given run?');
  }
  return w.sec401Session;
}

function requireCookies(w: Security401World): { session: string; sessionSig: string } {
  if (!w.sec401Cookies) {
    throw new Error('no stored cookie pair — did the valid-session-cookie Then run?');
  }
  return w.sec401Cookies;
}

/**
 * Derive a signature that no longer validates against the token: flip the
 * last character deterministically. The cookie-pair HMAC check
 * (JwtAuthenticationFilter.validateHmacSignature) is the first gate for a
 * presented pair and is config-independent, so this is a deterministic route
 * into the same 401 error.auth.invalid_token rejection an expired JWT takes.
 */
function corruptSignature(sig: string): string {
  if (!sig) throw new Error('empty session_sig value — cannot derive a stale pair');
  const last = sig.charAt(sig.length - 1);
  return sig.slice(0, -1) + (last === 'A' ? 'B' : 'A');
}

After(async ({ world }) => {
  const w = world as Security401World;
  await w.sec401Anon?.dispose().catch(() => undefined);
  await w.sec401Session?.dispose().catch(() => undefined);
  await w.sec401StaleCtx?.dispose().catch(() => undefined);
  w.sec401Anon = undefined;
  w.sec401Session = undefined;
  w.sec401StaleCtx = undefined;
});

// ── Scenario 1 — unauthenticated access ──────────────────────────────────────

Given('I am not logged in', async ({ playwright, world }) => {
  const w = world as Security401World;
  // Fresh isolated APIRequestContext with an empty cookie jar — openAnonymous
  // exists exactly for the anonymous 401 contract (see its docstring).
  w.sec401Anon = await TestSession.openAnonymous(playwright);
});

When('I try to access the protected endpoint {string}', async ({ world }, path: string) => {
  const w = world as Security401World;
  if (!w.sec401Anon) throw new Error('no anonymous transport — did "I am not logged in" run?');
  record(w, await w.sec401Anon.api.get<ApiErrorResponse>(path));
});

// ── Scenario 2 — stale (BE: expired) session ─────────────────────────────────

Given('a company user is signed in with a backend session', async ({ playwright, world }) => {
  const w = world as Security401World;
  // Collapse of the BE's Firestore-sync + real-Firebase login + token
  // exchange: mock-session mints the same HttpOnly session/session_sig pair
  // (feature header, adaptation 3).
  w.sec401Session = await TestSession.open(playwright, ACTORS['company1']);
  // Order-independence: another oracle can leave the fixed actor non-ACTIVE,
  // and a non-ACTIVE account is 401'd (account_disabled) before this
  // scenario's fresh-session 200 probe would pass.
  await w.sec401Session.activate();
});

Then('a valid session cookie {string} should be set', async ({ world }, name: string) => {
  const w = world as Security401World;
  const state = await requireSession(w).raw.storageState();
  const byName = new Map(state.cookies.map((c) => [c.name, c]));
  const session = byName.get(name);
  expect(
    session,
    `cookie "${name}" must be set (have: ${[...byName.keys()].join(', ') || '<none>'})`,
  ).toBeDefined();
  expect(session!.value, `cookie "${name}" must carry a value`).toBeTruthy();
  expect(session!.httpOnly, `cookie "${name}" must be HttpOnly`).toBe(true);
  const sig = byName.get('session_sig');
  expect(sig, 'session_sig must accompany the session cookie (HMAC pair)').toBeDefined();
  // The BE glue's stored-cookies move: keep the pair for the stale replay.
  w.sec401Cookies = { session: session!.value, sessionSig: sig!.value };
});

Then('the fresh session should be able to access {string}', async ({ world }, path: string) => {
  const w = world as Security401World;
  // The feature only exercises /users/me, so the response is typed as the
  // generated UserDtoOut (contract coupling), mirroring auth.steps.ts.
  const r = await requireSession(w).api.get<UserDtoOut>(path);
  expect(r.status, `GET ${path} with the fresh session (body: ${r.body.slice(0, 160)})`).toBe(200);
  expect(r.json.id, 'authenticated /users/me must return the user id').toBeTruthy();
});

When('the stored session cookie pair is invalidated', async ({ world }) => {
  const w = world as Security401World;
  const pair = requireCookies(w);
  // Dispose the original transport — only the stored cookie values survive,
  // mirroring the BE glue where the login client is gone and the expired
  // request is rebuilt from context-stored cookie strings.
  await w.sec401Session?.dispose().catch(() => undefined);
  w.sec401Session = undefined;
  w.sec401Cookies = { session: pair.session, sessionSig: corruptSignature(pair.sessionSig) };
});

When(
  'I try to access the protected endpoint {string} with my expired session',
  async ({ playwright, world }, path: string) => {
    const w = world as Security401World;
    const pair = requireCookies(w);
    // Fresh transport carrying ONLY the stored stale pair as a manual Cookie
    // header — byte-for-byte the BE glue's mechanics (SecuritySteps
    // tryAccessWithExpiredSession builds the Cookie header from stored values).
    const ctx = await playwright.request.newContext({
      baseURL: BE_URL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { cookie: `session=${pair.session}; session_sig=${pair.sessionSig}` },
    });
    w.sec401StaleCtx = ctx;
    record(w, await new ApiHttp(ctx).get<ApiErrorResponse>(path));
  },
);

// ── Shared envelope assertions (the locale-stable message-literal swap) ──────

Then(
  'the response should carry the unauthorized error envelope for {string}',
  async ({ world }, path: string) => {
    const w = world as Security401World;
    const envelope = parseEnvelope(w);
    expect(envelope.status, `envelope.status in: ${snippet(w)}`).toBe(401);
    // "Unauthorized" is a code constant in writeErrorResponse, not a
    // dictionary value — locale-stable by construction.
    expect(envelope.error, `envelope.error in: ${snippet(w)}`).toBe('Unauthorized');
    // The dictionary answered SOMETHING (Polish on this stack); the exact
    // localized text is never asserted (feature header, adaptation 2).
    expect(envelope.message, `localized envelope.message in: ${snippet(w)}`).toBeTruthy();
    expect(
      (envelope.path ?? '').endsWith(path),
      `envelope.path should end with ${path}, got "${envelope.path}"`,
    ).toBe(true);
    // Support-traceability pair: requestId echoed in body AND header.
    expect(envelope.requestId, `envelope.requestId in: ${snippet(w)}`).toBeTruthy();
    expect(
      w.lastResponse?.headers['x-request-id'],
      'X-Request-ID response header must be set',
    ).toBeTruthy();
  },
);

Then('the rejection reason should map to messageKey {string}', async ({ world }, key: string) => {
  const w = world as Security401World;
  // Traceability floor that always runs: the feature's expected reason must be
  // a real-shaped auth dictionary key (guards feature typos).
  expect(key, 'expected reason must be an error.auth.* dictionary key').toMatch(/^error\.auth\./);
  // JwtAuthenticationFilter.writeErrorResponse currently omits messageKey from
  // the 401 body (feature header, adaptation 2). The pin below is
  // forward-enforcing: the day the BE exposes messageKey on this envelope,
  // this oracle immediately verifies it against the BE source's intent
  // (not_authenticated for the visitor, invalid_token for the stale session).
  const envelope = parseEnvelope(w);
  if (envelope.messageKey != null) {
    expect(envelope.messageKey, `messageKey in: ${snippet(w)}`).toBe(key);
  }
});
