import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RateLimitStateService } from '../rate-limit/rate-limit-state.service';
import { rateLimitInterceptor } from './rate-limit-cache.interceptor';

class FakeRateLimitState {
  calls: Array<number | null> = [];
  notify(seconds: number | null): void {
    this.calls.push(seconds);
  }
  clear(): void {
    /* not exercised here */
  }
}

describe('rateLimitInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let rateLimit: FakeRateLimitState;

  beforeEach(() => {
    rateLimit = new FakeRateLimitState();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([rateLimitInterceptor])),
        provideHttpClientTesting(),
        { provide: RateLimitStateService, useValue: rateLimit },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('passes successful responses through unchanged (no rate-limit notify)', () => {
    let received: unknown;
    http.get('/api/normal').subscribe((res) => (received = res));
    httpMock.expectOne('/api/normal').flush({ ok: true });

    expect(received).toEqual({ ok: true });
    expect(rateLimit.calls).toEqual([]);
  });

  it('notifies the rate-limit state with the parsed Retry-After on 429', () => {
    let caught: HttpErrorResponse | undefined;
    http
      .get('/api/throttled')
      .subscribe({ next: () => {}, error: (e: HttpErrorResponse) => (caught = e) });
    httpMock.expectOne('/api/throttled').flush('Too Many Requests', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '42' },
    });

    expect(caught?.status).toBe(429);
    expect(rateLimit.calls).toEqual([42]);
  });

  it('notifies with null when the 429 omits Retry-After', () => {
    http.get('/api/throttled-no-header').subscribe({ next: () => {}, error: () => {} });
    httpMock
      .expectOne('/api/throttled-no-header')
      .flush('Throttled', { status: 429, statusText: 'Too Many Requests' });

    expect(rateLimit.calls).toEqual([null]);
  });

  it('notifies with null when Retry-After is an HTTP-date (not delta-seconds)', () => {
    http.get('/api/throttled-date').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('/api/throttled-date').flush('Throttled', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': 'Wed, 21 Oct 2025 07:28:00 GMT' },
    });

    expect(rateLimit.calls).toEqual([null]);
  });

  it('does NOT notify on non-429 errors (5xx, 401, etc.)', () => {
    http.get('/api/server-error').subscribe({ next: () => {}, error: () => {} });
    httpMock
      .expectOne('/api/server-error')
      .flush('Boom', { status: 500, statusText: 'Internal Server Error' });

    expect(rateLimit.calls).toEqual([]);
  });

  it('re-throws the 429 unchanged (preserves status + body for downstream handlers)', () => {
    let caught: HttpErrorResponse | undefined;
    http
      .post('/api/write', { foo: 1 })
      .subscribe({ next: () => {}, error: (e: HttpErrorResponse) => (caught = e) });
    httpMock
      .expectOne('/api/write')
      .flush(
        { error: 'Too Many', code: 'RATE_LIMIT' },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '10' } },
      );

    expect(caught?.status).toBe(429);
    expect(caught?.error).toEqual({ error: 'Too Many', code: 'RATE_LIMIT' });
    expect(rateLimit.calls).toEqual([10]);
  });
});
