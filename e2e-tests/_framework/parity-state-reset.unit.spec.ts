/**
 * Unit tests for the parity-test state-reset helpers.
 *
 * Runs under Jest with simple fakes for `BrowserContext` + `APIRequestContext`
 * — no real browser, no live BE. The integration leg (does the script
 * actually clear localStorage when a real page loads?) is exercised by the
 * Stage 6g parity sweep itself when it runs against the running stack.
 *
 * The point of THIS spec is to catch:
 *   - drift between the GREENFIELD_CONSENT_LOCAL_STORAGE_KEY constant and
 *     the actual `STORAGE_KEY` in `core/consent/consent.service.ts`
 *   - drift between the CLEAR_SESSION_ENDPOINT constant and the BE controller
 *   - LEGACY_RESET_COOKIE_NAMES coverage of the 11 cookies the legacy
 *     consent + session model uses
 *   - the helper functions actually call clearCookies / addInitScript /
 *     request.post the right number of times
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLEAR_SESSION_ENDPOINT,
  GREENFIELD_CONSENT_LOCAL_STORAGE_KEY,
  LEGACY_RESET_COOKIE_NAMES,
  buildGreenfieldConsentResetScript,
  clearGreenfieldConsentState,
  clearLegacyConsentAndSession,
  postClearSession,
  resetForParityCapture,
} from './parity-state-reset';

// ── Lightweight fakes ──────────────────────────────────────────────────────
//
// Playwright's `BrowserContext` + `APIRequestContext` are large interfaces;
// we only touch a handful of methods. Define narrow fakes that match the
// shapes we use, with call-tracking arrays for the assertions below.

interface FakeApiRes {
  ok(): boolean;
  status(): number;
  text(): Promise<string>;
}

class FakeApiRequest {
  posts: Array<{ url: string; opts: object | undefined }> = [];
  private nextResponse: FakeApiRes = makeRes(200);

  setResponse(res: FakeApiRes): void {
    this.nextResponse = res;
  }

  async post(url: string, opts?: object): Promise<FakeApiRes> {
    this.posts.push({ url, opts });
    return this.nextResponse;
  }
}

class FakeBrowserContext {
  initScripts: Array<{ content: string }> = [];
  clearedCookieNames: string[] = [];
  request: FakeApiRequest = new FakeApiRequest();

  async addInitScript(script: { content: string }): Promise<void> {
    this.initScripts.push(script);
  }

  async clearCookies(filter?: { name?: string }): Promise<void> {
    if (filter?.name) this.clearedCookieNames.push(filter.name);
  }
}

function makeRes(status: number, body = ''): FakeApiRes {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    text: async () => body,
  };
}

// ── Constants ──────────────────────────────────────────────────────────────

describe('parity-state-reset · constants', () => {
  it('CLEAR_SESSION_ENDPOINT matches BE controller mapping', () => {
    expect(CLEAR_SESSION_ENDPOINT).toBe('/api/test/auth/clear-session');
  });

  it('GREENFIELD_CONSENT_LOCAL_STORAGE_KEY matches ConsentService STORAGE_KEY', () => {
    // Drift sentinel: if the service renames its key, this test will fail
    // because the helper's constant lags. Read the live service source.
    const servicePath = join(
      __dirname,
      '..',
      '..',
      'src',
      'app',
      'core',
      'consent',
      'consent.service.ts',
    );
    const serviceSrc = readFileSync(servicePath, 'utf-8');
    // Drift sentinel: if `consent.service.ts STORAGE_KEY` is renamed and
    // this match fails, the second expect fails with a clear message about
    // the helper's constant lagging. The non-null-assert below would
    // otherwise crash the spec runner — failing loud is desirable here.
    const match = serviceSrc.match(/const\s+STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
    expect(match).not.toBeNull();
    expect(GREENFIELD_CONSENT_LOCAL_STORAGE_KEY).toBe(match![1]);
  });

  it('LEGACY_RESET_COOKIE_NAMES covers the 4 session + 7 consent cookies', () => {
    const expected = new Set([
      // session
      'session',
      'session_sig',
      'partialSession',
      'partialSessionSig',
      // consent banner-level
      'cio_cc',
      // consent per-category HMAC pairs (3 × 2)
      'consent_cat_ANALYTICS',
      'consent_cat_ANALYTICS_sig',
      'consent_cat_MARKETING',
      'consent_cat_MARKETING_sig',
      'consent_cat_COOKIES',
      'consent_cat_COOKIES_sig',
    ]);
    expect(new Set(LEGACY_RESET_COOKIE_NAMES)).toEqual(expected);
    expect(LEGACY_RESET_COOKIE_NAMES.length).toBe(11);
  });
});

// ── buildGreenfieldConsentResetScript (pure) ──────────────────────────────

describe('parity-state-reset · buildGreenfieldConsentResetScript', () => {
  it('includes the JSON-encoded localStorage key', () => {
    const script = buildGreenfieldConsentResetScript();
    expect(script).toContain('"cio.consent.v1"');
    expect(script).toContain('removeItem');
  });

  it('wraps in try/catch so private-mode rejection is non-fatal', () => {
    const script = buildGreenfieldConsentResetScript();
    expect(script).toContain('try');
    expect(script).toContain('catch');
  });

  it('returns a deterministic string (no random nonce)', () => {
    expect(buildGreenfieldConsentResetScript()).toBe(buildGreenfieldConsentResetScript());
  });
});

// ── clearGreenfieldConsentState ───────────────────────────────────────────

describe('parity-state-reset · clearGreenfieldConsentState', () => {
  it('adds exactly one init-script with the reset content', async () => {
    const ctx = new FakeBrowserContext();
    await clearGreenfieldConsentState(
      ctx as unknown as Parameters<typeof clearGreenfieldConsentState>[0],
    );
    expect(ctx.initScripts.length).toBe(1);
    expect(ctx.initScripts[0].content).toBe(buildGreenfieldConsentResetScript());
  });

  it('is idempotent for re-call (each call adds another script — caller controls)', async () => {
    const ctx = new FakeBrowserContext();
    await clearGreenfieldConsentState(
      ctx as unknown as Parameters<typeof clearGreenfieldConsentState>[0],
    );
    await clearGreenfieldConsentState(
      ctx as unknown as Parameters<typeof clearGreenfieldConsentState>[0],
    );
    expect(ctx.initScripts.length).toBe(2);
  });
});

// ── postClearSession ──────────────────────────────────────────────────────

describe('parity-state-reset · postClearSession', () => {
  it('hits the right URL', async () => {
    const req = new FakeApiRequest();
    await postClearSession(
      req as unknown as Parameters<typeof postClearSession>[0],
      'https://localhost:4200',
    );
    expect(req.posts).toEqual([
      {
        url: 'https://localhost:4200/api/test/auth/clear-session',
        opts: { ignoreHTTPSErrors: true },
      },
    ]);
  });

  it('throws when BE returns non-2xx', async () => {
    const req = new FakeApiRequest();
    req.setResponse(makeRes(500, 'boom'));
    await expect(
      postClearSession(
        req as unknown as Parameters<typeof postClearSession>[0],
        'https://localhost:4200',
      ),
    ).rejects.toThrow(/clear-session.*500/);
  });
});

// ── clearLegacyConsentAndSession ──────────────────────────────────────────

describe('parity-state-reset · clearLegacyConsentAndSession', () => {
  it('clears all 11 cookie names by filter + POSTs clear-session', async () => {
    const ctx = new FakeBrowserContext();
    await clearLegacyConsentAndSession(
      ctx as unknown as Parameters<typeof clearLegacyConsentAndSession>[0],
      'https://localhost:4200',
    );
    expect(new Set(ctx.clearedCookieNames)).toEqual(new Set(LEGACY_RESET_COOKIE_NAMES));
    expect(ctx.clearedCookieNames.length).toBe(11);
    expect(ctx.request.posts.length).toBe(1);
    expect(ctx.request.posts[0].url).toBe('https://localhost:4200/api/test/auth/clear-session');
  });
});

// ── resetForParityCapture ─────────────────────────────────────────────────

describe('parity-state-reset · resetForParityCapture', () => {
  it('runs only greenfield-side reset when only greenfield: true', async () => {
    const ctx = new FakeBrowserContext();
    await resetForParityCapture(ctx as unknown as Parameters<typeof resetForParityCapture>[0], {
      greenfield: true,
    });
    expect(ctx.initScripts.length).toBe(1);
    expect(ctx.clearedCookieNames.length).toBe(0);
    expect(ctx.request.posts.length).toBe(0);
  });

  it('runs only legacy-side reset when only legacyBaseUrl is set', async () => {
    const ctx = new FakeBrowserContext();
    await resetForParityCapture(ctx as unknown as Parameters<typeof resetForParityCapture>[0], {
      legacyBaseUrl: 'https://localhost:4200',
    });
    expect(ctx.initScripts.length).toBe(0);
    expect(ctx.clearedCookieNames.length).toBe(11);
    expect(ctx.request.posts.length).toBe(1);
  });

  it('runs both when both are set', async () => {
    const ctx = new FakeBrowserContext();
    await resetForParityCapture(ctx as unknown as Parameters<typeof resetForParityCapture>[0], {
      greenfield: true,
      legacyBaseUrl: 'https://localhost:4200',
    });
    expect(ctx.initScripts.length).toBe(1);
    expect(ctx.clearedCookieNames.length).toBe(11);
    expect(ctx.request.posts.length).toBe(1);
  });

  it('no-ops when both are unset (defensive: caller passed empty options)', async () => {
    const ctx = new FakeBrowserContext();
    await resetForParityCapture(ctx as unknown as Parameters<typeof resetForParityCapture>[0], {});
    expect(ctx.initScripts.length).toBe(0);
    expect(ctx.clearedCookieNames.length).toBe(0);
    expect(ctx.request.posts.length).toBe(0);
  });

  it('legacyBaseUrl: null is treated as unset (caller has a feature flag)', async () => {
    const ctx = new FakeBrowserContext();
    await resetForParityCapture(ctx as unknown as Parameters<typeof resetForParityCapture>[0], {
      greenfield: true,
      legacyBaseUrl: null,
    });
    expect(ctx.initScripts.length).toBe(1);
    expect(ctx.clearedCookieNames.length).toBe(0);
  });
});
