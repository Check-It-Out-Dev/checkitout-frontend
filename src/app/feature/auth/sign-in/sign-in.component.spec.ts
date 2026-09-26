import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AuthOperationResponse } from '../../../api/model/auth-operation-response';
import type { FirebaseAuthResponse } from '../../../api/model/firebase-auth-response';
import type { TokenExchangeResponse } from '../../../api/model/token-exchange-response';
import type { UserDtoOut } from '../../../api/model/user-dto-out';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { SignInComponent } from './sign-in.component';

const FAKE_USER: UserDtoOut = {
  id: 1,
  email: 'company1@e2e.test',
  userType: 'COMPANY',
} as unknown as UserDtoOut;

class FakeAuthApi {
  signInNext: () => Observable<FirebaseAuthResponse> = () => of({ success: true });
  exchangeNext: () => Observable<TokenExchangeResponse> = () =>
    of({ success: true } as unknown as TokenExchangeResponse);
  signOutNext: () => Observable<AuthOperationResponse> = () =>
    of({ success: true } as unknown as AuthOperationResponse);
  exchangeCalls = 0;
  signOutCalls = 0;
  signIn(): Observable<FirebaseAuthResponse> {
    return this.signInNext();
  }
  exchangeTokenForSession(): Observable<TokenExchangeResponse> {
    this.exchangeCalls += 1;
    return this.exchangeNext();
  }
  signOut(): Observable<AuthOperationResponse> {
    this.signOutCalls += 1;
    return this.signOutNext();
  }
}

class FakeSession {
  probeNext: () => Observable<UserDtoOut | null> = () => of(FAKE_USER);
  probeCalls = 0;
  probe(): Observable<UserDtoOut | null> {
    this.probeCalls += 1;
    return this.probeNext();
  }
}

class FakeMatDialog {
  result: { verified: boolean } | undefined = { verified: true };
  openCalls = 0;
  open(): MatDialogRef<unknown, { verified: boolean } | undefined> {
    this.openCalls += 1;
    const close$ = of(this.result);
    return {
      afterClosed: () => close$,
    } as unknown as MatDialogRef<unknown, { verified: boolean } | undefined>;
  }
}

function createComponent(
  authApi: FakeAuthApi,
  session: FakeSession = new FakeSession(),
  dialog: FakeMatDialog = new FakeMatDialog(),
): {
  fixture: ComponentFixture<SignInComponent>;
  session: FakeSession;
  dialog: FakeMatDialog;
} {
  TestBed.configureTestingModule({
    imports: [
      SignInComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: AuthApiService, useValue: authApi },
      { provide: SessionStateService, useValue: session },
      { provide: MatDialog, useValue: dialog },
    ],
  });
  const fixture: ComponentFixture<SignInComponent> = TestBed.createComponent(SignInComponent);
  fixture.detectChanges();
  return { fixture, session, dialog };
}

describe('SignInComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does nothing when the form is invalid', () => {
    const api = new FakeAuthApi();
    const { fixture } = createComponent(api);
    const spy = jest.spyOn(api, 'signIn');

    void fixture.componentInstance.submit();

    expect(spy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('signs in via cookies-only chain (login → exchange-token → /users/me) and navigates into the app', fakeAsync(() => {
    const api = new FakeAuthApi();
    const { fixture, session } = createComponent(api);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'secret123',
      rememberMe: false,
    });
    void fixture.componentInstance.submit();
    flush();

    expect(api.exchangeCalls).toBe(1);
    expect(session.probeCalls).toBe(1);
    expect(navSpy).toHaveBeenCalledWith(['/collaborations/list']);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.errorKey()).toBeNull();
  }));

  it('classifies HTTP 401 as invalid_credentials', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.signInNext = () =>
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
    const { fixture } = createComponent(api);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'secret123',
      rememberMe: false,
    });
    void fixture.componentInstance.submit();
    flush();

    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_in.invalid_credentials');
    expect(fixture.componentInstance.loading()).toBe(false);
  }));

  it('classifies HTTP 0 as service_unavailable', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.signInNext = () => throwError(() => new HttpErrorResponse({ status: 0 }));
    const { fixture } = createComponent(api);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'secret123',
      rememberMe: false,
    });
    void fixture.componentInstance.submit();
    flush();

    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_in.service_unavailable');
  }));

  it('redirects PENDING_ADMIN to /auth/2fa-setup before exchange-token', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.signInNext = () => of({ requires2FASetup: true });
    const { fixture } = createComponent(api);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.setValue({
      email: 'pending-admin@example.com',
      password: 'secret123',
      rememberMe: false,
    });
    void fixture.componentInstance.submit();
    flush();

    expect(navSpy).toHaveBeenCalledWith(['/auth/2fa-setup']);
    expect(api.exchangeCalls).toBe(0); // BE refuses exchange in PENDING_ADMIN
  }));

  it('opens TOTP dialog when ADMIN requires2FA, re-exchanges on verified, navigates', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.signInNext = () => of({ requires2FA: true });
    const dialog = new FakeMatDialog();
    dialog.result = { verified: true };
    const { fixture, session } = createComponent(api, undefined, dialog);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.setValue({
      email: 'admin@example.com',
      password: 'secret123',
      rememberMe: false,
    });
    void fixture.componentInstance.submit();
    flush();

    expect(dialog.openCalls).toBe(1);
    // Two exchanges: partial (post-login) + full (post-TOTP).
    expect(api.exchangeCalls).toBe(2);
    expect(session.probeCalls).toBe(1);
    expect(navSpy).toHaveBeenCalledWith(['/collaborations/list']);
  }));

  it('signs out + shows two_factor_cancelled when ADMIN cancels TOTP dialog', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.signInNext = () => of({ requires2FA: true });
    const dialog = new FakeMatDialog();
    dialog.result = { verified: false };
    const { fixture, session } = createComponent(api, undefined, dialog);

    fixture.componentInstance.form.setValue({
      email: 'admin@example.com',
      password: 'secret123',
      rememberMe: false,
    });
    void fixture.componentInstance.submit();
    flush();

    expect(api.signOutCalls).toBe(1);
    expect(api.exchangeCalls).toBe(1); // only the partial-session exchange
    expect(session.probeCalls).toBe(0);
    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_in.two_factor_cancelled');
  }));

  it('shows login_failed when /users/me returns null after a successful exchange', fakeAsync(() => {
    const api = new FakeAuthApi();
    const session = new FakeSession();
    session.probeNext = () => of(null);
    const { fixture } = createComponent(api, session);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'secret123',
      rememberMe: false,
    });
    void fixture.componentInstance.submit();
    flush();

    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_in.login_failed');
  }));
});
