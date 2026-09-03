import { TestBed } from '@angular/core/testing';
import { LocationRedirectService } from './location-redirect.service';
import { SocialAuthService } from './social-auth.service';
import { SocialPlatformConfigService } from './social-platform-config.service';

class FakeConfig {
  url: string | null = 'https://example.test/oauth?state=abc';
  getOAuthUrl(_platform: string): string | null {
    return this.url;
  }
}

class FakeLocation {
  assigned: string | null = null;
  replaced: string | null = null;
  assign(url: string): void {
    this.assigned = url;
  }
  replace(url: string): void {
    this.replaced = url;
  }
}

describe('SocialAuthService', () => {
  let svc: SocialAuthService;
  let config: FakeConfig;
  let location: FakeLocation;

  beforeEach(() => {
    config = new FakeConfig();
    location = new FakeLocation();
    TestBed.configureTestingModule({
      providers: [
        { provide: SocialPlatformConfigService, useValue: config },
        { provide: LocationRedirectService, useValue: location },
      ],
    });
    svc = TestBed.inject(SocialAuthService);
  });

  it('redirects to the OAuth URL for a supported platform', () => {
    expect(svc.startOAuthFlow('instagram')).toBe(true);
    expect(location.assigned).toBe('https://example.test/oauth?state=abc');
    expect(svc.starting()).toBe(true);
  });

  it('returns false + does not redirect when platform is unsupported', () => {
    config.url = null;
    // Greenfield supports Instagram only (legacy parity).
    expect(svc.startOAuthFlow('not-a-real-platform')).toBe(false);
    expect(location.assigned).toBeNull();
    expect(svc.starting()).toBe(false);
  });

  it('clearOAuthLoading() resets the starting flag', () => {
    svc.startOAuthFlow('instagram');
    svc.clearOAuthLoading();
    expect(svc.starting()).toBe(false);
  });
});
