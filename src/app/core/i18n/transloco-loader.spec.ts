import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { I18N_VERSION } from './i18n-version';
import { HttpTranslocoLoader } from './transloco-loader';

// The loader appends the content-hash cache-buster to every URL — specs
// assert it so a refactor that drops the query (reintroducing the stale-
// translation footgun) fails here, not in a returning user's browser.
const v = `?v=${I18N_VERSION}`;

// The URL is RELATIVE, and that is the assertion. It resolves against <base href>, which is "/" for the
// demo and "/sandbox/" for the sandbox build served under a path prefix on the same host. An absolute
// "/assets/i18n/…" would quietly fetch the demo's translations into the sandbox — same host, different
// build, different content hash — so a leading slash here is a bug, not a style choice.

describe('HttpTranslocoLoader', () => {
  let loader: HttpTranslocoLoader;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    loader = TestBed.inject(HttpTranslocoLoader);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs assets/i18n/{lang}.json, relative to the base href, cache-busted', () => {
    let received: unknown;
    loader.getTranslation('pl').subscribe((t) => (received = t));

    const req = httpMock.expectOne(`assets/i18n/pl.json${v}`);
    expect(req.request.method).toBe('GET');

    const payload = { greeting: 'Cześć' };
    req.flush(payload);
    expect(received).toEqual(payload);
  });

  it('builds the URL from the lang string verbatim (no normalisation)', () => {
    // Transloco asks for the active lang as a raw string. The loader
    // forwards it without lowercasing / aliasing — keeping the URL
    // mapping 1:1 with the on-disk filename. Tests both that the lang
    // is preserved AND that no extra path-segment is injected.
    loader.getTranslation('en-US').subscribe();

    const req = httpMock.expectOne(`assets/i18n/en-US.json${v}`);
    req.flush({});
  });

  it('fires a fresh request for each call (no in-loader cache)', () => {
    // Transloco itself caches the loader's result — the loader is
    // supposed to be a pure HTTP shim. If a future refactor added
    // memoisation here, it would conflict with Transloco's own cache
    // semantics (e.g. force-refresh, dynamic locale add).
    loader.getTranslation('pl').subscribe();
    httpMock.expectOne(`assets/i18n/pl.json${v}`).flush({});

    loader.getTranslation('pl').subscribe();
    httpMock.expectOne(`assets/i18n/pl.json${v}`).flush({});
  });
});
