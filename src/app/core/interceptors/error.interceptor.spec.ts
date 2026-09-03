import { HttpErrorResponse, HttpRequest, HttpResponse, HttpHandlerFn } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { PLATFORM_ID, runInInjectionContext, EnvironmentInjector } from '@angular/core';
import type { TokenExchangeResponse } from '../../api/model/token-exchange-response';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { AuthApiService } from '../auth/auth-api.service';
import { SessionStateService } from '../auth/session-state.service';
import { errorInterceptor } from './error.interceptor';

class FakeAuth {
  refreshNext: () => Observable<TokenExchangeResponse> = () =>
    of({ success: true } as unknown as TokenExchangeResponse);
  refreshCalls = 0;
  refreshSession(): Observable<TokenExchangeResponse> {
    this.refreshCalls += 1;
    return this.refreshNext();
  }
}

class FakeSession {
  private _user: UserDtoOut | null = null;
  clearCalls = 0;
  user(): UserDtoOut | null {
    return this._user;
  }
  setUserForTest(u: UserDtoOut | null): void {
    this._user = u;
  }
  clear(): void {
    this.clearCalls += 1;
    this._user = null;
  }
}

class FakeRouter {
  url = '/somewhere';
  navigated: string[] = [];
  navigateByUrl(url: string): Promise<boolean> {
    this.navigated.push(url);
    return Promise.resolve(true);
  }
}

function runInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  providers: { auth: FakeAuth; session: FakeSession; router: FakeRouter },
): Observable<unknown> {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthApiService, useValue: providers.auth },
      { provide: SessionStateService, useValue: providers.session },
      { provide: Router, useValue: providers.router },
    ],
  });
  const injector = TestBed.inject(EnvironmentInjector);
  return runInInjectionContext(injector, () => errorInterceptor(req, next));
}

