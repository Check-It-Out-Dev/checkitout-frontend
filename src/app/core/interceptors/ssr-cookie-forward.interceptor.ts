import { isPlatformServer } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { PLATFORM_ID, REQUEST, inject } from '@angular/core';

/**
 * Server-only: forward the incoming SSR request's `Cookie` header onto
 * outgoing `/api` calls.
 *
 * Auth lives in HttpOnly cookies (no client token storage), so during SSR
 * the authGuard's `/users/me` probe is the browser's session — but the
 * server's HttpClient starts cookie-less. Without forwarding, every guarded
 * route SSR-renders as unauthenticated and the server answers a real 302 to
 * /auth/sign-in even when the browser holds a valid session (diagnosed
 * 2026-09-02: BE log shows the SSR probe arriving with no cookies).
 *
 * The incoming request comes from the `REQUEST` token, which the dev-server
 * SSR provides. Under the prod CommonEngine (server.ts) the token is absent
 * → pass-through, i.e. today's behaviour. Browser platform: pass-through.
 */
export const ssrCookieForwardInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return next(req);
  const incoming = inject(REQUEST, { optional: true });
  const cookie: string | null = incoming?.headers?.get('cookie') ?? null;
  if (cookie === null || cookie === '' || !req.url.startsWith('/api')) return next(req);
  return next(req.clone({ setHeaders: { Cookie: cookie } }));
};
