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

    it('on success=false with message "expired": says the code expired', () => {
      // A code that is wrong and a code that is merely late are different
      // refusals, and the difference is the whole lesson of the 2FA tour: the
      // dialog used to say "does not match" over a code the visitor had just
      // watched appear, while the narration explained that the window is
      // seconds.
      twoFactor.verify.mockReturnValue(of({ success: false, message: 'expired' }));
      component.code.setValue('123456');

      component.verify();

      expect(component.errorKey()).toBe('auth.two_factor_verify.expired_code');
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

    it('on a refused code: hands the caret back with the digits selected', async () => {
      twoFactor.verify.mockReturnValue(of({ success: false }));
      component.code.setValue('123456');
      fixture.detectChanges();
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '[data-testid="two-factor-verify-code"]',
      )!;
      input.blur();

      component.verify();
      fixture.detectChanges();
      // the focus is restored after Angular re-enables the control
      await new Promise((resolve) => setTimeout(resolve));

      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('123456'.length);
    });

    it('on an expired code: empties the field but keeps the reason', async () => {
      // A code that does not match may be a typo worth correcting; one that has
      // expired is worth nothing, and leaving it in the field made the demo ring
      // a control holding exactly the code it had just called dead. The banner
      // explaining why has to survive the clearing, which is why the value is
      // set without an event.
      twoFactor.verify.mockReturnValue(of({ success: false, message: 'expired' }));
      component.code.setValue('123456');
      fixture.detectChanges();
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '[data-testid="two-factor-verify-code"]',
      )!;
      input.blur();

      component.verify();
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));

      expect(component.code.value).toBe('');
      expect(component.errorKey()).toBe('auth.two_factor_verify.expired_code');
      expect(document.activeElement).toBe(input);
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

  it('drops the refusal as soon as the visitor types a different code', () => {
    // The error belongs to the code that was sent. Left up, the dialog goes on
    // saying the code did not match while a new one is being typed — and in the
    // filmed demo it was still saying it over a code that was about to be
    // accepted.
    component.errorKey.set('auth.two_factor_verify.invalid_code');

    component.code.setValue('123456');

    expect(component.errorKey()).toBeNull();
  });
});
