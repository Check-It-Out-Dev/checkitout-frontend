import { Observable, of } from 'rxjs';
import type { FirebaseAuthResponse } from '../../api/model/firebase-auth-response';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { SignInComponent } from '../../feature/auth/sign-in/sign-in.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Sandbox fixtures for the sign-in form. Root injector already provides
 * HttpClient + Router + Transloco — we only need to swap the
 * `AuthApiService` for a stub so we can hit the loading / success / error
 * branches without a live BE.
 */

class StubAuthApiOk {
  signIn(): Observable<FirebaseAuthResponse> {
    return of({ idToken: 'stub-id', refreshToken: 'stub-refresh' });
  }
}

class StubAuthApiInvalid {
  signIn(): Observable<FirebaseAuthResponse> {
    return new Observable<FirebaseAuthResponse>((sub) => {
      sub.error({ status: 401, statusText: 'Unauthorized' });
    });
  }
}

export const SIGN_IN_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'sign-in-empty',
    label: 'Sign in · empty',
    component: SignInComponent,
    providers: [{ provide: AuthApiService, useClass: StubAuthApiOk }],
  },
  {
    id: 'sign-in-invalid-credentials',
    label: 'Sign in · invalid credentials',
    component: SignInComponent,
    providers: [{ provide: AuthApiService, useClass: StubAuthApiInvalid }],
  },
];