describe('errorInterceptor', () => {
  afterEach(() => TestBed.resetTestingModule());

  const FAKE_USER = { id: 1, email: 'u@e.test' } as unknown as UserDtoOut;

  it('on the server platform rethrows 401 without refresh, clear, or redirect', fakeAsync(() => {
    // SSR calls carry no browser cookies, so a 401 says nothing about the
    // real session; a server-side navigate would 302 the whole render.
    const auth = new FakeAuth();
    const session = new FakeSession();
    const router = new FakeRouter();
    const next: HttpHandlerFn = () =>
      throwError(() => new HttpErrorResponse({ status: 401, url: '/api/users/me' }));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApiService, useValue: auth },
        { provide: SessionStateService, useValue: session },
        { provide: Router, useValue: router },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const injector = TestBed.inject(EnvironmentInjector);
    let error: HttpErrorResponse | null = null;
    runInInjectionContext(injector, () =>
      errorInterceptor(new HttpRequest('GET', '/api/users/me'), next),
    ).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
    tick();

    expect(error!.status).toBe(401);
    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(0);
    expect(router.navigated).toEqual([]);
  }));

  it('passes through successful responses untouched', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    const router = new FakeRouter();
    const next: HttpHandlerFn = () => of(new HttpResponse({ status: 200, body: { ok: 1 } }));

    let response: HttpResponse<unknown> | null = null;
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe((r) => {
      if (r instanceof HttpResponse) response = r;
    });
    tick();

    expect(response).not.toBeNull();
    expect(auth.refreshCalls).toBe(0);
  }));

  it('on 401 with no signed-in user from a PROTECTED page — clears session + routes to /auth/sign-in (no refresh attempt)', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(null); // anonymous
    const router = new FakeRouter();
    router.url = '/collaborations/list'; // protected page
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    let captured: unknown;
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e) => (captured = e) });
    tick();

    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(1);
    expect(router.navigated).toEqual(['/auth/sign-in']);
    expect(captured).toBeInstanceOf(HttpErrorResponse);
  }));

  // Regression: anonymous user on a PUBLIC /auth/* page (sign-up,
  // forgot-password, verify-email, etc.) must NOT be bounced away when the
  // shell's first SessionStateService.probe() returns 401. The probe 401 is
  // the EXPECTED answer for anonymous visitors trying to sign up; the
  // interceptor used to redirect them to /auth/sign-in, making public
  // sign-up forms unreachable for fresh users. Caught 2026-05-13 during
  // R7 manual smoke.
  it('on 401 with no signed-in user from a PUBLIC /auth/* page — clears session but does NOT redirect', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(null);
    const router = new FakeRouter();
    router.url = '/auth/sign-up/business';
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    let captured: unknown;
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e) => (captured = e) });
    tick();

    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(1);
    expect(router.navigated).toEqual([]); // critical: stays on the sign-up page
    expect(captured).toBeInstanceOf(HttpErrorResponse);
  }));

  it('on 401 from /auth/firebase/login — does NOT refresh, does NOT redirect (legitimate auth failure)', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    let captured: unknown;
    runInterceptor(new HttpRequest('POST', '/api/auth/firebase/login', {}), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e) => (captured = e) });
    tick();

    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(0); // login error must NOT clear an existing session
    expect(router.navigated).toEqual([]);
    expect(captured).toBeInstanceOf(HttpErrorResponse);
  }));

  // Regression (audit-2026-05-13 P1): a 401 on a static asset — e.g. a
  // CDN/WAF edge rule on /assets/i18n/*.json, which the transloco loader
  // fetches — must NOT trigger silent refresh. Without /assets/ in
  // SKIP_REFRESH_PATHS the refresh-then-retry would 401 again, look like a
  // hard auth failure, and clear a signed-in user's session, bouncing them
  // to sign-in over a static-asset blip.
  it('on 401 from a /assets/ static file — does NOT refresh, clear, or redirect', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER); // signed in — the dangerous case
    const router = new FakeRouter();
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    let captured: unknown;
    runInterceptor(new HttpRequest('GET', '/assets/i18n/en.json'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e) => (captured = e) });
    tick();

    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(0); // static-asset 401 must never log the user out
    expect(router.navigated).toEqual([]);
    expect(captured).toBeInstanceOf(HttpErrorResponse);
  }));

  // Magic-link ticket access: an anonymous 401 (expired/tampered token) must
  // NOT bounce to /auth/sign-in — the status page renders its own fallback
  // (manual ref+email lookup). e2e-2026-09-02. Anonymous case (no session):
  // without the skip, the interceptor would clear + redirect off a public page.
  it('on 401 from /support/ticket/access (anonymous) — does NOT clear or redirect', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession(); // anonymous — no user
    const router = new FakeRouter();
    router.url = '/support/tickets/status';
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    let captured: unknown;
    runInterceptor(new HttpRequest('GET', '/api/support/ticket/access?token=bad'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e) => (captured = e) });
    tick();

    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(0);
    expect(router.navigated).toEqual([]); // stays put — the page shows its own fallback
    expect(captured).toBeInstanceOf(HttpErrorResponse);
  }));

  it('on 401 from /auth/refresh-session itself — does NOT recurse', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    runInterceptor(new HttpRequest('POST', '/api/auth/refresh-session', {}), next, {
      auth,
      session,
      router,
    }).subscribe({ error: () => {} });
    tick();

    expect(auth.refreshCalls).toBe(0); // skipped — would recurse
  }));

  it('on authenticated 401 — refreshes once and retries the original request', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();

    let attempts = 0;
    const next: HttpHandlerFn = () => {
      attempts += 1;
      if (attempts === 1) return throwError(() => new HttpErrorResponse({ status: 401 }));
      return of(new HttpResponse({ status: 200, body: { ok: 1 } }));
    };

    let result: HttpResponse<unknown> | null = null;
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe((r) => {
      if (r instanceof HttpResponse) result = r;
    });
    tick();

    expect(auth.refreshCalls).toBe(1);
    expect(attempts).toBe(2); // original + retry
    expect(result).not.toBeNull();
    expect(session.clearCalls).toBe(0);
    expect(router.navigated).toEqual([]);
  }));

  it('on authenticated 401 + refresh failure — clears session + redirects + surfaces original 401', fakeAsync(() => {
    const auth = new FakeAuth();
    auth.refreshNext = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () =>
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'OG' }));

    const errors: HttpErrorResponse[] = [];
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e: HttpErrorResponse) => errors.push(e) });
    tick();

    expect(auth.refreshCalls).toBe(1);
    expect(session.clearCalls).toBe(1);
    expect(router.navigated).toEqual(['/auth/sign-in']);
    expect(errors).toHaveLength(1);
    expect(errors[0].statusText).toBe('OG'); // original error, not refresh error
  }));

  it('on authenticated 401 + refresh-503 (transient BE blip) — does NOT clear or redirect, just surfaces original 401', fakeAsync(() => {
    const auth = new FakeAuth();
    auth.refreshNext = () => throwError(() => new HttpErrorResponse({ status: 503 }));
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () =>
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'OG' }));

    const errors: HttpErrorResponse[] = [];
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e: HttpErrorResponse) => errors.push(e) });
    tick();

    expect(auth.refreshCalls).toBe(1);
    expect(session.clearCalls).toBe(0); // user keeps their session through transient BE outage
    expect(router.navigated).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].statusText).toBe('OG');
  }));

  it('does not redirect again when already on /auth/sign-in', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    router.url = '/auth/sign-in?reason=expired';
    auth.refreshNext = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: () => {} });
    tick();

    expect(router.navigated).toEqual([]); // no double-redirect
    expect(session.clearCalls).toBe(1);
  }));

  it('rethrows non-401/419 errors without touching auth/session/router', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 500 }));

    let captured: unknown;
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e) => (captured = e) });
    tick();

    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(0);
    expect(router.navigated).toEqual([]);
    expect(captured).toBeInstanceOf(HttpErrorResponse);
  }));

  // ------------------------------------------------------------------
  // 419 — tokenVersion mismatch. BE JwtAuthenticationFilter returns 419
  // (not 401) when the session cookie's tokenVersion claim is behind
  // the DB. The filter explicitly bypasses this gate for
  // /auth/refresh-session itself so refresh can re-issue cookies with
  // the current tokenVersion.
  //
  // The interceptor must trigger the same silent-refresh-and-retry
  // path it uses for 401, otherwise every admin status change in
  // production logs users out on their next request.
  // ------------------------------------------------------------------
  it('on authenticated 419 (tokenVersion mismatch) — refreshes once and retries the original request', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();

    let attempts = 0;
    const next: HttpHandlerFn = () => {
      attempts += 1;
      if (attempts === 1) return throwError(() => new HttpErrorResponse({ status: 419 }));
      return of(new HttpResponse({ status: 200, body: { ok: 1 } }));
    };

    let result: HttpResponse<unknown> | null = null;
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe((r) => {
      if (r instanceof HttpResponse) result = r;
    });
    tick();

    expect(auth.refreshCalls).toBe(1);
    expect(attempts).toBe(2);
    expect(result).not.toBeNull();
    expect(session.clearCalls).toBe(0);
    expect(router.navigated).toEqual([]);
  }));

  it('on 419 with no signed-in user — clears session + routes to /auth/sign-in (no refresh)', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(null);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 419 }));

    let captured: unknown;
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e) => (captured = e) });
    tick();

    expect(auth.refreshCalls).toBe(0);
    expect(session.clearCalls).toBe(1);
    expect(router.navigated).toEqual(['/auth/sign-in']);
    expect(captured).toBeInstanceOf(HttpErrorResponse);
  }));

  it('on 419 from /auth/refresh-session itself — does NOT recurse', fakeAsync(() => {
    const auth = new FakeAuth();
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 419 }));

    runInterceptor(new HttpRequest('POST', '/api/auth/refresh-session', {}), next, {
      auth,
      session,
      router,
    }).subscribe({ error: () => {} });
    tick();

    expect(auth.refreshCalls).toBe(0);
  }));

  it('on authenticated 419 + refresh-401 (banned) — clears session + redirects + surfaces original 419', fakeAsync(() => {
    const auth = new FakeAuth();
    auth.refreshNext = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    const session = new FakeSession();
    session.setUserForTest(FAKE_USER);
    const router = new FakeRouter();
    const next: HttpHandlerFn = () =>
      throwError(() => new HttpErrorResponse({ status: 419, statusText: 'TV_MISMATCH' }));

    const errors: HttpErrorResponse[] = [];
    runInterceptor(new HttpRequest('GET', '/api/users/me'), next, {
      auth,
      session,
      router,
    }).subscribe({ error: (e: HttpErrorResponse) => errors.push(e) });
    tick();

    expect(auth.refreshCalls).toBe(1);
    expect(session.clearCalls).toBe(1);
    expect(router.navigated).toEqual(['/auth/sign-in']);
    expect(errors).toHaveLength(1);
    expect(errors[0].statusText).toBe('TV_MISMATCH'); // original 419, not refresh 401
  }));
});
