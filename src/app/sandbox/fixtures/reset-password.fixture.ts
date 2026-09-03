import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { AuthOperationResponse } from '../../api/model/auth-operation-response';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { ResetPasswordComponent } from '../../feature/auth/reset-password/reset-password.component';
import type { SandboxFixture } from '../sandbox-registry';

class StubAuthApiOk {
  verifyResetCode(): Observable<AuthOperationResponse> {
    return of({ success: true, message: 'user@example.com' } as AuthOperationResponse);
  }
  confirmPasswordReset(): Observable<AuthOperationResponse> {
    return of({ success: true } as AuthOperationResponse);
  }
}

class StubAuthApiInvalidCode {
  verifyResetCode(): Observable<AuthOperationResponse> {
    return new Observable<AuthOperationResponse>((sub) => {
      sub.error({ status: 400, statusText: 'Bad Request' });
    });
  }
  confirmPasswordReset(): Observable<AuthOperationResponse> {
    return of({ success: true } as AuthOperationResponse);
  }
}

function stubRoute(oobCode: string | null): ActivatedRoute {
  return {
    snapshot: {
      queryParamMap: {
        get: (k: string) => (k === 'oobCode' ? oobCode : null),
      },
    },
  } as unknown as ActivatedRoute;
}

export const RESET_PASSWORD_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'reset-password-valid-link',
    label: 'Reset password · valid link',
    component: ResetPasswordComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiOk },
      { provide: ActivatedRoute, useValue: stubRoute('valid-oob-code') },
    ],
  },
  {
    id: 'reset-password-invalid-link',
    label: 'Reset password · invalid / expired link',
    component: ResetPasswordComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiInvalidCode },
      { provide: ActivatedRoute, useValue: stubRoute('expired-code') },
    ],
  },
  {
    id: 'reset-password-no-oob-code',
    label: 'Reset password · no oobCode in URL',
    component: ResetPasswordComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiOk },
      { provide: ActivatedRoute, useValue: stubRoute(null) },
    ],
  },
];
