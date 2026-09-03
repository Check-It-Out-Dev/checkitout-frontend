import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { FirebaseAuthResponse } from '../../../api/model/firebase-auth-response';
import type { LegalDocumentDtoOut } from '../../../api/model/legal-document-dto-out';
import { LegalDocumentType } from '../../../api/model/legal-document-type';
import type { NipLookupResponse } from '../../../api/model/nip-lookup-response';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { LegalApiService } from '../../../core/legal/legal-api.service';
import { CompanyRegistryService } from '../../../core/registry/registry.service';
import { BusinessSignUpComponent } from './business-sign-up.component';

class FakeAuthApi {
  next: () => Observable<FirebaseAuthResponse> = () => of({ idToken: 'id', refreshToken: 'r' });
  register(): Observable<FirebaseAuthResponse> {
    return this.next();
  }
}

class FakeRegistry {
  next: () => Observable<NipLookupResponse> = () =>
    of({ companyName: 'Acme', city: 'Warszawa', vatStatus: 'ACTIVE' } as NipLookupResponse);
  lookup(): Observable<NipLookupResponse> {
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

function create(
  api: FakeAuthApi,
  registry: FakeRegistry,
): ComponentFixture<BusinessSignUpComponent> {
  TestBed.configureTestingModule({
    imports: [
      BusinessSignUpComponent,
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
      { provide: CompanyRegistryService, useValue: registry },
      { provide: LegalApiService, useValue: new FakeLegalApi() },
    ],
  });
  const fixture = TestBed.createComponent(BusinessSignUpComponent);
  fixture.detectChanges();
  return fixture;
}

describe('BusinessSignUpComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does nothing when NIP is invalid', () => {
    const api = new FakeAuthApi();
    const registry = new FakeRegistry();
    const fixture = create(api, registry);
    const spy = jest.spyOn(registry, 'lookup');

    fixture.componentInstance.form.controls.nip.setValue('not-a-nip');
    fixture.componentInstance.verifyNip();

    expect(spy).not.toHaveBeenCalled();
  });

  it('populates company on successful NIP lookup', fakeAsync(() => {
    const api = new FakeAuthApi();
    const registry = new FakeRegistry();
    const fixture = create(api, registry);

    fixture.componentInstance.form.controls.nip.setValue('5252447777');
    fixture.componentInstance.verifyNip();
    tick();

    expect(fixture.componentInstance.company()?.companyName).toBe('Acme');
    expect(fixture.componentInstance.errorKey()).toBeNull();
  }));

  it('classifies 404 as nip_not_found', fakeAsync(() => {
    const api = new FakeAuthApi();
    const registry = new FakeRegistry();
    registry.next = () => throwError(() => new HttpErrorResponse({ status: 404 }));
    const fixture = create(api, registry);

    fixture.componentInstance.form.controls.nip.setValue('5252447777');
    fixture.componentInstance.verifyNip();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_up.nip_not_found');
    expect(fixture.componentInstance.company()).toBeNull();
  }));

  it('blocks submit until NIP is verified', () => {
    const api = new FakeAuthApi();
    const registry = new FakeRegistry();
    const fixture = create(api, registry);
    const spy = jest.spyOn(api, 'register');

    fixture.componentInstance.form.setValue({
      nip: '5252447777',
      email: 'biz@example.com',
      password: 'password123',
    });
    fixture.componentInstance.onConsentChange(true);
    // Note: didn't call verifyNip — company signal stays null.
    fixture.componentInstance.submit();

    expect(spy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.errorKey()).toBe('auth.sign_up.verify_nip_first');
  });

  it('blocks submit until consent is accepted', fakeAsync(() => {
    const api = new FakeAuthApi();
    const registry = new FakeRegistry();
    const fixture = create(api, registry);
    const spy = jest.spyOn(api, 'register');

    fixture.componentInstance.form.setValue({
      nip: '5252447777',
      email: 'biz@example.com',
      password: 'password123',
    });
    fixture.componentInstance.verifyNip();
    tick();
    // consentValid stays false
    fixture.componentInstance.submit();

    expect(spy).not.toHaveBeenCalled();
  }));

  it('registers and navigates to /auth/confirmation-required on full success', fakeAsync(() => {
    const api = new FakeAuthApi();
    const registry = new FakeRegistry();
    const fixture = create(api, registry);
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.setValue({
      nip: '5252447777',
      email: 'biz@example.com',
      password: 'password123',
    });
    fixture.componentInstance.verifyNip();
    tick();
    fixture.componentInstance.onConsentChange(true);
    fixture.componentInstance.submit();
    tick();

    expect(navSpy).toHaveBeenCalledWith(['/auth/confirmation-required']);
  }));
});
