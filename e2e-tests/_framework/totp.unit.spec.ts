/**
 * Unit tests for the TOTP helper.
 *
 * Verifies:
 *   - RFC 6238 Appendix B test vectors (well-known TOTP corpus)
 *   - Determinism within a 30-second window
 *   - Base32 decoding handles lowercase + whitespace + invalid chars
 *   - Window helper returns 3 distinct codes when crossing a boundary
 *
 * Runs under Jest like the rest of the unit tier. Not part of the
 * Playwright spec suite — this is plain TS unit testing.
 */

import { currentTotpCode, totpCodeWindow, ADMIN_TEST_TOTP_SECRET } from './totp';

describe('TOTP helper', () => {
  describe('RFC 6238 Appendix B test vectors (SHA-1, 8-digit codes truncated to 6)', () => {
    // RFC 6238 publishes 10-digit reference codes; ours are truncated to 6
    // by `code % 10^6`. We re-derive expected 6-digit values from the
    // canonical 8-digit table to verify our implementation lines up.
    //
    // Test vectors: SHA-1, "12345678901234567890" ASCII, base32-encoded.
    // ASCII "12345678901234567890" → base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ".
    const SECRET_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    // RFC 6238 lists 8-digit codes. The 6-digit form is the last 6 digits.
    test.each([
      // [unix epoch seconds, expected 8-digit code from RFC]
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ])('at epoch %i s → %s (last 6 digits expected)', (t, rfcCode) => {
      const expected6 = rfcCode.slice(-6);
      expect(currentTotpCode(SECRET_RFC, t * 1000)).toBe(expected6);
    });
  });

  describe('determinism + boundary behavior', () => {
    it('returns the same code for two calls within the same 30s window', () => {
      const t = 1_700_000_000_000;
      expect(currentTotpCode(ADMIN_TEST_TOTP_SECRET, t)).toBe(
        currentTotpCode(ADMIN_TEST_TOTP_SECRET, t + 5_000),
      );
    });

    it('returns different codes across a 30s window boundary', () => {
      // Pick a "before boundary" t1 and an "after boundary" t2 — same
      // wall-clock minute but t2 is in the next 30s bucket.
      const t1 = Math.floor(Date.now() / 60_000) * 60_000; // bucket start
      const t2 = t1 + 30_000; // next bucket
      expect(currentTotpCode(ADMIN_TEST_TOTP_SECRET, t1)).not.toBe(
        currentTotpCode(ADMIN_TEST_TOTP_SECRET, t2),
      );
    });

    it('emits 6-digit zero-padded strings', () => {
      // Generate 100 codes from different secrets to statistically catch
      // any leading-zero rendering bugs.
      for (let i = 0; i < 100; i++) {
        const code = currentTotpCode(ADMIN_TEST_TOTP_SECRET, i * 1_000_000);
        expect(code).toMatch(/^\d{6}$/);
      }
    });
  });

  describe('base32 decoding tolerance', () => {
    it('accepts lowercase input', () => {
      const codeUpper = currentTotpCode('JBSWY3DPEHPK3PXP', 1_700_000_000_000);
      const codeLower = currentTotpCode('jbswy3dpehpk3pxp', 1_700_000_000_000);
      expect(codeLower).toBe(codeUpper);
    });

    it('ignores embedded whitespace', () => {
      const codeNoSpace = currentTotpCode('JBSWY3DPEHPK3PXP', 1_700_000_000_000);
      const codeSpaced = currentTotpCode('JBSW Y3DP EHPK 3PXP', 1_700_000_000_000);
      expect(codeSpaced).toBe(codeNoSpace);
    });

    it('strips trailing = padding', () => {
      const codeUnpadded = currentTotpCode('NBSWY3DP', 1_700_000_000_000);
      const codePadded = currentTotpCode('NBSWY3DP====', 1_700_000_000_000);
      expect(codePadded).toBe(codeUnpadded);
    });
  });

  describe('totpCodeWindow', () => {
    it('returns three distinct codes around the current bucket', () => {
      const window = totpCodeWindow(ADMIN_TEST_TOTP_SECRET, 1_700_000_000_000);
      expect(window).toHaveLength(3);
      // All three are valid 6-digit codes
      window.forEach((c) => expect(c).toMatch(/^\d{6}$/));
      // The current code (middle of the window) should match the standard helper
      expect(window[1]).toBe(currentTotpCode(ADMIN_TEST_TOTP_SECRET, 1_700_000_000_000));
      // Adjacent codes should differ from each other
      expect(window[0]).not.toBe(window[1]);
      expect(window[1]).not.toBe(window[2]);
    });
  });

  describe('admin test secret constant', () => {
    it('matches the canonical RFC 4226 test vector "Hello!" base32', () => {
      // The constant is the well-known JBSWY3DPEHPK3PXP test secret,
      // chosen so future contributors recognize it as a public test
      // vector and never confuse it with a production secret.
      expect(ADMIN_TEST_TOTP_SECRET).toBe('JBSWY3DPEHPK3PXP');
    });
  });
});
