/**
 * TOTP code helper for FE E2E tests — admin-with-2FA login flow.
 *
 * Mirrors the BE's `TotpCodeGenerator` (`checkitout-backend/.../e2e/support/
 * TotpCodeGenerator.java`) so a partial-session-then-verify flow can
 * exchange a real 6-digit OTP that the BE accepts.
 *
 * Pure Node `crypto` — no extra npm dependency. Implements RFC 6238
 * (TOTP) on top of RFC 4226 (HOTP), SHA-1, 30-second time step,
 * 6-digit output. Matches the GoogleAuthenticator library defaults
 * the BE uses.
 *
 * The "test admin TOTP secret" is a deterministic Base32 secret known
 * to both the BE (via `e2e.admin.totp-secret` config) and these tests.
 * It is NEVER a production secret.
 *
 * Usage:
 *   import { currentTotpCode, ADMIN_TEST_TOTP_SECRET } from '../../_framework/totp';
 *   const code = currentTotpCode(ADMIN_TEST_TOTP_SECRET);
 *   await page.request.post('/api/auth/two-factor-verify', { data: { code } });
 *
 * For mock-session ADMIN flows that BYPASS TOTP entirely, see
 * `reference_mock_session_admin_full_session.md`: `{role:"ADMIN", partial:false}`
 * skips TOTP. Use this helper only when you need to exercise the real
 * partial-session-then-OTP-verify chain.
 */

import { createHmac } from 'node:crypto';

/**
 * The deterministic test TOTP secret. Coordinated with the BE
 * `e2e.admin.totp-secret` property — keep both in sync.
 *
 * This is "JBSWY3DPEHPK3PXP", the well-known Google Authenticator
 * test vector that decodes to ASCII "Hello!". Standard across
 * RFC 4226 / RFC 6238 test corpora; using it here makes the
 * generator + validator both deterministic + reproducible.
 */
export const ADMIN_TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/** Decode a Base32-encoded string into a Buffer of bytes. */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');

  let bits = '';
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) {
      // Match GoogleAuthenticator's lenient behavior — ignore invalid chars
      // rather than throwing. Real-world QR-code scans can produce stray
      // punctuation; the BE library silently drops them.
      continue;
    }
    bits += idx.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate the HOTP code for a specific counter value.
 * RFC 4226 truncation, last 4 bits of the HMAC select the offset.
 */
function hotp(secret: Buffer, counter: number, digits: number = 6): string {
  const buf = Buffer.alloc(8);
  // Counter is uint64 big-endian. JS numbers cap at 2^53, but the time-step
  // counter for the lifetime of this codebase won't exceed 2^32, so the
  // high 32 bits are zero.
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter, 4);

  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 10 ** digits).toString().padStart(digits, '0');
}

/**
 * Generate the TOTP code for a Base32 secret at a specific instant
 * (defaulting to now). Standard 30-second time step + 6 digits, matching
 * the BE's GoogleAuthenticator defaults.
 *
 * @param base32Secret  The shared secret in Base32.
 * @param atMillis      Optional override of "now" (test fixtures).
 */
export function currentTotpCode(base32Secret: string, atMillis: number = Date.now()): string {
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(atMillis / 1000 / 30);
  return hotp(secret, counter);
}

/**
 * Generate TOTP codes for the prev / current / next 30-second windows.
 * Useful when a test sits near a window boundary and the BE's window-size
 * tolerance might accept either the current or adjacent code.
 *
 * Returns codes in chronological order: [-1, 0, +1] relative to "now".
 */
export function totpCodeWindow(base32Secret: string, atMillis: number = Date.now()): string[] {
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(atMillis / 1000 / 30);
  return [hotp(secret, counter - 1), hotp(secret, counter), hotp(secret, counter + 1)];
}
