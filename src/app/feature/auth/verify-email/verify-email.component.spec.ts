import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { NEVER, Observable, of, throwError } from 'rxjs';
import type { AuthOperationResponse } from '../../../api/model/auth-operation-response';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { VerifyEmailComponent } from './verify-email.component';

class FakeAuthApi {
  verifyEmailNext: () => Observable<AuthOperationResponse> = () =>
    of({ success: true } as AuthOperationResponse);
  completeVerificationNext: () => Observable<AuthOperationResponse> = () =>
    of({ success: true } as AuthOperationResponse);
  sendVerificationEmailNext: () => Observable<AuthOperationResponse> = () =>
    of({ success: true } as AuthOperationResponse);
  verifyEmailCalls = 0;
  completeVerificationCalls: Array<{ oobCode: string; password?: string }> = [];
  sendVerificationEmailCalls = 0;

  verifyEmail(_oobCode: string): Observable<AuthOperationResponse> {
    this.verifyEmailCalls += 1;
    return this.verifyEmailNext();
  }
  completeVerification(oobCode: string, password?: string): Observable<AuthOperationResponse> {
    this.completeVerificationCalls.push({ oobCode, password });
    return this.completeVerificationNext();
  }
  sendVerificationEmail(): Observable<AuthOperationResponse> {
    this.sendVerificationEmailCalls += 1;
    return this.sendVerificationEmailNext();
  }
}

function stubRoute(params: Record<string, string | null>): ActivatedRoute {
  return {
    snapshot: {
      queryParamMap: {
        get: (k: string) => (k in params ? params[k] : null),
      },
    },
  } as unknown as ActivatedRoute;
}

function create(
  api: FakeAuthApi,
  params: Record<string, string | null>,
): ComponentFixture<VerifyEmailComponent> {
  TestBed.configureTestingModule({
    imports: [
      VerifyEmailComponent,
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
      { provide: ActivatedRoute, useValue: stubRoute(params) },
    ],
  });
  const fixture = TestBed.createComponent(VerifyEmailComponent);
  fixture.detectChanges();
  return fixture;
}

