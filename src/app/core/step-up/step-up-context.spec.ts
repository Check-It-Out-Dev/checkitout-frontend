import { HttpContext } from '@angular/common/http';
import { STEP_UP_TOKEN, withStepUpToken } from './step-up-context';

describe('step-up-context helpers', () => {
  describe('STEP_UP_TOKEN', () => {
    it('defaults to null when never set on a fresh context', () => {
      const ctx = new HttpContext();
      expect(ctx.get(STEP_UP_TOKEN)).toBeNull();
    });

    it('returns the value that was explicitly set', () => {
      const ctx = new HttpContext().set(STEP_UP_TOKEN, 'totp-abc');
      expect(ctx.get(STEP_UP_TOKEN)).toBe('totp-abc');
    });

    it('explicit null read still resolves cleanly (matches factory default)', () => {
      // Both fresh-no-set and explicit-set-null reads return null,
      // so the interceptor's `if (!token) next(req)` short-circuit
      // works either way. (Angular's HttpContext doesn't expose a
      // public way to distinguish them — `.has()` reports true once
      // .set has fired regardless of value.)
      const fresh = new HttpContext();
      const explicit = new HttpContext().set(STEP_UP_TOKEN, null);
      expect(fresh.get(STEP_UP_TOKEN)).toBeNull();
      expect(explicit.get(STEP_UP_TOKEN)).toBeNull();
    });
  });

  describe('withStepUpToken()', () => {
    it('returns a fresh HttpContext carrying the token', () => {
      const ctx = withStepUpToken('totp-12345');
      expect(ctx).toBeInstanceOf(HttpContext);
      expect(ctx.get(STEP_UP_TOKEN)).toBe('totp-12345');
    });

    it('preserves the token verbatim — no trim / normalisation', () => {
      const ctx = withStepUpToken('  totp-12345  ');
      expect(ctx.get(STEP_UP_TOKEN)).toBe('  totp-12345  ');
    });

    it('accepts an empty string (caller responsibility)', () => {
      // The helper does NOT short-circuit on empty — that's the
      // wrapping service's job (UserApiService.patch checks truthy
      // before calling). This lock-in makes the boundary explicit.
      const ctx = withStepUpToken('');
      expect(ctx.get(STEP_UP_TOKEN)).toBe('');
      expect(ctx.has(STEP_UP_TOKEN)).toBe(true);
    });

    it('returns a new HttpContext each call (no shared state)', () => {
      const a = withStepUpToken('a');
      const b = withStepUpToken('b');
      expect(a).not.toBe(b);
      expect(a.get(STEP_UP_TOKEN)).toBe('a');
      expect(b.get(STEP_UP_TOKEN)).toBe('b');
    });
  });
});
