import type { ActorProfile } from '../../_framework/actor';
import type { ApiResult } from '../../_framework/api/http-client';
import {
  RateLimitApi,
  type RateLimitExceededBody,
  type TestHealthResponse,
} from '../../_framework/api/rate-limit.api';
import { TestSession } from '../../_framework/api/test-session';
import { BE_URL } from '../../integration/_actor';
import { After, expect, Given, Then, When, test } from './fixtures';

/**
 * Rate-limiting oracle — Layer 2 (functional), for the BE's
 * rate-limiting.feature, driven THROUGH the Layer-1 RateLimitApi against the
 * LIVE BE, mirroring the BE glue (RateLimitingSteps.java + RateLimitingHooks).
 *
 * Isolation contract: the BE flushed rate_limit* Redis keys before each
 * scenario; the live dev BE exposes no such hook, so each scenario mints
 * FRESH throwaway users instead — the STANDARD bucket keys per (hashed
 * firebaseUid, method, path) (RateLimitKeyType.USER_ENDPOINT), so a fresh
 * user is an untouched bucket. Throwaway users exhausted here stay blocked on
 * GET /test/health for up to 300 s (dev block duration) and are never reused.
 *
 * The exhaust step cross-checks the feature's declared request count against
 * the live X-RateLimit-Limit header, so a dev-config drift fails on request 1
 * with a pointer to the config, not mid-loop with a mystery 429.
 *
 * The shared `Then('the response status should be {int}')` assertion lives in
 * partnership.steps.ts and reads world.lastResponse — the request steps below
 * record into the same field. Scenario state lives on a local World view
 * (cast pattern — fixtures.ts untouched) under rl-prefixed keys so the other
 * oracles' After hooks ignore it.
 */

