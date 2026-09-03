import {
  HttpClient,
  HttpContext,
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { STEP_UP_TOKEN, withStepUpToken } from '../step-up/step-up-context';
import { stepUpInterceptor } from './step-up.interceptor';

describe('stepUpInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([stepUpInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('passes the request through unchanged when STEP_UP_TOKEN is unset', () => {
    http.get('/api/some-endpoint').subscribe();

    const req = httpMock.expectOne('/api/some-endpoint');
    expect(req.request.headers.has('X-Step-Up-Token')).toBe(false);
    req.flush({});
  });

  it('adds X-Step-Up-Token header when a token is set on the request context', () => {
    const ctx = withStepUpToken('totp-12345');
    http.patch('/api/users/email', { email: 'new@example.com' }, { context: ctx }).subscribe();

    const req = httpMock.expectOne('/api/users/email');
    expect(req.request.headers.get('X-Step-Up-Token')).toBe('totp-12345');
    req.flush({});
  });

  it('treats an explicit null context value as "no token" (default behavior)', () => {
    const ctx = new HttpContext().set(STEP_UP_TOKEN, null);
    http.post('/api/anything', {}, { context: ctx }).subscribe();

    const req = httpMock.expectOne('/api/anything');
    expect(req.request.headers.has('X-Step-Up-Token')).toBe(false);
    req.flush({});
  });

  it('does not leak the token across subsequent requests', () => {
    const ctx = withStepUpToken('totp-once');
    http.patch('/api/first', {}, { context: ctx }).subscribe();
    const firstReq = httpMock.expectOne('/api/first');
    expect(firstReq.request.headers.get('X-Step-Up-Token')).toBe('totp-once');
    firstReq.flush({});

    http.get('/api/second').subscribe();
    const secondReq = httpMock.expectOne('/api/second');
    expect(secondReq.request.headers.has('X-Step-Up-Token')).toBe(false);
    secondReq.flush({});
  });
});
