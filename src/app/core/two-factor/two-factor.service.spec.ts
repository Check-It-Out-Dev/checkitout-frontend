import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { TwoFactorStatusControllerService as GeneratedTwoFactorService } from '../../api/api/two-factor-status-controller.api';
import type { BackupCodesResponse } from '../api-frozen/hidden-models';
import type { TotpSetupResponse } from '../api-frozen/hidden-models';
import type { TwoFactorOperationResponse } from '../api-frozen/hidden-models';
import type { TwoFactorStatusResponse } from '../api-frozen/hidden-models';
import { TwoFactorService } from './two-factor.service';

class FakeApi {
  check2FAStatusCalls = 0;
  check2FAStatusNext: () => Observable<TwoFactorStatusResponse> = () =>
    of({ has2FA: true } as unknown as TwoFactorStatusResponse);
  setup2FACalls = 0;
  setup2FANext: () => Observable<TotpSetupResponse> = () =>
    of({ secret: 'JBSW' } as unknown as TotpSetupResponse);
  verifyCalls: { method: 'verify' | 'verifySetup' | 'disable' | 'backup'; code: string }[] = [];
  opNext: () => Observable<TwoFactorOperationResponse> = () =>
    of({ success: true } as unknown as TwoFactorOperationResponse);
  backupNext: () => Observable<BackupCodesResponse> = () =>
    of({ backupCodes: ['1', '2'] } as unknown as BackupCodesResponse);

  check2FAStatus(): Observable<TwoFactorStatusResponse> {
    this.check2FAStatusCalls += 1;
    return this.check2FAStatusNext();
  }
  setup2FA(): Observable<TotpSetupResponse> {
    this.setup2FACalls += 1;
    return this.setup2FANext();
  }
  verifySetup2FA(p: {
    totpVerifyRequest: { code: string };
  }): Observable<TwoFactorOperationResponse> {
    this.verifyCalls.push({ method: 'verifySetup', code: p.totpVerifyRequest.code });
    return this.opNext();
  }
  verify2FA(p: { totpVerifyRequest: { code: string } }): Observable<TwoFactorOperationResponse> {
    this.verifyCalls.push({ method: 'verify', code: p.totpVerifyRequest.code });
    return this.opNext();
  }
  disable2FA(p: { totpVerifyRequest: { code: string } }): Observable<TwoFactorOperationResponse> {
    this.verifyCalls.push({ method: 'disable', code: p.totpVerifyRequest.code });
    return this.opNext();
  }
  generateBackupCodes(p: { totpVerifyRequest: { code: string } }): Observable<BackupCodesResponse> {
    this.verifyCalls.push({ method: 'backup', code: p.totpVerifyRequest.code });
    return this.backupNext();
  }
}

function create(): { svc: TwoFactorService; api: FakeApi } {
  const api = new FakeApi();
  TestBed.configureTestingModule({
    providers: [{ provide: GeneratedTwoFactorService, useValue: api }],
  });
  return { svc: TestBed.inject(TwoFactorService), api };
}

describe('TwoFactorService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('status() forwards to /twofactor/status', () => {
    const { svc, api } = create();
    svc.status().subscribe();
    expect(api.check2FAStatusCalls).toBe(1);
  });

  it('setup() forwards to /twofactor/setup', () => {
    const { svc, api } = create();
    svc.setup().subscribe();
    expect(api.setup2FACalls).toBe(1);
  });

  it('verifySetup(code) wraps the totpVerifyRequest envelope', () => {
    const { svc, api } = create();
    svc.verifySetup('123456').subscribe();
    expect(api.verifyCalls).toEqual([{ method: 'verifySetup', code: '123456' }]);
  });

  it('verify(code) wraps the totpVerifyRequest envelope', () => {
    const { svc, api } = create();
    svc.verify('654321').subscribe();
    expect(api.verifyCalls).toEqual([{ method: 'verify', code: '654321' }]);
  });

  it('disable(code) wraps the totpVerifyRequest envelope', () => {
    const { svc, api } = create();
    svc.disable('abc999').subscribe();
    expect(api.verifyCalls).toEqual([{ method: 'disable', code: 'abc999' }]);
  });

  it('regenerateBackupCodes(code) wraps the totpVerifyRequest envelope', () => {
    const { svc, api } = create();
    svc.regenerateBackupCodes('xyz000').subscribe();
    expect(api.verifyCalls).toEqual([{ method: 'backup', code: 'xyz000' }]);
  });
});
