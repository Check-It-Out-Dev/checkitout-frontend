import { isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { SessionStateService } from './session-state.service';

/**
 * Allows the route only when the BE confirms an active session via
 * `GET /users/me` (the cookies set by the BE are HttpOnly, so the FE
 * cannot inspect them directly — the only way to know is to ask).
 * Otherwise sends the user to `/auth/sign-in`.
 *
 * Greenfield FE has NO client-side token storage. Auth state lives in
 * HttpOnly HMAC-signed cookies issued by the BE. See memory
 * `feedback_no_client_token_storage`.
 *
 * The first navigation runs a probe (~1 RTT to /users/me); subsequent
 * navigations read the cached SessionStateService signal synchronously.
 */
export const authGuard: CanActivateFn = () => {
  // SSR: render the shell without probing. The server's HttpClient carries
  // no browser cookies in this SSR mode (CommonEngine / dev-server provide
  // no REQUEST token), so a server-side probe always 401s and its redirect
  // becomes a real HTTP 302 — bouncing even authenticated users on every
  // hard navigation to a guarded deep link (diagnosed 2026-09-02). The
  // client guard re-runs on the hydrated initial navigation with the real
  // cookies and enforces auth there.
  if (isPlatformServer(inject(PLATFORM_ID))) return true;

  const session = inject(SessionStateService);
  const router = inject(Router);

  // Fast path — already probed.
  if (session.probed()) {
    return session.isAuthenticated() ? true : router.createUrlTree(['/auth/sign-in']);
  }

  // Slow path — first navigation after page load: probe BE.
  return session
    .probe()
    .pipe(map((user) => (user ? true : router.createUrlTree(['/auth/sign-in'])))) as Observable<
    true | ReturnType<Router['createUrlTree']>
  >;
};

/**
 * Inverse of authGuard — redirects authenticated users away from the
 * `/auth/*` pages. Sync-only: only redirects when SessionState has
 * *already* confirmed an authenticated user. Never triggers a probe
 * itself.
 *
 * Why no probe: the cost of a /users/me roundtrip on every public-page
 * navigation is worse than the rare case where a logged-in user
 * momentarily sees /auth/sign-in before the shell's own probe fires
 * and a refresh redirects them. Public routes also need to render
 * deterministically for unauthenticated users (visual parity); an
 * async probe would introduce a render-flicker before the route
 * activates.
 */
export const noAuthGuard: CanActivateFn = () => {
  const session = inject(SessionStateService);
  const router = inject(Router);

  if (session.probed() && session.isAuthenticated()) {
    return router.createUrlTree(['/collaborations/list']);
  }
  return true;
};

/**
 * Admin-only routes (user list, dictionary, support queue). The BE answers
 * 403 to anyone else, but the FE used to open the page anyway: a company
 * or a creator who typed /user/list saw the admin table with its data calls
 * failing one by one. Non-admins go back to the dashboard, anonymous
 * visitors to sign-in. PENDING_ADMIN is not ADMIN yet (2FA enrolment
 * pending) and is redirected like the BE would.
 *
 * Same SSR and probe rules as authGuard: never probe on the server, read
 * the cache when it is warm, probe once otherwise.
 */
export const adminGuard: CanActivateFn = () => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;

  const session = inject(SessionStateService);
  const router = inject(Router);
  const decide = (user: UserDtoOut | null) =>
    user?.userType?.value === 'ADMIN'
      ? true
      : router.createUrlTree([user ? '/collaborations/list' : '/auth/sign-in']);

  if (session.probed()) return decide(session.user());
  return session.probe().pipe(map(decide)) as Observable<
    true | ReturnType<Router['createUrlTree']>
  >;
};
