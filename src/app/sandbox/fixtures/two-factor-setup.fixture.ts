import { Observable, of } from 'rxjs';
import type { BackupCodesResponse } from '../../core/api-frozen/hidden-models';
import type { TotpSetupResponse } from '../../core/api-frozen/hidden-models';
import type { TwoFactorOperationResponse } from '../../core/api-frozen/hidden-models';
import type { TwoFactorStatusResponse } from '../../core/api-frozen/hidden-models';
import { TwoFactorService } from '../../core/two-factor/two-factor.service';
import { TwoFactorSetupComponent } from '../../feature/auth/two-factor-setup/two-factor-setup.component';
import type { SandboxFixture } from '../sandbox-registry';

const SETUP_RESPONSE: TotpSetupResponse = {
  qrCodeImage:
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjEwIiB5PSIxMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNjAiIHk9IjEwIiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSIxMCIgeT0iNjAiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==',
  secret: 'JBSWY3DPEHPK3PXP',
  secretFormatted: 'JBSW Y3DP EHPK 3PXP',
  email: 'admin@e2e.test',
  issuer: 'CheckItOut',
  backupCodes: [
    '1111-2222',
    '3333-4444',
    '5555-6666',
    '7777-8888',
    '9999-0000',
    '1212-3434',
    '5656-7878',
    '9090-1212',
  ],
};

class StubTwoFactorSetupOk {
  status(): Observable<TwoFactorStatusResponse> {
    return of({} as TwoFactorStatusResponse);
  }
  setup(): Observable<TotpSetupResponse> {
    return of(SETUP_RESPONSE);
  }
  verifySetup(): Observable<TwoFactorOperationResponse> {
    return of({ success: true } as TwoFactorOperationResponse);
  }
  verify(): Observable<TwoFactorOperationResponse> {
    return of({ success: true } as TwoFactorOperationResponse);
  }
  disable(): Observable<TwoFactorOperationResponse> {
    return of({} as TwoFactorOperationResponse);
  }
  regenerateBackupCodes(): Observable<BackupCodesResponse> {
    return of({} as BackupCodesResponse);
  }
}

export const TWO_FACTOR_SETUP_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'two-factor-setup-default',
    label: 'TOTP setup · QR + secret + verify input',
    component: TwoFactorSetupComponent,
    viewport: { width: 480, height: 720 },
    providers: [{ provide: TwoFactorService, useClass: StubTwoFactorSetupOk }],
  },
];
