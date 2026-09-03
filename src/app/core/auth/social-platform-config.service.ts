import { Injectable } from '@angular/core';

export interface SocialPlatformConfig {
  readonly name: string;
  readonly displayName: string;
  readonly icon: string;
  readonly clientId: string;
  readonly authEndpoint: string;
  readonly scopes: readonly string[];
  readonly responseType: string;
}

/**
 * OAuth state is a CSRF-protection nonce, NOT a token. Stored in a
 * non-HttpOnly cookie (the FE must read it back to validate against the
 * `state` query param Instagram sends on callback). Short Max-Age limits
 * the attack window.
 *
 * Per `feedback_no_client_token_storage`, never localStorage / sessionStorage.
 * The legacy FE used triple-redundancy (localStorage + sessionStorage +
 * cookie) for Safari iOS ITP — greenfield uses cookie only. Safari ITP
 * may clear cookies in some multi-step flows, in which case the user has
 * to retry. That's an acceptable trade-off vs storing OAuth state in
 * accessible client-side storage.
 */
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_MAX_AGE_S = 10 * 60; // 10 minutes

@Injectable({ providedIn: 'root' })
export class SocialPlatformConfigService {
  /**
   * Build the OAuth authorization URL for `platform`. Returns null if the
   * platform isn't supported. Generates + persists a CSRF state cookie
   * as a side-effect; call `validateOAuthState()` on callback.
   */
  getOAuthUrl(platform: string): string | null {
    const config = this.getPlatformConfig(platform);
    if (!config) return null;

    const state = this.generateAndStoreOAuthState();
    const redirectUri = `${this.origin()}/auth/social/callback/${platform}`;
    const params = [
      `client_id=${config.clientId}`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      `response_type=${config.responseType}`,
      `scope=${config.scopes.join(',')}`,
      `state=${state}`,
    ];
    return `${config.authEndpoint}?${params.join('&')}`;
  }

  /**
   * Verify the `state` query param from the OAuth callback against the
   * stored cookie. One-time use — clears the cookie regardless of outcome.
   */
  validateOAuthState(receivedState: string | null): boolean {
    if (!receivedState) {
      this.clearOAuthState();
      return false;
    }
    const stored = this.readStateCookie();
    this.clearOAuthState();
    return stored !== null && stored === receivedState;
  }

  clearOAuthState(): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${OAUTH_STATE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  getPlatformConfig(platform: string): SocialPlatformConfig | null {
    if (platform === 'instagram') return this.getInstagramConfig();
    return null;
  }

  private getInstagramConfig(): SocialPlatformConfig {
    return {
      name: 'instagram',
      displayName: 'Instagram',
      icon: 'instagram',
      // Public OAuth clientId — Instagram Basic Display app.
      // Override at build time via INSTAGRAM_CLIENT_ID env if needed; the
      // OAuth endpoint validates against allowed-redirect-URIs on Meta's
      // side, so a stolen clientId only redirects to our domain.
      clientId: '1071389464717013',
      authEndpoint: 'https://www.instagram.com/oauth/authorize',
      scopes: ['instagram_business_basic'],
      responseType: 'code',
    };
  }

  private generateAndStoreOAuthState(): string {
    const state = this.generateCryptoState();
    if (typeof document !== 'undefined') {
      const secure = this.origin().startsWith('https://') ? '; Secure' : '';
      document.cookie = `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Max-Age=${OAUTH_STATE_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
    }
    return state;
  }

  private generateCryptoState(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private readStateCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`${OAUTH_STATE_COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  private origin(): string {
    return typeof window !== 'undefined' ? window.location.origin : 'https://localhost:4201';
  }
}
