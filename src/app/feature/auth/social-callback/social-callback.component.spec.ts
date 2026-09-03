import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { BehaviorSubject } from 'rxjs';
import { LocationRedirectService } from '../../../core/auth/location-redirect.service';
import { SocialPlatformConfigService } from '../../../core/auth/social-platform-config.service';
import { SocialCallbackComponent } from './social-callback.component';

class FakeConfig {
  validateReturn = true;
  validateCalls: (string | null)[] = [];
  clearCalls = 0;
  validateOAuthState(state: string | null): boolean {
    this.validateCalls.push(state);
    return this.validateReturn;
  }
  clearOAuthState(): void {
    this.clearCalls += 1;
  }
}

class FakeLocation {
  replaced: string | null = null;
  replace(url: string): void {
    this.replaced = url;
  }
  assign(url: string): void {
    /* unused here */
    void url;
  }
}

function create(opts: {
  platform: string | null;
  query: Record<string, string>;
  config?: FakeConfig;
}): {
  fixture: ComponentFixture<SocialCallbackComponent>;
  config: FakeConfig;
  location: FakeLocation;
} {
  const config = opts.config ?? new FakeConfig();
  const location = new FakeLocation();
  const params$ = new BehaviorSubject<ParamMap>(
    convertToParamMap(opts.platform ? { platform: opts.platform } : {}),
  );
  const query$ = new BehaviorSubject<ParamMap>(convertToParamMap(opts.query));

  TestBed.configureTestingModule({
    imports: [
      SocialCallbackComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: SocialPlatformConfigService, useValue: config },
      { provide: LocationRedirectService, useValue: location },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: params$.asObservable(),
          queryParamMap: query$.asObservable(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SocialCallbackComponent);
  fixture.detectChanges();
  return { fixture, config, location };
}

describe('SocialCallbackComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('forwards to BE callback when state validates', () => {
    const { fixture, config, location } = create({
      platform: 'instagram',
      query: { code: 'auth-code-123', state: 'csrf-nonce' },
    });
    expect(config.validateCalls).toEqual(['csrf-nonce']);
    expect(location.replaced).toBe(
      '/api/auth/social/callback/instagram?code=auth-code-123&state=csrf-nonce',
    );
    expect(fixture.componentInstance.errorKey()).toBeNull();
  });

  it('shows csrf_failed when validateOAuthState returns false', () => {
    const config = new FakeConfig();
    config.validateReturn = false;
    const { fixture, location } = create({
      platform: 'instagram',
      query: { code: 'auth-code-123', state: 'mismatched' },
      config,
    });
    expect(fixture.componentInstance.errorKey()).toBe('auth.social_callback.errors.csrf_failed');
    expect(location.replaced).toBeNull();
    expect(config.clearCalls).toBeGreaterThan(0);
  });

  it('shows cancelled error when provider sent error=access_denied', () => {
    const { fixture, config, location } = create({
      platform: 'instagram',
      query: { error: 'access_denied' },
    });
    expect(fixture.componentInstance.errorKey()).toBe('auth.social_callback.errors.cancelled');
    expect(location.replaced).toBeNull();
    expect(config.clearCalls).toBeGreaterThan(0);
  });

  it('shows provider_failed for any other OAuth provider error', () => {
    const { fixture } = create({
      platform: 'instagram',
      query: { error: 'invalid_request' },
    });
    expect(fixture.componentInstance.errorKey()).toBe(
      'auth.social_callback.errors.provider_failed',
    );
  });

  it('shows no_code when code is missing but no provider error', () => {
    const { fixture } = create({ platform: 'instagram', query: {} });
    expect(fixture.componentInstance.errorKey()).toBe('auth.social_callback.errors.no_code');
  });

  it('shows csrf_failed when state is missing entirely', () => {
    const { fixture, location } = create({
      platform: 'instagram',
      query: { code: 'auth-code-123' },
    });
    expect(fixture.componentInstance.errorKey()).toBe('auth.social_callback.errors.csrf_failed');
    expect(location.replaced).toBeNull();
  });

  it('shows unsupported_platform when route has no platform param', () => {
    const { fixture } = create({
      platform: null,
      query: { code: 'auth-code-123', state: 'csrf-nonce' },
    });
    expect(fixture.componentInstance.errorKey()).toBe(
      'auth.social_callback.errors.unsupported_platform',
    );
  });
});
