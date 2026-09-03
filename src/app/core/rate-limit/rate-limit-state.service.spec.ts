import { PLATFORM_ID } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RateLimitStateService } from './rate-limit-state.service';

describe('RateLimitStateService', () => {
  function make(platformId = 'browser'): RateLimitStateService {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: platformId }],
    });
    return TestBed.inject(RateLimitStateService);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('activates with the given Retry-After and auto-dismisses after the window', fakeAsync(() => {
    const svc = make();
    svc.notify(30);
    expect(svc.active()).toBe(true);
    expect(svc.retryAfterSeconds()).toBe(30);

    tick(29_999);
    expect(svc.active()).toBe(true);
    tick(1);
    expect(svc.active()).toBe(false);
    expect(svc.retryAfterSeconds()).toBeNull();
  }));

  it('falls back to a default window when Retry-After is null', fakeAsync(() => {
    const svc = make();
    svc.notify(null);
    expect(svc.retryAfterSeconds()).toBe(10);
    tick(10_000);
    expect(svc.active()).toBe(false);
  }));

  it('caps an oversized Retry-After so the banner cannot be pinned forever', () => {
    const svc = make();
    svc.notify(99_999);
    expect(svc.retryAfterSeconds()).toBe(120);
    svc.clear();
  });

  it('clear() dismisses immediately', () => {
    const svc = make();
    svc.notify(30);
    svc.clear();
    expect(svc.active()).toBe(false);
    expect(svc.retryAfterSeconds()).toBeNull();
  });

  it('re-notify resets the dismiss timer', fakeAsync(() => {
    const svc = make();
    svc.notify(30);
    tick(20_000);
    svc.notify(30); // second 429 resets the window
    tick(20_000);
    expect(svc.active()).toBe(true); // without the reset this would have cleared at 30s
    tick(10_000);
    expect(svc.active()).toBe(false);
  }));

  it('is a no-op during SSR (server platform)', () => {
    const svc = make('server');
    svc.notify(30);
    // A transient 429 banner must not be baked into the server HTML — it
    // would flash away on hydration.
    expect(svc.active()).toBe(false);
    expect(svc.retryAfterSeconds()).toBeNull();
  });
});
