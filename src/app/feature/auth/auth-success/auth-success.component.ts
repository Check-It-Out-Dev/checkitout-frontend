import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { switchMap } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SessionStateService } from '../../../core/auth/session-state.service';

/**
 * `/auth/success` — landing page after BE finishes the OAuth callback.
 *
 * BE has set `oauth_token` + `oauth_sig` HttpOnly cookies (the bridge
 * between OAuth and our session). FE calls `/auth/exchange-token` which
 * reads those cookies and mints `session` + `session_sig` cookies, then
 * probes `/users/me` to seed the SessionState cache, then routes the
 * user into the app.
 *
 * On error: shows a translation-keyed message + link to /auth/sign-in.
 * The OAuth flow is one-shot — failures here mean the user has to
 * restart from sign-in.
 */
@Component({
  selector: 'app-auth-success',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule, TranslocoModule],
  template: `
    <section
      class="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-4 text-center"
      data-testid="auth-success"
    >
      @if (errorKey()) {
        <h1 class="text-xl font-semibold text-red-700" data-testid="auth-success-error">
          {{ errorKey() | transloco }}
        </h1>
        <a
          mat-stroked-button
          routerLink="/auth/sign-in"
          data-testid="auth-success-back"
          class="mt-3"
        >
          {{ 'auth.success.back_to_sign_in' | transloco }}
        </a>
      } @else {
        <mat-spinner diameter="40"></mat-spinner>
        <p class="text-slate2">{{ 'auth.success.completing' | transloco }}</p>
      }
    </section>
  `,
})
export class AuthSuccessComponent implements OnInit {
  private readonly auth = inject(AuthApiService);
  private readonly session = inject(SessionStateService);
  private readonly router = inject(Router);

  readonly errorKey = signal<string | null>(null);

  ngOnInit(): void {
    this.auth
      .exchangeTokenForSession()
      .pipe(switchMap(() => this.session.probe()))
      .subscribe({
        next: (user) => {
          if (!user) {
            this.errorKey.set('auth.success.errors.exchange_failed');
            return;
          }
          // Default landing — same as legacy: /collaborations/list. The
          // shell will surface profile-completion banners if needed.
          void this.router.navigate(['/']);
        },
        error: () => {
          this.errorKey.set('auth.success.errors.exchange_failed');
        },
      });
  }
}
