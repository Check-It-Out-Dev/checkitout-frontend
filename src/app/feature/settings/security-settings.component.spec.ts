import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { SecuritySettingsComponent } from './security-settings.component';

class FakeAuth {
  calls: { current: string; next: string }[] = [];
  changeFn: () => Observable<unknown> = () => of({ success: true });
  changePassword = (current: string, next: string) => {
    this.calls.push({ current, next });
    return this.changeFn();
  };
}

describe('SecuritySettingsComponent', () => {
  let fixture: ComponentFixture<SecuritySettingsComponent>;
  let auth: FakeAuth;

  beforeEach(() => {
    auth = new FakeAuth();
    TestBed.configureTestingModule({
      imports: [
        SecuritySettingsComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        provideHttpClient(withXhr()),
        provideAnimationsAsync(),
        provideRouter([]),
        { provide: AuthApiService, useValue: auth },
      ],
    });
    fixture = TestBed.createComponent(SecuritySettingsComponent);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  function fill(current: string, next: string, confirm: string): void {
    fixture.componentInstance.form.setValue({
      currentPassword: current,
      newPassword: next,
      confirmPassword: confirm,
    });
  }

  it('refuses to submit while invalid (missing current / short / mismatch)', () => {
    const c = fixture.componentInstance;
    c.submit();
    expect(auth.calls).toHaveLength(0);

    fill('old-secret', 'short', 'short');
    c.submit();
    expect(auth.calls).toHaveLength(0);

    fill('old-secret', 'new-secret-1', 'new-secret-2');
    expect(c.form.hasError('passwordsMismatch')).toBe(true);
    c.submit();
    expect(auth.calls).toHaveLength(0);
  });

  it('submits, shows saved state, and clears the form', fakeAsync(() => {
    const c = fixture.componentInstance;
    fill('old-secret', 'new-secret-1', 'new-secret-1');
    c.submit();
    tick();
    expect(auth.calls).toEqual([{ current: 'old-secret', next: 'new-secret-1' }]);
    expect(c.state()).toBe('saved');
    expect(c.form.controls.currentPassword.value).toBe('');
  }));

  it('maps 400/401 to wrong-current and 429 to rate-limited', fakeAsync(() => {
    const c = fixture.componentInstance;
    auth.changeFn = () => throwError(() => ({ status: 401 }));
    fill('wrong', 'new-secret-1', 'new-secret-1');
    c.submit();
    tick();
    expect(c.errorKey()).toBe('settings.security.error.wrong_current');

    auth.changeFn = () => throwError(() => ({ status: 429 }));
    fill('old-secret', 'new-secret-1', 'new-secret-1');
    c.submit();
    tick();
    expect(c.errorKey()).toBe('settings.security.error.rate_limited');
  }));
});
