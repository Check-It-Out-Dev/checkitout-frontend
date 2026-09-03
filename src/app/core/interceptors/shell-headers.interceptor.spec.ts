import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ShellStatusService } from '../shell/shell-status.service';
import { shellHeadersInterceptor } from './shell-headers.interceptor';

describe('shellHeadersInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let shellStatus: ShellStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([shellHeadersInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    shellStatus = TestBed.inject(ShellStatusService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('forwards X-Consent-Required to the shell-status service', () => {
    expect(shellStatus.consentRequired()).toBe(false);
    http.get('/api/whatever').subscribe();

    const req = httpMock.expectOne('/api/whatever');
    req.flush({}, { headers: { 'X-Consent-Required': '1' } });

    expect(shellStatus.consentRequired()).toBe(true);
  });

  it('forwards X-Email-Verification-Required to the shell-status service', () => {
    expect(shellStatus.emailVerificationRequired()).toBe(false);
    http.get('/api/whatever').subscribe();

    const req = httpMock.expectOne('/api/whatever');
    req.flush({}, { headers: { 'X-Email-Verification-Required': '1' } });

    expect(shellStatus.emailVerificationRequired()).toBe(true);
  });

  it('leaves the service untouched when the headers are absent', () => {
    http.get('/api/clean').subscribe();
    const req = httpMock.expectOne('/api/clean');
    req.flush({});

    expect(shellStatus.consentRequired()).toBe(false);
    expect(shellStatus.emailVerificationRequired()).toBe(false);
  });

  it('honours sticky semantics — header drop on later response does NOT clear the flag', () => {
    http.get('/api/consent').subscribe();
    const reqA = httpMock.expectOne('/api/consent');
    reqA.flush({}, { headers: { 'X-Consent-Required': '1' } });
    expect(shellStatus.consentRequired()).toBe(true);

    // Same browser session, later API call — no header this time. The
    // interceptor MUST NOT clear the flag (only LegalApiService /
    // explicit shellStatus.clearConsent() does that).
    http.get('/api/something-else').subscribe();
    const reqB = httpMock.expectOne('/api/something-else');
    reqB.flush({});
    expect(shellStatus.consentRequired()).toBe(true);
  });

  it('does NOT update the service on error responses (only HttpResponse events count)', () => {
    http.get('/api/failure').subscribe({
      next: () => {},
      error: () => {},
    });
    const req = httpMock.expectOne('/api/failure');
    req.flush('Boom', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'X-Consent-Required': '1' },
    });

    // HttpErrorResponse is NOT instanceof HttpResponse, so the
    // interceptor's tap() branch skips it. (Errors are still observed
    // separately by errorInterceptor.)
    expect(shellStatus.consentRequired()).toBe(false);
  });
});
