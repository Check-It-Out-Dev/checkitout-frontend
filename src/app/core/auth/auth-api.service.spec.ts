import { TestBed } from '@angular/core/testing';
import { Observable, lastValueFrom, of } from 'rxjs';
import { AuthControllerService as AuthenticationService } from '../../api/api/auth-controller.api';
import { FirebaseAuthProxyControllerService as FirebaseAuthProxyService } from '../../api/api/firebase-auth-proxy-controller.api';
import type { AuthOperationResponse } from '../../api/model/auth-operation-response';
import type { TokenExchangeResponse } from '../../api/model/token-exchange-response';
import { AuthApiService } from './auth-api.service';

class FakeAuthApi {
  exchangeTokenCalls: Array<unknown> = [];
  getSupportedPlatformsCalls = 0;
  refreshSessionCalls = 0;
  sendVerificationEmailCalls = 0;
  signOutCalls = 0;

  exchangeToken(req: unknown): Observable<TokenExchangeResponse> {
    this.exchangeTokenCalls.push(req);
    return of({ success: true } as unknown as TokenExchangeResponse);
  }
  getSupportedPlatforms(): Observable<Set<string>> {
    this.getSupportedPlatformsCalls += 1;
    return of(new Set(['Instagram']));
  }
  refreshSession(): Observable<TokenExchangeResponse> {
    this.refreshSessionCalls += 1;
    return of({ success: true } as unknown as TokenExchangeResponse);
  }
  sendVerificationEmail(): Observable<AuthOperationResponse> {
    this.sendVerificationEmailCalls += 1;
    return of({ success: true } as AuthOperationResponse);
  }
  signOut(): Observable<AuthOperationResponse> {
    this.signOutCalls += 1;
    return of({ success: true } as AuthOperationResponse);
  }
}

class FakeFirebaseAuth {
  // Just stub the methods AuthApiService touches via this proxy.
  login(): Observable<unknown> {
    return of({});
  }
  forgotPassword(): Observable<unknown> {
    return of({});
  }
  verifyResetCode(): Observable<unknown> {
    return of({});
  }
  confirmPasswordReset(): Observable<unknown> {
    return of({});
  }
  register(): Observable<unknown> {
    return of({});
  }
  applyActionCode(): Observable<unknown> {
    return of({});
  }
  completeVerification(): Observable<unknown> {
    return of({});
  }
}

function setup(): {
  service: AuthApiService;
  authApi: FakeAuthApi;
  firebase: FakeFirebaseAuth;
} {
  const authApi = new FakeAuthApi();
  const firebase = new FakeFirebaseAuth();
  TestBed.configureTestingModule({
    providers: [
      AuthApiService,
      { provide: AuthenticationService, useValue: authApi },
      { provide: FirebaseAuthProxyService, useValue: firebase },
    ],
  });
  const service = TestBed.inject(AuthApiService);
  return { service, authApi, firebase };
}

describe('AuthApiService', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('exchangeTokenForSession', () => {
    it('omits expirationDays when not provided', async () => {
      const { service, authApi } = setup();

      await lastValueFrom(service.exchangeTokenForSession());

      expect(authApi.exchangeTokenCalls).toEqual([{ tokenExchangeRequest: {} }]);
    });

    it('includes expirationDays when provided', async () => {
      const { service, authApi } = setup();

      await lastValueFrom(service.exchangeTokenForSession(30));

      expect(authApi.exchangeTokenCalls).toEqual([
        { tokenExchangeRequest: { expirationDays: 30 } },
      ]);
    });
  });

  describe('getSupportedPlatforms', () => {
    it('proxies to /auth/supported-platforms and returns the Set', async () => {
      const { service, authApi } = setup();

      const platforms = await lastValueFrom(service.getSupportedPlatforms());

      expect(authApi.getSupportedPlatformsCalls).toBe(1);
      expect(platforms.has('Instagram')).toBe(true);
    });
  });

  describe('refreshSession', () => {
    it('proxies to /auth/refresh-session', async () => {
      const { service, authApi } = setup();

      await lastValueFrom(service.refreshSession());

      expect(authApi.refreshSessionCalls).toBe(1);
    });
  });

  describe('sendVerificationEmail', () => {
    it('proxies to /auth/send-verification-email', async () => {
      const { service, authApi } = setup();

      await lastValueFrom(service.sendVerificationEmail());

      expect(authApi.sendVerificationEmailCalls).toBe(1);
    });
  });

  describe('signOut', () => {
    it('proxies to /auth/sign-out', async () => {
      const { service, authApi } = setup();

      await lastValueFrom(service.signOut());

      expect(authApi.signOutCalls).toBe(1);
    });
  });
});
