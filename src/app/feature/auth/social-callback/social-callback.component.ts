import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { combineLatest } from 'rxjs';
import { LocationRedirectService } from '../../../core/auth/location-redirect.service';
import { SocialPlatformConfigService } from '../../../core/auth/social-platform-config.service';

/**
 * `/auth/social/callback/:platform` — landing page that the OAuth
 * provider (Instagram) redirects to after the user authorizes the app.
 *
 * Flow:
 *   1. Read `code` + `state` query params.
 *   2. Validate `state` against the cookie SocialPlatformConfigService
 *      issued before the redirect (CSRF protection).
 *   3. If valid: forward to BE's
 *      `/api/auth/social/callback/instagram?code=…&state=…` — the BE
 *      handles the code-exchange, sets `oauth_token` HttpOnly cookies,
 *      and 302-redirects to `/auth/success`.
 *   4. If invalid (state mismatch, missing code, OAuth provider error):
 *      surface a translation-keyed error and link back to /auth/sign-in.
 *
 * Pure browser navigation — the only HTTP traffic is the BE redirect
 * which is handled by the browser, not Angular HttpClient.
 */
@Component({
  selector: 'app-social-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule, TranslocoModule],
  template: `
    <section
      class="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-4 text-center"
      data-testid="social-callback"
    >
      @if (errorKey()) {
        <h1 class="text-xl font-semibold text-red-700" data-testid="social-callback-error">
          {{ errorKey() | transloco }}
        </h1>
        <a
          mat-stroked-button
          routerLink="/auth/sign-in"
          data-testid="social-callback-back"
          class="mt-3"
        >
          {{ 'auth.social_callback.back_to_sign_in' | transloco }}
        </a>
      } @else {
        <mat-spinner diameter="40"></mat-spinner>
        <p class="text-slate2">{{ 'auth.social_callback.processing' | transloco }}</p>
      }
    </section>
  `,
})
export class SocialCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly config = inject(SocialPlatformConfigService);
  private readonly location = inject(LocationRedirectService);
  private readonly destroyRef = inject(DestroyRef);

  readonly errorKey = signal<string | null>(null);

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, query]) => {
        const platform = params.get('platform');
        const code = query.get('code');
        const state = query.get('state');
        const oauthError = query.get('error');

        if (!platform) {
          this.errorKey.set('auth.social_callback.errors.unsupported_platform');
          return;
        }

        if (oauthError) {
          this.config.clearOAuthState();
          this.errorKey.set(
            oauthError === 'access_denied'
              ? 'auth.social_callback.errors.cancelled'
              : 'auth.social_callback.errors.provider_failed',
          );
          return;
        }

        if (!code) {
          this.config.clearOAuthState();
          this.errorKey.set('auth.social_callback.errors.no_code');
          return;
        }

        if (!state || !this.config.validateOAuthState(state)) {
          this.config.clearOAuthState();
          this.errorKey.set('auth.social_callback.errors.csrf_failed');
          return;
        }

        const url = `/api/auth/social/callback/${platform}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        this.location.replace(url);
      });
  }
}
