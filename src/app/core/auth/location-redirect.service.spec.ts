import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { LocationRedirectService } from './location-redirect.service';

describe('LocationRedirectService', () => {
  let assignFn: jest.Mock;
  let replaceFn: jest.Mock;

  // The service reads the window via DOCUMENT.defaultView at construction,
  // so provide a fake DOCUMENT and inject fresh each time.
  function make(defaultView: unknown): LocationRedirectService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView } }],
    });
    return TestBed.inject(LocationRedirectService);
  }

  beforeEach(() => {
    assignFn = jest.fn();
    replaceFn = jest.fn();
  });

  it('assign() delegates to window.location.assign with the given URL', () => {
    const service = make({ location: { assign: assignFn, replace: replaceFn } });
    service.assign('https://example.com/oauth/start');

    expect(assignFn).toHaveBeenCalledTimes(1);
    expect(assignFn).toHaveBeenCalledWith('https://example.com/oauth/start');
    expect(replaceFn).not.toHaveBeenCalled();
  });

  it('replace() delegates to window.location.replace with the given URL', () => {
    const service = make({ location: { assign: assignFn, replace: replaceFn } });
    service.replace('/auth/success?token=abc');

    expect(replaceFn).toHaveBeenCalledTimes(1);
    expect(replaceFn).toHaveBeenCalledWith('/auth/success?token=abc');
    expect(assignFn).not.toHaveBeenCalled();
  });

  it('preserves the exact URL string (no normalisation)', () => {
    // Query params + fragments should round-trip verbatim — callers
    // sometimes embed CSRF state in the URL and any rewriting would
    // break the round-trip.
    const service = make({ location: { assign: assignFn, replace: replaceFn } });
    const url = 'https://api.instagram.com/oauth/authorize?client_id=X&state=csrf-123#frag';
    service.assign(url);
    expect(assignFn).toHaveBeenCalledWith(url);
  });

  it('is SSR-safe — when there is no window (defaultView null), both methods no-op', () => {
    // Under SSR, DOCUMENT.defaultView is null; the `?.` guard must
    // short-circuit before touching location.
    const service = make(null);
    expect(() => service.assign('https://example.com')).not.toThrow();
    expect(() => service.replace('https://example.com')).not.toThrow();
  });
});
