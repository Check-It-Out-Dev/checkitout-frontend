import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Tiny wrapper around `window.location` for the OAuth flow. Exists solely
 * so unit tests can stub the page redirect.
 *
 * The browser window is resolved through DI (`DOCUMENT.defaultView`) rather
 * than the global, so tests inject a fake and never patch jsdom's
 * `window.location` — which jsdom 30 makes non-writable AND
 * non-configurable, so property-level mocking is unreliable across suites.
 * `defaultView` is null under SSR, which the `?.` guard handles.
 *
 * Used by SocialAuthService (assign) + SocialCallbackComponent (replace)
 * + AuthSuccessComponent (none — it uses Angular Router for in-app nav).
 */
@Injectable({ providedIn: 'root' })
export class LocationRedirectService {
  private readonly win = inject(DOCUMENT).defaultView;

  assign(url: string): void {
    this.win?.location.assign(url);
  }

  replace(url: string): void {
    this.win?.location.replace(url);
  }
}
