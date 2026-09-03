import type { Page } from '@playwright/test';

/**
 * Test-actor primitives for the live-BE integration suite. Mirrors the BE's
 * Cucumber multi-actor scaffolding (`/test/auth/mock-session`) so a single
 * actor identity flows through *both* Java integration tests AND these
 * Playwright integration tests against the same seed data.
 *
 * The BE test-profile actors are seeded by `dev-data-seed` Liquibase
 * changesets — keeping the actor table here in lockstep with that seed
 * prevents drift.
 */
export interface ActorProfile {
  readonly id: string;
  readonly email: string;
  readonly role: 'COMPANY' | 'INFLUENCER' | 'ADMIN';
}

export const ACTORS: Readonly<Record<string, ActorProfile>> = Object.freeze({
  company1: { id: 'company1', email: 'company1@e2e.test', role: 'COMPANY' },
  influencer1: { id: 'influencer1', email: 'influencer1@e2e.test', role: 'INFLUENCER' },
  admin1: { id: 'admin1', email: 'admin1@e2e.test', role: 'ADMIN' },
});

export const BE_URL = process.env['BE_URL'] ?? 'https://localhost:8080';

/**
 * POST /test/auth/mock-session — seeds the BE session cookies onto the
 * **page's** BrowserContext.
 *
 * Critical detail: we accept a `Page`, not the standalone `request`
 * fixture. Playwright's top-level `request` fixture has its OWN cookie
 * jar separate from the `BrowserContext` that `page.goto()` uses, so
 * cookies set via `request.post()` are invisible to subsequent navigation.
 * `page.request` is bound to the same BrowserContext, so cookies set here
 * persist for `page.goto()`. See memory
 * `feedback_playwright_request_vs_page_request`.
 *
 * We hit the FE origin (`/api/test/auth/mock-session`) so the dev-server
 * proxy forwards to BE; the response cookies are set on the FE origin and
 * naturally apply to the page's later navigation on the same origin.
 */
export async function login(
  page: Page,
  actor: ActorProfile,
  opts?: { setupCompleted?: boolean },
): Promise<void> {
  await seedSession(page, actor.email, actor.role, actor.id, opts);
}

/**
 * Lower-level seed helper for tests that need per-test unique emails
 * (avoids FREE-plan-limit accumulation across runs on a shared actor).
 *
 * Includes a small retry-on-409 loop: parallel Playwright workers fire
 * mock-session POSTs in tight succession and occasionally hit a transient
 * 409 from the BE (DataIntegrityViolation under the JWT/session-fingerprint
 * setup). Retrying with 100ms backoff clears it.
 */
export async function seedSession(
  page: Page,
  email: string,
  role: ActorProfile['role'],
  label: string = email,
  opts?: { setupCompleted?: boolean },
): Promise<void> {
  const url = `${GREENFIELD_URL}/api/test/auth/mock-session`;
  const MAX_ATTEMPTS = 4;
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await page.request.post(url, {
      // setupCompleted is an EXPLICIT tri-state on the BE: omitted leaves
      // the flag untouched (so retried seeds can't flip incomplete-setup
      // actors); true/false forces a side for specs that need one.
      data: {
        email,
        role,
        partial: false,
        ...(opts?.setupCompleted !== undefined ? { setupCompleted: opts.setupCompleted } : {}),
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (res.ok()) return;
    lastStatus = res.status();
    lastBody = await res.text().catch(() => '<unreadable>');
    if (lastStatus !== 409) break;
    await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
  }
  throw new Error(`mock-session failed for ${label}: ${lastStatus} ${lastBody}`);
}

/**
 * Captures every API request the page makes during a span. Returns the
 * captured calls as `[method, url]` tuples for assertion. Resets the array
 * on each call. Intended use:
 *
 *   const calls = recordApiCalls(page);
 *   await page.goto(...);
 *   expect(calls.flush()).toContainEqual(['GET', expect.stringMatching(/api\/user\/me/)]);
 */
export interface ApiCallRecorder {
  readonly all: ReadonlyArray<readonly [string, string]>;
  flush(): ReadonlyArray<readonly [string, string]>;
}

export function recordApiCalls(page: Page): ApiCallRecorder {
  const calls: Array<readonly [string, string]> = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('/api/')) return;
    calls.push([req.method(), url]);
  });
  return {
    get all() {
      return calls;
    },
    flush() {
      const snap = calls.slice();
      calls.length = 0;
      return snap;
    },
  };
}

export const GREENFIELD_URL =
  process.env['GREENFIELD_URL'] ?? process.env['PW_BASE_URL'] ?? 'https://localhost:4201';
