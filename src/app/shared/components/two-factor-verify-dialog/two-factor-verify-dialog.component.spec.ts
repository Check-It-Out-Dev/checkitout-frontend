import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { of, throwError } from 'rxjs';
import { TwoFactorService } from '../../../core/two-factor/two-factor.service';
import { TwoFactorVerifyDialogComponent } from './two-factor-verify-dialog.component';

describe('TwoFactorVerifyDialogComponent', () => {
  let fixture: ComponentFixture<TwoFactorVerifyDialogComponent>;
  let component: TwoFactorVerifyDialogComponent;
  let twoFactor: { verify: jest.Mock };
  let dialogRef: { close: jest.Mock };

  beforeEach(async () => {
    twoFactor = { verify: jest.fn() };
    dialogRef = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [
        TwoFactorVerifyDialogComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        { provide: TwoFactorService, useValue: twoFactor },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TwoFactorVerifyDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('form validation', () => {
    it('starts invalid (empty code)', () => {
      expect(component.code.value).toBe('');
      expect(component.code.invalid).toBe(true);
    });

    it('rejects non-6-digit input', () => {
      component.code.setValue('12345'); // 5 digits
      expect(component.code.invalid).toBe(true);

      component.code.setValue('1234567'); // 7 digits
      expect(component.code.invalid).toBe(true);

      component.code.setValue('abcdef'); // not digits
      expect(component.code.invalid).toBe(true);

      component.code.setValue('12 456'); // contains space
      expect(component.code.invalid).toBe(true);
    });

    it('accepts exactly 6 digits', () => {
      component.code.setValue('123456');
      expect(component.code.valid).toBe(true);
    });
  });

  describe('verify()', () => {
    it('no-ops when code is invalid', () => {
      component.code.setValue('123'); // too short
      component.verify();
      expect(twoFactor.verify).not.toHaveBeenCalled();
      expect(component.verifying()).toBe(false);
    });

    it('no-ops when already verifying (double-click guard)', () => {
      twoFactor.verify.mockReturnValue(of({ success: true }));
      component.code.setValue('123456');

      component.verifying.set(true);
      component.verify();

      expect(twoFactor.verify).not.toHaveBeenCalled();
    });

    it('on success: closes dialog with {verified: true}', () => {
      twoFactor.verify.mockReturnValue(of({ success: true }));
      component.code.setValue('123456');

      component.verify();

      expect(twoFactor.verify).toHaveBeenCalledWith('123456');
      expect(dialogRef.close).toHaveBeenCalledWith({ verified: true });
      expect(component.verifying()).toBe(false);
      expect(component.errorKey()).toBeNull();
    });

    it('on success=false: sets errorKey, does NOT close dialog', () => {
      twoFactor.verify.mockReturnValue(of({ success: false }));
      component.code.setValue('123456');

      component.verify();

      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(component.errorKey()).toBe('auth.two_factor_verify.invalid_code');
      expect(component.verifying()).toBe(false);
      expect(component.code.enabled).toBe(true);
    });

    it('clears prior errorKey on a new verify() attempt', () => {
      component.errorKey.set('auth.two_factor_verify.invalid_code');
      twoFactor.verify.mockReturnValue(of({ success: true }));
      component.code.setValue('123456');

      component.verify();

      expect(component.errorKey()).toBeNull();
    });

    it('re-enables the code field after verify (both success + failure)', () => {
      // Failure path
      twoFactor.verify.mockReturnValue(of({ success: false }));
      component.code.setValue('123456');
      component.verify();
      expect(component.code.enabled).toBe(true);

      // Success path
      twoFactor.verify.mockReturnValue(of({ success: true }));
      component.code.setValue('654321');
      component.verify();
      expect(component.code.enabled).toBe(true);
    });
  });

  describe('error classification', () => {
    function setupError(status: number): void {
      twoFactor.verify.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status, statusText: 'X', error: 'boom' })),
      );
      component.code.setValue('123456');
      component.verify();
    }

    it('401 → auth.two_factor_verify.invalid_code', () => {
      setupError(401);
      expect(component.errorKey()).toBe('auth.two_factor_verify.invalid_code');
    });

    it('429 → auth.two_factor_verify.rate_limited', () => {
      setupError(429);
      expect(component.errorKey()).toBe('auth.two_factor_verify.rate_limited');
    });

    it('0 (offline) → auth.two_factor_verify.service_unavailable', () => {
      setupError(0);
      expect(component.errorKey()).toBe('auth.two_factor_verify.service_unavailable');
    });

    it('any other HTTP status → auth.two_factor_verify.failed', () => {
      setupError(500);
      expect(component.errorKey()).toBe('auth.two_factor_verify.failed');
    });

    it('non-HttpErrorResponse error → auth.two_factor_verify.failed', () => {
      twoFactor.verify.mockReturnValue(throwError(() => new Error('weird')));
      component.code.setValue('123456');
      component.verify();
      expect(component.errorKey()).toBe('auth.two_factor_verify.failed');
    });
  });

  describe('cancel()', () => {
    it('closes dialog with {verified: false}', () => {
      component.cancel();
      expect(dialogRef.close).toHaveBeenCalledWith({ verified: false });
    });

    it('is blocked during a pending verify()', () => {
      component.verifying.set(true);
      component.cancel();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });
});
