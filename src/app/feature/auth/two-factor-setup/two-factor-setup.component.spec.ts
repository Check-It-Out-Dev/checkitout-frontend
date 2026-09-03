import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { BackupCodesResponse } from '../../../core/api-frozen/hidden-models';
import type { TotpSetupResponse } from '../../../core/api-frozen/hidden-models';
import type { TwoFactorOperationResponse } from '../../../core/api-frozen/hidden-models';
import type { TwoFactorStatusResponse } from '../../../core/api-frozen/hidden-models';
import type { UserDtoOut } from '../../../api/model/user-dto-out';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { TwoFactorService } from '../../../core/two-factor/two-factor.service';
import { TwoFactorSetupComponent } from './two-factor-setup.component';

const FAKE_USER: UserDtoOut = {
  id: 9,
  email: 'admin@e2e.test',
  userType: 'COMPANY',
} as unknown as UserDtoOut;

const SETUP_RESPONSE: TotpSetupResponse = {
  qrCodeImage: 'data:image/png;base64,AAAA',
  secret: 'JBSWY3DPEHPK3PXP',
  secretFormatted: 'JBSW Y3DP EHPK 3PXP',
  email: 'admin@e2e.test',
  issuer: 'CheckItOut',
  backupCodes: ['11111111', '22222222', '33333333', '44444444'],
};

class FakeTwoFactor {
  setupNext: () => Observable<TotpSetupResponse> = () => of(SETUP_RESPONSE);
  verifySetupNext: () => Observable<TwoFactorOperationResponse> = () =>
    of({ success: true } as TwoFactorOperationResponse);
  setupCalls = 0;
  verifySetupCalls = 0;

  status(): Observable<TwoFactorStatusResponse> {
    return of({} as TwoFactorStatusResponse);
  }
  setup(): Observable<TotpSetupResponse> {
    this.setupCalls += 1;
    return this.setupNext();
  }
  verifySetup(_code: string): Observable<TwoFactorOperationResponse> {
    this.verifySetupCalls += 1;
    return this.verifySetupNext();
  }
  verify(_code: string): Observable<TwoFactorOperationResponse> {
    return of({ success: true } as TwoFactorOperationResponse);
  }
  disable(_code: string): Observable<TwoFactorOperationResponse> {
    return of({ success: true } as TwoFactorOperationResponse);
  }
  regenerateBackupCodes(_code: string): Observable<BackupCodesResponse> {
    return of({} as BackupCodesResponse);
  }
}

class FakeSession {
  probeNext: () => Observable<UserDtoOut | null> = () => of(FAKE_USER);
  clearCalls = 0;
  probeCalls = 0;
  clear(): void {
    this.clearCalls += 1;
  }
  probe(): Observable<UserDtoOut | null> {
    this.probeCalls += 1;
    return this.probeNext();
  }
  setUser(_user: UserDtoOut): void {}
}

function createComponent(
  twoFactor: FakeTwoFactor,
  session: FakeSession = new FakeSession(),
): {
  fixture: ComponentFixture<TwoFactorSetupComponent>;
  session: FakeSession;
} {
  TestBed.configureTestingModule({
    imports: [
      TwoFactorSetupComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: TwoFactorService, useValue: twoFactor },
      { provide: SessionStateService, useValue: session },
    ],
  });
  const fixture: ComponentFixture<TwoFactorSetupComponent> =
    TestBed.createComponent(TwoFactorSetupComponent);
  return { fixture, session };
}

describe('TwoFactorSetupComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('fetches setup data on init and renders the QR + secret', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    const { fixture } = createComponent(tf);
    fixture.detectChanges();
    flush();

    expect(tf.setupCalls).toBe(1);
    expect(fixture.componentInstance.step()).toBe('setup');
    expect(fixture.componentInstance.qrCodeImage()).toBe('data:image/png;base64,AAAA');
    expect(fixture.componentInstance.secret()).toBe('JBSWY3DPEHPK3PXP');
    expect(fixture.componentInstance.backupCodes()).toHaveLength(4);
  }));

  it('skips straight home if BE says alreadyEnabled', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    tf.setupNext = () => of({ alreadyEnabled: true } as TotpSetupResponse);
    const { fixture } = createComponent(tf);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.detectChanges();
    flush();

    expect(navSpy).toHaveBeenCalledWith(['/']);
  }));

  it('surfaces an error step when /twofactor/setup fails', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    tf.setupNext = () => throwError(() => new HttpErrorResponse({ status: 0 }));
    const { fixture } = createComponent(tf);

    fixture.detectChanges();
    flush();

    expect(fixture.componentInstance.step()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe(
      'auth.two_factor_setup.errors.service_unavailable',
    );
  }));

  it('does nothing when verify is invoked with an invalid code', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    const { fixture } = createComponent(tf);
    fixture.detectChanges();
    flush();

    fixture.componentInstance.code.setValue('12'); // too short
    fixture.componentInstance.verify();
    flush();

    expect(tf.verifySetupCalls).toBe(0);
  }));

  it('flips to backup step when verifySetup returns success', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    const { fixture } = createComponent(tf);
    fixture.detectChanges();
    flush();

    fixture.componentInstance.code.setValue('123456');
    fixture.componentInstance.verify();
    flush();

    expect(tf.verifySetupCalls).toBe(1);
    expect(fixture.componentInstance.step()).toBe('backup');
  }));

  it('classifies HTTP 401 on verifySetup as invalid_code and stays on setup step', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    tf.verifySetupNext = () =>
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
    const { fixture } = createComponent(tf);
    fixture.detectChanges();
    flush();

    fixture.componentInstance.code.setValue('123456');
    fixture.componentInstance.verify();
    flush();

    expect(fixture.componentInstance.step()).toBe('setup');
    expect(fixture.componentInstance.errorKey()).toBe('auth.two_factor_setup.errors.invalid_code');
  }));

  it('surfaces invalid_code when verifySetup returns success=false', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    tf.verifySetupNext = () => of({ success: false } as TwoFactorOperationResponse);
    const { fixture } = createComponent(tf);
    fixture.detectChanges();
    flush();

    fixture.componentInstance.code.setValue('123456');
    fixture.componentInstance.verify();
    flush();

    expect(fixture.componentInstance.step()).toBe('setup');
    expect(fixture.componentInstance.errorKey()).toBe('auth.two_factor_setup.errors.invalid_code');
  }));

  it('clears session, re-probes, and routes home when complete is invoked', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    const { fixture, session } = createComponent(tf);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    flush();

    // Fast-forward to backup step.
    fixture.componentInstance.code.setValue('123456');
    fixture.componentInstance.verify();
    flush();

    fixture.componentInstance.toggleConfirm(true);
    fixture.componentInstance.complete();
    flush();

    expect(session.clearCalls).toBe(1);
    expect(session.probeCalls).toBe(1);
    expect(navSpy).toHaveBeenCalledWith(['/']);
  }));

  it('does nothing when complete is invoked without the confirm checkbox', fakeAsync(() => {
    const tf = new FakeTwoFactor();
    const { fixture, session } = createComponent(tf);
    fixture.detectChanges();
    flush();

    fixture.componentInstance.code.setValue('123456');
    fixture.componentInstance.verify();
    flush();

    fixture.componentInstance.complete(); // codesConfirmed still false
    flush();

    expect(session.clearCalls).toBe(0);
    expect(fixture.componentInstance.step()).toBe('backup');
  }));
});
