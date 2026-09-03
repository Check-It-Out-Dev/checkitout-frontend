import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { LocationRedirectService } from '../../core/auth/location-redirect.service';
import { SocialPlatformConfigService } from '../../core/auth/social-platform-config.service';
import { SocialCallbackComponent } from '../../feature/auth/social-callback/social-callback.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * OAuth provider-callback landing (`/auth/social/callback/:platform`)
 * fixtures. The component reads paramMap + queryParamMap as OBSERVABLES
 * (combineLatest), so the route stub carries streams, not just a
 * snapshot. The happy path immediately hands off to the BE via
 * `LocationRedirectService.replace` — the processing fixture stubs that
 * to a no-op recorder so the spinner state stays on screen.
 */

function route(platform: string | null, query: Record<string, string>): ActivatedRoute {
  return {
    paramMap: of(convertToParamMap(platform ? { platform } : {})),
    queryParamMap: of(convertToParamMap(query)),
  } as unknown as ActivatedRoute;
}

/** Accepts any state token — keeps the happy path on the spinner branch. */
class StubConfigValid {
  validateOAuthState(): boolean {
    return true;
  }
  clearOAuthState(): void {
    /* no-op */
  }
}

/** Rejects every state token — forces the CSRF-failed branch. */
class StubConfigInvalid {
  validateOAuthState(): boolean {
    return false;
  }
  clearOAuthState(): void {
    /* no-op */
  }
}

/** Records instead of navigating so the fixture never leaves the page. */
class StubLocationRecorder {
  lastUrl: string | null = null;
  replace(url: string): void {
    this.lastUrl = url;
  }
}

export const SOCIAL_CALLBACK_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'social-callback-processing',
    label: 'Social callback · valid code+state, BE hand-off in flight',
    component: SocialCallbackComponent,
    providers: [
      {
        provide: ActivatedRoute,
        useValue: route('instagram', { code: 'oauth-code', state: 'tok' }),
      },
      { provide: SocialPlatformConfigService, useClass: StubConfigValid },
      { provide: LocationRedirectService, useClass: StubLocationRecorder },
    ],
  },
  {
    id: 'social-callback-cancelled',
    label: 'Social callback · user cancelled at provider (access_denied)',
    component: SocialCallbackComponent,
    providers: [
      { provide: ActivatedRoute, useValue: route('instagram', { error: 'access_denied' }) },
      { provide: SocialPlatformConfigService, useClass: StubConfigValid },
      { provide: LocationRedirectService, useClass: StubLocationRecorder },
    ],
  },
  {
    id: 'social-callback-csrf-failed',
    label: 'Social callback · state mismatch (CSRF guard)',
    component: SocialCallbackComponent,
    providers: [
      {
        provide: ActivatedRoute,
        useValue: route('instagram', { code: 'oauth-code', state: 'forged' }),
      },
      { provide: SocialPlatformConfigService, useClass: StubConfigInvalid },
      { provide: LocationRedirectService, useClass: StubLocationRecorder },
    ],
  },
];
