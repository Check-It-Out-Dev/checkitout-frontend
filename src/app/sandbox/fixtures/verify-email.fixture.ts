import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { AuthOperationResponse } from '../../api/model/auth-operation-response';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { VerifyEmailComponent } from '../../feature/auth/verify-email/verify-email.component';
import type { SandboxFixture } from '../sandbox-registry';

class StubAuthApiOk {
  verifyEmail(): Observable<AuthOperationResponse> {
    return of({ success: true } as AuthOperationResponse);
  }
}

class StubAuthApiInvalid {
  verifyEmail(): Observable<AuthOperationResponse> {
    return new Observable<AuthOperationResponse>((sub) => {
      sub.error({ status: 400, statusText: 'Bad Request' });
    });
  }
}

class StubAuthApiPending {
  verifyEmail(): Observable<AuthOperationResponse> {
    // Never completes — keeps the spinner up for snapshot stability.
    return new Observable<AuthOperationResponse>(() => undefined);
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

export const VERIFY_EMAIL_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'verify-email-verifying',
    label: 'Verify email · verifying',
    component: VerifyEmailComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiPending },
      { provide: ActivatedRoute, useValue: stubRoute('valid-code') },
    ],
  },
  {
    id: 'verify-email-success',
    label: 'Verify email · success',
    component: VerifyEmailComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiOk },
      { provide: ActivatedRoute, useValue: stubRoute('valid-code') },
    ],
  },
  {
    id: 'verify-email-invalid',
    label: 'Verify email · invalid / expired',
    component: VerifyEmailComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiInvalid },
      { provide: ActivatedRoute, useValue: stubRoute('expired-code') },
    ],
  },
  {
    id: 'verify-email-no-oob-code',
    label: 'Verify email · no oobCode in URL',
    component: VerifyEmailComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiOk },
      { provide: ActivatedRoute, useValue: stubRoute(null) },
    ],
  },
];
