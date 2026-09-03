import { Observable } from 'rxjs';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSuccessComponent } from '../../feature/auth/auth-success/auth-success.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * `/auth/success` fixtures — the OAuth→session bridge landing. Happy
 * path calls exchange-token then navigates away, so the completing
 * fixture keeps the exchange in flight (never-resolving observable) and
 * the error fixture fails it. SessionStateService stays real — neither
 * state reaches `probe()`.
 */

class StubExchangeInFlight {
  exchangeTokenForSession(): Observable<unknown> {
    return new Observable<unknown>(() => undefined);
  }
}

class StubExchangeFailed {
  exchangeTokenForSession(): Observable<unknown> {
    return new Observable<unknown>((sub) => sub.error({ status: 401 }));
  }
}

export const AUTH_SUCCESS_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'auth-success-completing',
    label: 'Auth success · session exchange in flight',
    component: AuthSuccessComponent,
    providers: [{ provide: AuthApiService, useClass: StubExchangeInFlight }],
  },
  {
    id: 'auth-success-exchange-failed',
    label: 'Auth success · exchange failed (restart from sign-in)',
    component: AuthSuccessComponent,
    providers: [{ provide: AuthApiService, useClass: StubExchangeFailed }],
  },
];
