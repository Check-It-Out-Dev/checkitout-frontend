import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthApiService } from '../auth/auth-api.service';
import { SessionStateService } from '../auth/session-state.service';

/**
 * Centralised HTTP-error policy.
 *
 * **401 / 419 — silent refresh + retry.** The BE rotates `tokenVersion`
 * after an admin role-change / ban / unban, which invalidates the
 * session cookie. JwtAuthenticationFilter returns **419** for a stale
 * tokenVersion (cookie still valid HMAC-wise) and **401** for cookie
 * absent / invalid HMAC / disabled account. Both are eligible for a
 * silent `/auth/refresh-session` call (the BE filter explicitly
 * bypasses the 419-gate for that URI so it can re-issue cookies). On
 * success we retry the original request once. On hard refresh failure
 * (BE says "this session can no longer be refreshed") we clear the FE
 * SessionState cache and redirect to `/auth/sign-in`.
 *
 * Refresh is skipped when:
 *   1. The original request was the refresh call itself (no recursion).
 *   2. The original request was login or sign-out (a 401 there is a
 *      legitimate auth failure, not a tokenVersion mismatch).
 *   3. The user wasn't signed in at the time of the request (no
 *      session to refresh — the error is correct).
 *
 * **403** — rethrow; let the calling component decide (banner / page).
 * **5xx** — rethrow; surfaced as a toast in Stage 1+ once the snackbar
 * service lands.
 */

const REFRESH_ELIGIBLE_STATUSES: readonly number[] = [401, 419];

const SKIP_REFRESH_PATHS: readonly string[] = [
  '/auth/refresh-session',
  '/auth/firebase/login',
  '/auth/firebase/register',
  '/auth/sign-out',
  '/auth/exchange-token',
  // Static assets (i18n JSON, fonts, images) are never session-bound, so a
  // 401 here — e.g. a CDN/WAF edge rule — must not trigger silent refresh.
  // Otherwise a failed retry looks like a hard auth failure and clears the
  // session, bouncing a signed-in user to sign-in over a static-asset blip
  // (transloco-loader hits /assets/i18n/*.json). audit-2026-05-13 P1.
  '/assets/',
  // Magic-link ticket access: 401 means the signed token is expired or
  // tampered — an ANONYMOUS flow. The status page renders its own
  // fallback (manual ref+email lookup, reference prefilled); bouncing to
  // /auth/sign-in would strand the anonymous reporter. e2e-2026-09-02.
  '/support/ticket/access',
];

function shouldSkipRefresh(req: HttpRequest<unknown>): boolean {
  return SKIP_REFRESH_PATHS.some((path) => req.url.includes(path));
}

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  // SSR: rethrow only — no refresh, no clear, no redirect. Server-side
  // calls carry no browser cookies in this SSR mode, so a 401 here says
  // nothing about the user's real session; a server-side navigateByUrl
  // would turn the render into a 302 to /auth/sign-in for everyone (same
  // trap as the authGuard server probe — see auth.guards.ts).
  if (isPlatformServer(inject(PLATFORM_ID))) {
    return next(req);
  }

  const router = inject(Router);
  const session = inject(SessionStateService);
  const auth = inject(AuthApiService);

  return next(req).pipe(
    catchError((err) => {
      if (!(err instanceof HttpErrorResponse) || !REFRESH_ELIGIBLE_STATUSES.includes(err.status)) {
        return throwError(() => err);
      }

      if (shouldSkipRefresh(req) || session.user() === null) {
        // No refresh — possibly clear + redirect. Two sub-cases:
        //
        //   (a) shouldSkipRefresh URL (login / register / refresh-session
        //       itself) → legitimate auth-call failure; the calling
        //       component handles the message. Do NOT clear + do NOT
        //       redirect.
        //
        //   (b) Anonymous 401 from a non-skip endpoint → most commonly the
        //       shell's first SessionStateService.probe() hitting GET
        //       /users/me with no cookies. If we're already on /auth/*
        //       (a public page like /auth/sign-up/business), DON'T bounce
        //       — the user is intentionally on a public form. If we're on
        //       a protected page, redirect so the next nav routes through
        //       sign-in.
        if (!shouldSkipRefresh(req)) {
          session.clear();
          const onPublicAuthPage = router.url.startsWith('/auth/');
          if (!onPublicAuthPage) {
            void router.navigateByUrl('/auth/sign-in');
          }
        }
        return throwError(() => err);
      }

      // Authenticated 401 / 419 → refresh-and-retry.
      return auth.refreshSession().pipe(
        switchMap(() => next(req)),
        catchError((refreshErr) => {
          // Only clear + redirect on a hard auth failure from the
          // refresh call (BE says "this session can no longer be
          // refreshed"). Transient 5xx / network errors leave the
          // session alone — the user can retry without losing their
          // place. Without this guard a brief BE blip would log
          // everyone out at once on the next 401/419-eligible request.
          const isHardAuthFailure =
            refreshErr instanceof HttpErrorResponse && refreshErr.status === 401;
          if (isHardAuthFailure) {
            session.clear();
            if (!router.url.startsWith('/auth/sign-in')) {
              void router.navigateByUrl('/auth/sign-in');
            }
          }
          // Surface the original error, not the refresh error — the
          // calling component cares about its own request, not why
          // the refresh failed.
          return throwError(() => err);
        }),
      );
    }),
  );
};
