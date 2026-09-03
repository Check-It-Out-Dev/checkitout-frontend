import { Injectable, inject, signal } from '@angular/core';
import { LocationRedirectService } from './location-redirect.service';
import { SocialPlatformConfigService } from './social-platform-config.service';

/**
 * Initiates the OAuth provider redirect for `platform`. Greenfield's
 * model is: FE generates the auth URL → `window.location.assign` →
 * provider redirects to BE's `/auth/social/callback/:platform` (BE sets
 * `oauth_token` HttpOnly cookie + 302 to `/auth/success`) →
 * `AuthSuccessComponent` calls `exchangeTokenForSession()` to upgrade
 * the cookie to a session.
 *
 * Despite the legacy-side `processSocialSignIn()` POST, the BE's
 * `/auth/social/callback/instagram` GET handler does the User /
 * UserSocialConnection / Firestore writes itself. Greenfield only needs
 * to (1) start the OAuth flow and (2) handle the success landing.
 */
@Injectable({ providedIn: 'root' })
export class SocialAuthService {
  private readonly config = inject(SocialPlatformConfigService);
  private readonly location = inject(LocationRedirectService);

  private readonly _starting = signal(false);
  /** True between `startOAuthFlow()` and the actual page redirect. */
  readonly starting = this._starting.asReadonly();

  /**
   * Build the OAuth URL + redirect the page to it. Returns true on
   * successful redirect-init, false if the platform isn't supported
   * (the caller should surface a translation key).
   */
  startOAuthFlow(platform: string): boolean {
    this._starting.set(true);
    const authUrl = this.config.getOAuthUrl(platform);
    if (!authUrl) {
      this._starting.set(false);
      return false;
    }
    this.location.assign(authUrl);
    // Loading state stays true until the page navigates away (or the
    // caller explicitly clears it on a navigation back).
    return true;
  }

  clearOAuthLoading(): void {
    this._starting.set(false);
  }
}
