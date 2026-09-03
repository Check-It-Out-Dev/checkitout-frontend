import { Observable, of } from 'rxjs';
import type { ForgotPasswordResponse } from '../../api/model/forgot-password-response';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { ForgotPasswordComponent } from '../../feature/auth/forgot-password/forgot-password.component';
import type { SandboxFixture } from '../sandbox-registry';

class StubAuthApiOk {
  forgotPassword(): Observable<ForgotPasswordResponse> {
    return of({ success: true });
  }
}

class StubAuthApiRateLimited {
  forgotPassword(): Observable<ForgotPasswordResponse> {
    return new Observable<ForgotPasswordResponse>((sub) => {
      sub.error({ status: 429, statusText: 'Too Many Requests' });
    });
  }
}

export const FORGOT_PASSWORD_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'forgot-password-empty',
    label: 'Forgot password · empty',
    component: ForgotPasswordComponent,
    providers: [{ provide: AuthApiService, useClass: StubAuthApiOk }],
  },
  {
    id: 'forgot-password-rate-limited',
    label: 'Forgot password · rate limited',
    component: ForgotPasswordComponent,
    providers: [{ provide: AuthApiService, useClass: StubAuthApiRateLimited }],
  },
];
