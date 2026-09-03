import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { ForgotPasswordResponse } from '../../../api/model/forgot-password-response';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { ForgotPasswordComponent } from './forgot-password.component';

class FakeAuthApi {
  next: () => Observable<ForgotPasswordResponse> = () => of({ success: true });
  forgotPassword(): Observable<ForgotPasswordResponse> {
    return this.next();
  }
}

function create(api: FakeAuthApi): ComponentFixture<ForgotPasswordComponent> {
  TestBed.configureTestingModule({
    imports: [
      ForgotPasswordComponent,
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
    ],
  });
  const fixture = TestBed.createComponent(ForgotPasswordComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ForgotPasswordComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does nothing when the form is invalid', () => {
    const api = new FakeAuthApi();
    const fixture = create(api);
    const spy = jest.spyOn(api, 'forgotPassword');

    fixture.componentInstance.submit();

    expect(spy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.submitted()).toBe(false);
  });

  it('flips to submitted on any 2xx (anti-enumeration)', fakeAsync(() => {
    const api = new FakeAuthApi();
    const fixture = create(api);

    fixture.componentInstance.form.setValue({ email: 'user@example.com' });
    fixture.componentInstance.submit();
    tick();

    expect(fixture.componentInstance.submitted()).toBe(true);
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(fixture.componentInstance.loading()).toBe(false);
  }));

  it('classifies HTTP 429 as rate_limited', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 429 }));
    const fixture = create(api);

    fixture.componentInstance.form.setValue({ email: 'user@example.com' });
    fixture.componentInstance.submit();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('auth.forgot_password.rate_limited');
    expect(fixture.componentInstance.submitted()).toBe(false);
  }));

  it('falls back to generic error for other failures', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = create(api);

    fixture.componentInstance.form.setValue({ email: 'user@example.com' });
    fixture.componentInstance.submit();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('auth.forgot_password.error');
  }));
});
