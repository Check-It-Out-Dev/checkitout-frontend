import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { FirebaseAuthResponse } from '../../../api/model/firebase-auth-response';
import type { LegalDocumentDtoOut } from '../../../api/model/legal-document-dto-out';
import { LegalDocumentType } from '../../../api/model/legal-document-type';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { LegalApiService } from '../../../core/legal/legal-api.service';
import { InfluencerSignUpComponent } from './influencer-sign-up.component';

class FakeAuthApi {
  next: () => Observable<FirebaseAuthResponse> = () =>
    of({ idToken: 'id-tok', refreshToken: 'refresh-tok' });
  register(): Observable<FirebaseAuthResponse> {
    return this.next();
  }
}

const SAMPLE_DOCS: LegalDocumentDtoOut[] = [
  { type: LegalDocumentType.TERMS_OF_SERVICE, version: 1, contentHash: 'tos', downloadUrl: '#' },
  { type: LegalDocumentType.PRIVACY_POLICY, version: 1, contentHash: 'pp', downloadUrl: '#' },
  { type: LegalDocumentType.COOKIE_POLICY, version: 1, contentHash: 'cp', downloadUrl: '#' },
];

class FakeLegalApi {
  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return of(SAMPLE_DOCS);
  }
  prepareConsentCookie(): Observable<unknown> {
    return of({});
  }
}

function create(api: FakeAuthApi): ComponentFixture<InfluencerSignUpComponent> {
  TestBed.configureTestingModule({
    imports: [
      InfluencerSignUpComponent,
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
      { provide: LegalApiService, useValue: new FakeLegalApi() },
    ],
  });
  const fixture = TestBed.createComponent(InfluencerSignUpComponent);
  fixture.detectChanges();
  return fixture;
}

describe('InfluencerSignUpComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does nothing when consent is not accepted', () => {
    const api = new FakeAuthApi();
    const fixture = create(api);
    const spy = jest.spyOn(api, 'register');

    fixture.componentInstance.form.patchValue({
      email: 'user@example.com',
      password: 'password123',
    });
    // consentValid stays false — the user never ticked the clickwrap
    fixture.componentInstance.submit();

    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing when form is invalid even if consent is accepted', () => {
    const api = new FakeAuthApi();
    const fixture = create(api);
    const spy = jest.spyOn(api, 'register');

    fixture.componentInstance.onConsentChange(true);
    // Form left empty.
    fixture.componentInstance.submit();

    expect(spy).not.toHaveBeenCalled();
  });

  it('redirects to /auth/confirmation-required on success', fakeAsync(() => {
    const api = new FakeAuthApi();
    const fixture = create(api);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'password123',
    });
    fixture.componentInstance.onConsentChange(true);
    fixture.componentInstance.submit();
    tick();

    expect(navSpy).toHaveBeenCalledWith(['/auth/confirmation-required']);
  }));

  it('classifies HTTP 409 as email_already_taken', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 409 }));
    const fixture = create(api);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'password123',
    });
    fixture.componentInstance.onConsentChange(true);
    fixture.componentInstance.submit();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_up.email_already_taken');
  }));

  it('classifies HTTP 429 as rate_limited', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 429 }));
    const fixture = create(api);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'password123',
    });
    fixture.componentInstance.onConsentChange(true);
    fixture.componentInstance.submit();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_up.rate_limited');
  }));

  it('redirects regardless of register response shape (BE owns the verification-pending flow)', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.next = () => of({});
    const fixture = create(api);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.setValue({
      email: 'user@example.com',
      password: 'password123',
    });
    fixture.componentInstance.onConsentChange(true);
    fixture.componentInstance.submit();
    tick();

    expect(navSpy).toHaveBeenCalledWith(['/auth/confirmation-required']);
  }));
});
