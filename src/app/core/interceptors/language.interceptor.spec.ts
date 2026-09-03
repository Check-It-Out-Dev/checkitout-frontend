import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import { languageInterceptor } from './language.interceptor';

class FakeTransloco {
  private active = 'pl';
  setActiveLang(lang: string) {
    this.active = lang;
  }
  getActiveLang() {
    return this.active;
  }
}

describe('languageInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let transloco: FakeTransloco;

  beforeEach(() => {
    transloco = new FakeTransloco();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([languageInterceptor])),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: transloco },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sets Accept-Language from the Transloco active locale', () => {
    transloco.setActiveLang('en');
    http.get('/api/whatever').subscribe();

    const req = httpMock.expectOne('/api/whatever');
    expect(req.request.headers.get('Accept-Language')).toBe('en');
    req.flush({});
  });

  it('reflects locale changes between requests', () => {
    transloco.setActiveLang('pl');
    http.get('/api/first').subscribe();
    const first = httpMock.expectOne('/api/first');
    expect(first.request.headers.get('Accept-Language')).toBe('pl');
    first.flush({});

    transloco.setActiveLang('de');
    http.get('/api/second').subscribe();
    const second = httpMock.expectOne('/api/second');
    expect(second.request.headers.get('Accept-Language')).toBe('de');
    second.flush({});
  });

  it('handles an empty active-lang string by falling back to navigator.language or "pl"', () => {
    // getActiveLang() returning '' (empty string) is falsy → triggers
    // the same fallback chain the interceptor uses when Transloco
    // isn't initialised yet. We expect a non-empty language tag
    // (jsdom provides navigator.language).
    transloco.setActiveLang('');
    http.get('/api/empty-lang').subscribe();

    const req = httpMock.expectOne('/api/empty-lang');
    const lang = req.request.headers.get('Accept-Language');
    expect(typeof lang).toBe('string');
    expect((lang ?? '').length).toBeGreaterThan(0);
    req.flush({});
  });
});
