import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/**
 * Holds the "you are being rate-limited" state so the shell can surface a
 * banner. The `rateLimitInterceptor` calls {@link notify} on a 429; the
 * banner in `ShellBannersComponent` reads {@link active} / {@link
 * retryAfterSeconds}. Without this the legacy behaviour was silent — a 429
 * only produced a `console.warn`, so users saw an action fail with no
 * explanation (audit-2026-05-13 P1).
 *
 * The banner auto-hides after the Retry-After window so the user isn't left
 * with a stale warning. Browser-only: an SSR 429 must not bake a transient
 * banner into the server HTML (it would flash away on hydration).
 */
@Injectable({ providedIn: 'root' })
export class RateLimitStateService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Fallback window when the BE sends no (or an unparseable) Retry-After. */
  private static readonly DEFAULT_SECONDS = 10;
  /** Cap so a hostile / huge Retry-After can't pin the banner indefinitely. */
  private static readonly MAX_SECONDS = 120;

  private readonly _active = signal(false);
  private readonly _retryAfterSeconds = signal<number | null>(null);

  readonly active = this._active.asReadonly();
  readonly retryAfterSeconds = this._retryAfterSeconds.asReadonly();

  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Show the rate-limit banner and schedule its auto-dismiss. Re-notifying
   * (another 429 arrives) resets the window. `retryAfterSeconds` is the
   * parsed `Retry-After` header value, or null when absent/unparseable.
   */
  notify(retryAfterSeconds: number | null): void {
    if (!this.isBrowser) return;
    const secs = Math.min(
      retryAfterSeconds && retryAfterSeconds > 0
        ? retryAfterSeconds
        : RateLimitStateService.DEFAULT_SECONDS,
      RateLimitStateService.MAX_SECONDS,
    );
    this._retryAfterSeconds.set(secs);
    this._active.set(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.clear(), secs * 1000);
  }

  /** Hide the banner immediately (also called by the auto-dismiss timer). */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this._active.set(false);
    this._retryAfterSeconds.set(null);
  }
}