describe('VerifyEmailComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('flips to invalid when no oobCode in URL', () => {
    const fixture = create(new FakeAuthApi(), { oobCode: null });
    expect(fixture.componentInstance.state()).toBe('invalid');
  });

  describe('COMPANY / ADMIN flow (no ut=I)', () => {
    it('calls applyActionCode and flips to success on BE 2xx', fakeAsync(() => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: 'good-code' });
      tick();
      expect(api.verifyEmailCalls).toBe(1);
      expect(api.completeVerificationCalls).toHaveLength(0);
      expect(fixture.componentInstance.state()).toBe('success');
      expect(fixture.componentInstance.isInfluencerFlow()).toBe(false);
    }));

    it('flips to invalid on BE 400', fakeAsync(() => {
      const api = new FakeAuthApi();
      api.verifyEmailNext = () => throwError(() => new HttpErrorResponse({ status: 400 }));
      const fixture = create(api, { oobCode: 'expired' });
      tick();
      expect(fixture.componentInstance.state()).toBe('invalid');
    }));

    it('flips to invalid on any error (not just 400)', fakeAsync(() => {
      const api = new FakeAuthApi();
      api.verifyEmailNext = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      const fixture = create(api, { oobCode: 'good-code' });
      tick();
      expect(fixture.componentInstance.state()).toBe('invalid');
    }));
  });

  describe('INFLUENCER flow (ut=I)', () => {
    it('skips applyActionCode and shows the password form', () => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: 'good-code', ut: 'I' });
      expect(api.verifyEmailCalls).toBe(0);
      expect(fixture.componentInstance.state()).toBe('password');
      expect(fixture.componentInstance.isInfluencerFlow()).toBe(true);
    });

    it('does nothing on submit with an invalid form', () => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: 'good-code', ut: 'I' });

      fixture.componentInstance.submitPassword();

      expect(api.completeVerificationCalls).toHaveLength(0);
      expect(fixture.componentInstance.state()).toBe('password');
    });

    it('does nothing on submit when passwords do not match', () => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: 'good-code', ut: 'I' });
      fixture.componentInstance.passwordForm.setValue({
        password: 'StrongPass1',
        confirmPassword: 'Different1',
      });

      fixture.componentInstance.submitPassword();

      expect(api.completeVerificationCalls).toHaveLength(0);
      expect(fixture.componentInstance.state()).toBe('password');
    });

    it('rejects passwords shorter than 8 chars', () => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: 'good-code', ut: 'I' });
      fixture.componentInstance.passwordForm.setValue({
        password: 'short1',
        confirmPassword: 'short1',
      });

      fixture.componentInstance.submitPassword();

      expect(api.completeVerificationCalls).toHaveLength(0);
    });

    it('calls completeVerification(oobCode, password) and flips to success', fakeAsync(() => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: 'good-code', ut: 'I' });
      fixture.componentInstance.passwordForm.setValue({
        password: 'StrongPass1',
        confirmPassword: 'StrongPass1',
      });

      fixture.componentInstance.submitPassword();
      tick();

      expect(api.completeVerificationCalls).toEqual([
        { oobCode: 'good-code', password: 'StrongPass1' },
      ]);
      expect(fixture.componentInstance.state()).toBe('success');
    }));

    it('re-entry guard: a double-fire while completing calls completeVerification only once', () => {
      const api = new FakeAuthApi();
      api.completeVerificationNext = () => NEVER; // stays in flight → state pinned to 'completing'
      const fixture = create(api, { oobCode: 'good-code', ut: 'I' });
      fixture.componentInstance.passwordForm.setValue({
        password: 'StrongPass1',
        confirmPassword: 'StrongPass1',
      });

      fixture.componentInstance.submitPassword();
      expect(fixture.componentInstance.state()).toBe('completing');
      expect(api.completeVerificationCalls).toHaveLength(1);

      // Second click before the @switch hides the form must be a no-op —
      // otherwise a later 'invalid' resolution could overwrite the first
      // call's 'success'.
      fixture.componentInstance.submitPassword();
      expect(api.completeVerificationCalls).toHaveLength(1);
    });

    it('flips to invalid when completeVerification returns an error', fakeAsync(() => {
      const api = new FakeAuthApi();
      api.completeVerificationNext = () => throwError(() => new HttpErrorResponse({ status: 400 }));
      const fixture = create(api, { oobCode: 'expired', ut: 'I' });
      fixture.componentInstance.passwordForm.setValue({
        password: 'StrongPass1',
        confirmPassword: 'StrongPass1',
      });

      fixture.componentInstance.submitPassword();
      tick();

      expect(fixture.componentInstance.state()).toBe('invalid');
    }));
  });

  // Regression: Stage 6g parity sweep 2026-05-13 — legacy verify-email
  // exposes a "Wyślij ponownie email weryfikacyjny" CTA in the invalid
  // state; greenfield was missing it. Restores it via the resend signal +
  // /auth/send-verification-email wrapper (BE rate-limits 10/60s).
  describe('resend verification email (invalid state)', () => {
    it('calls sendVerificationEmail and flips resendState to sent on 2xx', fakeAsync(() => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: null });
      expect(fixture.componentInstance.state()).toBe('invalid');
      expect(fixture.componentInstance.resendState()).toBe('idle');

      fixture.componentInstance.resendVerificationEmail();
      tick();

      expect(api.sendVerificationEmailCalls).toBe(1);
      expect(fixture.componentInstance.resendState()).toBe('sent');
    }));

    it('flips resendState to failed when BE errors', fakeAsync(() => {
      const api = new FakeAuthApi();
      api.sendVerificationEmailNext = () =>
        throwError(() => new HttpErrorResponse({ status: 429 }));
      const fixture = create(api, { oobCode: null });

      fixture.componentInstance.resendVerificationEmail();
      tick();

      expect(fixture.componentInstance.resendState()).toBe('failed');
    }));

    it('does not double-fire while a resend is in flight', fakeAsync(() => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: null });

      fixture.componentInstance.resendVerificationEmail();
      // Second call before tick → resendState is 'sending', call should no-op
      fixture.componentInstance.resendVerificationEmail();
      tick();

      expect(api.sendVerificationEmailCalls).toBe(1);
      expect(fixture.componentInstance.resendState()).toBe('sent');
    }));

    it('does not fire again after a successful resend (button hidden)', fakeAsync(() => {
      const api = new FakeAuthApi();
      const fixture = create(api, { oobCode: null });

      fixture.componentInstance.resendVerificationEmail();
      tick();
      expect(fixture.componentInstance.resendState()).toBe('sent');

      fixture.componentInstance.resendVerificationEmail();
      tick();
      expect(api.sendVerificationEmailCalls).toBe(1);
    }));
  });
});
