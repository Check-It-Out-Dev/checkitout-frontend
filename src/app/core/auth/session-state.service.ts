import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UserApiService } from '../user/user.service';

/**
 * Cached "are we logged in?" state, driven by `GET /users/me`.
 *
 * Greenfield FE has NO client-side token storage (legacy parity, BE
 * contract). Auth state lives entirely in HttpOnly HMAC-signed cookies.
 * The only way to know whether we have a valid session is to ask the BE,
 * cheaply, via `/users/me`. This service caches that answer in a signal
 * so guards and shell can read it synchronously after the first probe.
 *
 * Lifecycle:
 *  - First probe: someone calls `probe()` → HTTP request → cache result
 *  - Sign-in success: caller calls `setUser(user)` to seed the cache
 *  - Sign-out: caller calls `clear()` to reset
 *  - 401 from any other endpoint: error interceptor calls `clear()` so
 *    the next nav routes through `/auth/sign-in`
 */
@Injectable({ providedIn: 'root' })
export class SessionStateService {
  private readonly userApi = inject(UserApiService);

  private readonly _user = signal<UserDtoOut | null>(null);
  /** True once we know whether the session is valid (regardless of result). */
  private readonly _probed = signal(false);

  /** The current authenticated user, or null when unauthenticated / not yet probed. */
  readonly user = this._user.asReadonly();
  /** Whether `probe()` has resolved at least once. */
  readonly probed = this._probed.asReadonly();
  /** Sync read of "is the user authenticated right now?" */
  readonly isAuthenticated = computed(() => this._user() !== null);

  /**
   * Probe `/users/me` to refresh the session-state cache. Idempotent; the
   * caller can subscribe to know when it resolved. Errors (401, network)
   * land in the cache as `null` (clears any stale user) — do not bubble.
   */
  probe(): Observable<UserDtoOut | null> {
    return this.userApi.getCurrent().pipe(
      tap((user) => {
        this._user.set(user);
        this._probed.set(true);
      }),
      catchError(() => {
        this._user.set(null);
        this._probed.set(true);
        return of(null);
      }),
    );
  }

  /** Seed the cache after a successful sign-in (avoids a redundant /users/me roundtrip). */
  setUser(user: UserDtoOut): void {
    this._user.set(user);
    this._probed.set(true);
  }

  /** Clear after sign-out or on 401. The next probe will re-fetch. */
  clear(): void {
    this._user.set(null);
    this._probed.set(true);
  }
}
