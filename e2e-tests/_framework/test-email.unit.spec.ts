/**
 * Unit tests for the FE test-email helper. Jest-tier; Playwright ignores
 * `*.unit.spec.ts` via testIgnore in playwright.config.ts.
 *
 * Tests cover predicate matching, code extraction, and timeout semantics.
 * The network round-trips (GET/DELETE /api/test/email*) are exercised in
 * integration specs against the running BE — unit tests don't mock them.
 */
import {
  clearInbox,
  extractSixDigitCode,
  flushPendingEmails,
  listInbox,
  waitForEmail,
  type CapturedEmail,
} from './test-email';

function fakeReq(impl: { get?: jest.Mock; delete?: jest.Mock; post?: jest.Mock }): never {
  return {
    request: {
      get: impl.get ?? jest.fn(),
      delete: impl.delete ?? jest.fn(),
      post: impl.post ?? jest.fn(),
    },
  } as never;
}

function email(overrides: Partial<CapturedEmail> = {}): CapturedEmail {
  const now = Date.now();
  return {
    subject: 'Test subject',
    from: ['noreply@checkitout.app'],
    to: ['user@e2e.test'],
    body: 'Hello',
    receivedAt: new Date(now).toISOString(),
    receivedAtMillis: now,
    ...overrides,
  };
}

const ORIGIN = 'https://localhost:8080';

