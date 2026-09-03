import { MatDialogRef } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import type { TwoFactorOperationResponse } from '../../core/api-frozen/hidden-models';
import { TwoFactorService } from '../../core/two-factor/two-factor.service';
import { TwoFactorVerifyDialogComponent } from '../../shared/components/two-factor-verify-dialog/two-factor-verify-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

const DIALOG_REF_STUB = { close: () => undefined } as unknown as MatDialogRef<
  TwoFactorVerifyDialogComponent,
  { verified: boolean }
>;

class StubTwoFactorOk {
  status(): Observable<unknown> {
    return of({});
  }
  setup(): Observable<unknown> {
    return of({});
  }
  verifySetup(): Observable<unknown> {
    return of({});
  }
  verify(): Observable<TwoFactorOperationResponse> {
    return of({ success: true } as TwoFactorOperationResponse);
  }
  disable(): Observable<unknown> {
    return of({});
  }
  regenerateBackupCodes(): Observable<unknown> {
    return of({});
  }
}

export const TWO_FACTOR_VERIFY_DIALOG_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'two-factor-verify-dialog-default',
    label: 'TOTP verify dialog · awaiting 6-digit code',
    component: TwoFactorVerifyDialogComponent,
    viewport: { width: 480, height: 360 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: TwoFactorService, useClass: StubTwoFactorOk },
    ],
  },
];