interface RateLimitWorld {
  rlCompanySession?: TestSession;
  rlInfluencerSession?: TestSession;
  /** Which throwaway user the "I ..." request steps act as (BE glue: one RestTemplate whose cookies get swapped). */
  rlActive?: 'company' | 'influencer';
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fresh throwaway actor — unique email => new user row => untouched rate-limit bucket. */
function freshActor(role: 'COMPANY' | 'INFLUENCER'): ActorProfile {
  const email = `rl-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
  return { id: email, email, role };
}

function record(w: RateLimitWorld, r: ApiResult): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function snippet(w: RateLimitWorld): string {
  return (w.lastResponse?.body ?? '(none)').slice(0, 300);
}

function activeApi(w: RateLimitWorld): RateLimitApi {
  const who = w.rlActive ?? 'company';
  const session = who === 'influencer' ? w.rlInfluencerSession : w.rlCompanySession;
  if (!session) throw new Error(`no ${who} session — did the fresh-user Given run?`);
  return new RateLimitApi(session.api);
}

/** Map the feature's endpoint vocabulary onto the typed L1 surface (mechanics stay in _framework/api). */
function probeFor(
  api: RateLimitApi,
  path: string,
): Promise<ApiResult<TestHealthResponse | RateLimitExceededBody>> {
  switch (path) {
    case '/test/health':
      return api.testHealth();
    default:
      throw new Error(`unsupported rate-limit probe endpoint "${path}"`);
  }
}

/** Playwright lowercases response header names — look up case-insensitively. */
function headerValue(w: RateLimitWorld, name: string): string | undefined {
  return w.lastResponse?.headers[name.toLowerCase()];
}

After(async ({ world }) => {
  const w = world as RateLimitWorld;
  await w.rlCompanySession?.dispose().catch(() => undefined);
  await w.rlInfluencerSession?.dispose().catch(() => undefined);
});

// ── Background ───────────────────────────────────────────────────────────────

Given('the application is running with real Redis', async ({ page }) => {
  // Redis-backed enforcement is a dev-stack invariant (rate-limit.storage=redis
  // in application-dev.yml) that the HTTP surface cannot introspect. This step
  // proves the stack is up; the X-RateLimit-* assertions in every scenario
  // prove the limiter is actually enforcing.
  const res = await page.request
    .get(`${BE_URL}/api/public-config`, { ignoreHTTPSErrors: true, timeout: 5_000 })
    .catch(() => null);
  expect(res?.ok(), `BE not reachable at ${BE_URL} — start the stack (npm run stack:up)`).toBe(
    true,
  );
});

// ── Fresh throwaway users (mock-session collapse of Firestore sync + E2E auth) ─

Given(
  'a fresh company user is authenticated for rate-limit testing',
  async ({ playwright, world }) => {
    const w = world as RateLimitWorld;
    w.rlCompanySession = await TestSession.open(playwright, freshActor('COMPANY'));
    w.rlActive = 'company';
  },
);

Given(
  'a fresh influencer user is provisioned for rate-limit testing',
  async ({ playwright, world }) => {
    const w = world as RateLimitWorld;
    // Opened but NOT made active — mirrors the BE's up-front Firestore sync;
    // the mid-scenario switch step mirrors "I authenticate as E2E influencer user".
    w.rlInfluencerSession = await TestSession.open(playwright, freshActor('INFLUENCER'));
  },
);

When('I switch to the fresh influencer user', async ({ world }) => {
  const w = world as RateLimitWorld;
  if (!w.rlInfluencerSession) {
    throw new Error('no influencer session — did the provisioned Given run?');
  }
  w.rlActive = 'influencer';
});

// ── Request steps ────────────────────────────────────────────────────────────

When('I exhaust the STANDARD rate limit on {string}', async ({ world }, path: string) => {
  const w = world as RateLimitWorld;
  const api = activeApi(w);
  // Request #1 doubles as the limit probe — the port is limit-ADAPTIVE:
  // the shared dev BE advertises STANDARD 10000/60s (unexhaustible in a
  // test), the BE Cucumber runner pins 5/60s. Exhaust exactly what the
  // BE advertises; self-skip when it is not exhaustible in reasonable time.
  const first = await probeFor(api, path);
  record(w, first);
  expect(first.ok, `probe GET ${path} must succeed (HTTP ${first.status})`).toBeTruthy();
  const limit = Number(headerValue(w, 'X-RateLimit-Limit'));
  expect(
    Number.isFinite(limit) && limit > 0,
    `X-RateLimit-Limit must be numeric, got "${headerValue(w, 'X-RateLimit-Limit')}"`,
  ).toBeTruthy();
  test.skip(
    limit > 200,
    `STANDARD limit here is ${limit}/window — unexhaustible in a test; ` +
      'runs fully on an e2e-pinned BE (RL_STANDARD_REQ argLine)',
  );
  for (let i = 2; i <= limit; i++) {
    const r = await probeFor(api, path);
    record(w, r);
    expect(
      r.ok,
      `request ${i}/${limit} GET ${path} must succeed inside the limit (HTTP ${r.status}); body: ${snippet(w)}`,
    ).toBeTruthy();
  }
});

When('I make one more GET request to {string}', async ({ world }, path: string) => {
  const w = world as RateLimitWorld;
  record(w, await probeFor(activeApi(w), path));
});

When('I make a GET request to {string}', async ({ world }, path: string) => {
  const w = world as RateLimitWorld;
  record(w, await probeFor(activeApi(w), path));
});

// ── Header + body assertions ─────────────────────────────────────────────────

Then('the response should contain header {string}', async ({ world }, name: string) => {
  const w = world as RateLimitWorld;
  const value = headerValue(w, name);
  expect(
    value,
    `response must carry header ${name}; got headers: ${Object.keys(w.lastResponse?.headers ?? {}).join(', ')}`,
  ).toBeTruthy();
});

Then(
  'the rate-limit headers should advertise a consistent STANDARD contract',
  async ({ world }) => {
    const w = world as RateLimitWorld;
    const limit = Number(headerValue(w, 'X-RateLimit-Limit'));
    const remaining = Number(headerValue(w, 'X-RateLimit-Remaining'));
    const reset = headerValue(w, 'X-RateLimit-Reset');
    expect(
      Number.isFinite(limit) && limit > 0,
      `Limit must be a positive number, got "${headerValue(w, 'X-RateLimit-Limit')}"`,
    ).toBeTruthy();
    // This step runs right after the fresh user's FIRST request on the bucket.
    expect(remaining, 'Remaining must be Limit - 1 after the first request').toBe(limit - 1);
    expect(reset, 'Reset header must be present').toBeTruthy();
  },
);

Then(
  'the response should contain header {string} with value {string}',
  async ({ world }, name: string, expected: string) => {
    const w = world as RateLimitWorld;
    expect(headerValue(w, name), `header ${name}; body: ${snippet(w)}`).toBe(expected);
  },
);

Then('the response error code should be {string}', async ({ world }, code: string) => {
  const w = world as RateLimitWorld;
  // The BE source substring-matches the body; this port pins the parsed `error`
  // field — the locale-independent machine code. The localized `message` field
  // (Polish on this DB) is deliberately never asserted.
  let parsed: RateLimitExceededBody | undefined;
  try {
    parsed = JSON.parse(w.lastResponse?.body ?? '') as RateLimitExceededBody;
  } catch {
    parsed = undefined;
  }
  expect(parsed?.error, `429 body must carry the machine error code; body: ${snippet(w)}`).toBe(
    code,
  );
});