describe('test-email helpers', () => {
  describe('extractSixDigitCode', () => {
    it('returns the first 6-digit sequence', () => {
      expect(extractSixDigitCode('Your code: 123456 — expires in 5 min')).toBe('123456');
    });

    it('ignores 5-digit sequences', () => {
      expect(extractSixDigitCode('Token 12345 followed by 987654 done')).toBe('987654');
    });

    it('ignores 7+ digit numbers (word boundary)', () => {
      expect(extractSixDigitCode('Order 1234567 — verification code is 246810')).toBe('246810');
    });

    it('throws when no 6-digit code is present', () => {
      expect(() => extractSixDigitCode('No code in here')).toThrow(/no 6-digit code/);
    });

    it('skips CSS hex colors like #333333 and returns the real code', () => {
      // The BE's step-up email template embeds CSS hex like #333333 / #f4f4f4.
      // The naive `\b\d{6}\b` regex would match #333333 first. The tightened
      // regex with negative lookbehind for `#` skips colors.
      const body = `
        color: #333333;
        background: #f4f4f4;
        Your code: 846681
        footer-color: #999999;
      `;
      expect(extractSixDigitCode(body)).toBe('846681');
    });

    it('skips digit sub-runs of longer numbers (timestamps)', () => {
      // `\d{6}` inside `1778616363074` would otherwise match `177861` if the
      // boundary check is too loose.
      expect(extractSixDigitCode('Order 1778616363074; code is 246810')).toBe('246810');
    });
  });

  // The origin is a REQUIRED argument, not a default, and it must be the origin
  // the caller's session was minted on. /api/test/email lives on the backend,
  // but the greenfield dev-server proxies /api to that same backend -- so both
  // origins reach the endpoint, and through the proxy the backend sees the
  // proxy's address instead of the caller's. Sessions are fingerprinted on
  // client IP + User-Agent, so mixing the two inside one session reads as a
  // hijack: the backend answers with the session cookies CLEARED and the caller
  // is anonymous from the next request on. Cookies ignore the port, so the
  // session cookie is sent to the frontend origin too -- nothing warns you.
  // Every fingerprint mismatch in nightly run 34534847000 was a DELETE
  // /api/test/email that took that hop. These tests pin the origin through;
  // the compiler is what stops a caller omitting it.
  describe('origin is used verbatim', () => {
    const ok = (json: unknown) => ({ ok: () => true, status: () => 200, json: async () => json });
    const BE = 'https://localhost:8080';

    it('clearInbox', async () => {
      const del = jest.fn().mockResolvedValue(ok({ purgedCount: 0 }));
      await clearInbox(fakeReq({ delete: del }), BE);
      expect(del).toHaveBeenCalledWith(`${BE}/api/test/email`, expect.anything());
    });

    it('listInbox', async () => {
      const get = jest.fn().mockResolvedValue(ok([]));
      await listInbox(fakeReq({ get }), { origin: BE });
      expect(get).toHaveBeenCalledWith(`${BE}/api/test/email`, expect.anything());
    });

    it('flushPendingEmails', async () => {
      const post = jest.fn().mockResolvedValue(ok({}));
      await flushPendingEmails(fakeReq({ post }), BE);
      expect(post).toHaveBeenCalledWith(`${BE}/api/test/email/flush`, expect.anything());
    });

    it('waitForEmail polls it', async () => {
      const get = jest.fn().mockResolvedValue(ok([email()]));
      await waitForEmail(fakeReq({ get }), { timeoutMs: 200, pollMs: 10, origin: BE });
      expect(get).toHaveBeenCalledWith(`${BE}/api/test/email`, expect.anything());
    });
  });

  describe('clearInbox', () => {
    it('returns purgedCount on success', async () => {
      const del = jest.fn().mockResolvedValue({
        ok: () => true,
        json: async () => ({ purgedCount: 4 }),
      });
      const result = await clearInbox(fakeReq({ delete: del }), 'https://localhost:4201');
      expect(result).toBe(4);
      expect(del).toHaveBeenCalledWith(
        'https://localhost:4201/api/test/email',
        expect.objectContaining({ ignoreHTTPSErrors: true }),
      );
    });

    it('throws on non-OK response', async () => {
      const del = jest.fn().mockResolvedValue({
        ok: () => false,
        status: () => 500,
        text: async () => 'oops',
      });
      await expect(clearInbox(fakeReq({ delete: del }), ORIGIN)).rejects.toThrow(
        /clearInbox failed: 500/,
      );
    });

    it('returns 0 when body omits purgedCount', async () => {
      const del = jest.fn().mockResolvedValue({
        ok: () => true,
        json: async () => ({}),
      });
      expect(await clearInbox(fakeReq({ delete: del }), ORIGIN)).toBe(0);
    });
  });

  describe('listInbox', () => {
    it('uses unfiltered URL when no recipient given', async () => {
      const get = jest.fn().mockResolvedValue({ ok: () => true, json: async () => [] });
      await listInbox(fakeReq({ get }), { origin: 'https://localhost:4201' });
      expect(get).toHaveBeenCalledWith(
        'https://localhost:4201/api/test/email',
        expect.objectContaining({ ignoreHTTPSErrors: true }),
      );
    });

    it('URL-encodes recipient filter', async () => {
      const get = jest.fn().mockResolvedValue({ ok: () => true, json: async () => [] });
      await listInbox(fakeReq({ get }), {
        to: 'user+tag@e2e.test',
        origin: 'https://localhost:4201',
      });
      expect(get).toHaveBeenCalledWith(
        'https://localhost:4201/api/test/email?to=user%2Btag%40e2e.test',
        expect.any(Object),
      );
    });

    it('throws on non-OK', async () => {
      const get = jest.fn().mockResolvedValue({
        ok: () => false,
        status: () => 503,
        text: async () => 'down',
      });
      await expect(listInbox(fakeReq({ get }), { origin: ORIGIN })).rejects.toThrow(
        /listInbox failed: 503/,
      );
    });
  });

  describe('waitForEmail', () => {
    it('returns first match by subject', async () => {
      const inbox = [
        email({ subject: 'Welcome' }),
        email({ subject: 'Reset your password', body: 'Your code: 987654' }),
      ];
      const get = jest.fn().mockResolvedValue({ ok: () => true, json: async () => inbox });
      const hit = await waitForEmail(fakeReq({ get }), {
        origin: ORIGIN,
        subject: /reset/i,
        timeoutMs: 500,
        pollMs: 10,
      });
      expect(hit.subject).toBe('Reset your password');
    });

    it('AND-combines predicates (to + subject + bodyMatches)', async () => {
      const inbox = [
        email({ to: ['other@e2e.test'], subject: 'Reset your password', body: 'Code 123456' }),
        email({ to: ['user@e2e.test'], subject: 'Welcome', body: 'Code 123456' }),
        email({ to: ['user@e2e.test'], subject: 'Reset your password', body: 'Code 246810' }),
      ];
      const get = jest.fn().mockResolvedValue({ ok: () => true, json: async () => inbox });
      const hit = await waitForEmail(fakeReq({ get }), {
        origin: ORIGIN,
        to: 'user@e2e.test',
        subject: /reset/i,
        bodyMatches: /246810/,
        timeoutMs: 500,
        pollMs: 10,
      });
      expect(hit.body).toContain('246810');
    });

    it('throws on timeout with a useful predicate description', async () => {
      const get = jest.fn().mockResolvedValue({ ok: () => true, json: async () => [] });
      await expect(
        waitForEmail(fakeReq({ get }), {
          to: 'nobody@e2e.test',
          timeoutMs: 50,
          pollMs: 10,
          origin: ORIGIN,
        }),
      ).rejects.toThrow(/timed out.*nobody@e2e\.test/);
    });

    it('propagates last error description on timeout when polling failed', async () => {
      const get = jest
        .fn()
        .mockResolvedValue({ ok: () => false, status: () => 500, text: async () => 'boom' });
      await expect(
        waitForEmail(fakeReq({ get }), { timeoutMs: 50, pollMs: 10, origin: ORIGIN }),
      ).rejects.toThrow(/last error/);
    });
  });
});
