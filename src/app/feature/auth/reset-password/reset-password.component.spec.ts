import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AuthOperationResponse } from '../../../api/model/auth-operation-response';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { ResetPasswordComponent } from './reset-password.component';

class FakeAuthApi {
  verifyNext: () => Observable<AuthOperationResponse> = () =>
    of({ success: true } as AuthOperationResponse);
  confirmNext: () => Observable<AuthOperationResponse> = () =>
    of({ success: true } as AuthOperationResponse);
  verifyResetCode(): Observable<AuthOperationResponse> {
    return this.verifyNext();
  }
  confirmPasswordReset(): Observable<AuthOperationResponse> {
    return this.confirmNext();
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

function create(
  api: FakeAuthApi,
  oobCode: string | null,
): ComponentFixture<ResetPasswordComponent> {
  TestBed.configureTestingModule({
    imports: [
      ResetPasswordComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: AuthApiService, useValue: api },
      { provide: ActivatedRoute, useValue: stubRoute(oobCode) },
    ],
  });
  const fixture = TestBed.createComponent(ResetPasswordComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ResetPasswordComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows invalid_code error when no oobCode in URL', () => {
    const fixture = create(new FakeAuthApi(), null);
    expect(fixture.componentInstance.verifying()).toBe(false);
    expect(fixture.componentInstance.oobCodeValid()).toBe(false);
    expect(fixture.componentInstance.errorKey()).toBe('auth.reset_password.error_invalid_code');
  });

  it('flips to oobCodeValid after verify success', fakeAsync(() => {
    const fixture = create(new FakeAuthApi(), 'good-code');
    tick();
    expect(fixture.componentInstance.verifying()).toBe(false);
    expect(fixture.componentInstance.oobCodeValid()).toBe(true);
    expect(fixture.componentInstance.errorKey()).toBeNull();
  }));

  it('shows invalid_code error when verify fails', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.verifyNext = () => throwError(() => new HttpErrorResponse({ status: 400 }));
    const fixture = create(api, 'expired');
    tick();
    expect(fixture.componentInstance.oobCodeValid()).toBe(false);
    expect(fixture.componentInstance.errorKey()).toBe('auth.reset_password.error_invalid_code');
  }));

  it('rejects mismatched passwords without calling confirm', fakeAsync(() => {
    const api = new FakeAuthApi();
    const confirmSpy = jest.spyOn(api, 'confirmPasswordReset');
    const fixture = create(api, 'good-code');
    tick();

    fixture.componentInstance.form.setValue({
      password: 'password123',
      confirmPassword: 'different456',
    });
    fixture.componentInstance.submit();

    expect(confirmSpy).not.toHaveBeenCalled();
  }));

  it('navigates to /auth/sign-in?passwordReset=success on confirm success', fakeAsync(() => {
    const api = new FakeAuthApi();
    const fixture = create(api, 'good-code');
    tick();
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.setValue({
      password: 'password123',
      confirmPassword: 'password123',
    });
    fixture.componentInstance.submit();
    tick();

    expect(navSpy).toHaveBeenCalledWith(['/auth/sign-in'], {
      queryParams: { passwordReset: 'success' },
    });
  }));

  // Regression: Stage 6g parity sweep 2026-05-13 — greenfield was
  // rendering "Ustaw nowe hasło" (Set new password) headline even when
  // oobCode was missing/expired. Legacy swaps to "Link wygasł". Headline
  // now branches inside the @if (verifying) / @else if (!oobCodeValid)
  // / @else triad so the error-state title is `error_title`.
  it('renders the error-state headline (error_title) when oobCode missing', fakeAsync(() => {
    const fixture = create(new FakeAuthApi(), null);
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.oobCodeValid()).toBe(false);
    const errorTitle = fixture.nativeElement.querySelector(
      '[data-testid="reset-password-invalid-title"]',
    ) as HTMLElement | null;
    expect(errorTitle).not.toBeNull();
    expect(errorTitle?.textContent ?? '').toContain('auth.reset_password.error_title');
  }));

  it('classifies confirm 400 as invalid_code', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.confirmNext = () => throwError(() => new HttpErrorResponse({ status: 400 }));
    const fixture = create(api, 'good-code');
    tick();

    fixture.componentInstance.form.setValue({
      password: 'password123',
      confirmPassword: 'password123',
    });
    fixture.componentInstance.submit();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('auth.reset_password.error_invalid_code');
  }));
});
