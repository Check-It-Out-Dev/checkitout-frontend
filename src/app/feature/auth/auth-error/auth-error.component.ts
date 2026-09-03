import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

/**
 * Email-action / auth failure landing at `/auth/error` (legacy
 * auth-error.component parity). `?error=consent_required` renders the
 * consent-specific explanation and routes to sign-up; anything else renders
 * the generic failure and routes to sign-in. Auto-redirects after 5s (the
 * countdown is intentionally not rendered as a ticking number — visual
 * baselines stay byte-stable; the behavior is identical).
 */
@Component({
  selector: 'app-auth-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    <section class="flex min-h-[60vh] items-center justify-center p-4" data-testid="auth-error">
      <div class="w-full max-w-md rounded-2xl border border-beige bg-cream p-8 text-center">
        <span
          class="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100"
        >
          <mat-icon class="!h-8 !w-8 !text-3xl !text-amber-700">
            {{ isConsentRequired() ? 'gpp_maybe' : 'error_outline' }}
          </mat-icon>
        </span>
        <h1 class="font-display text-3xl text-ink" data-testid="auth-error-title">
          {{
            (isConsentRequired() ? 'auth_error.consent_title' : 'auth_error.generic_title')
              | transloco
          }}
        </h1>
        <p class="mt-3 text-slate2" data-testid="auth-error-message">
          {{
            (isConsentRequired() ? 'auth_error.consent_message' : 'auth_error.generic_message')
              | transloco
          }}
        </p>
        <p class="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
          {{ 'auth_error.redirecting' | transloco }}
        </p>
        <a
          mat-flat-button
          class="mt-6 w-full"
          color="primary"
          [routerLink]="isConsentRequired() ? '/auth/sign-up' : '/auth/sign-in'"
          data-testid="auth-error-cta"
        >
          {{
            (isConsentRequired() ? 'auth_error.cta_signup' : 'auth_error.cta_signin') | transloco
          }}
        </a>
      </div>
    </section>
  `,
})
export class AuthErrorComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly isConsentRequired = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const error = this.route.snapshot.queryParamMap.get('error');
    this.isConsentRequired.set(error === 'consent_required');
    // Browser-only: an unguarded setTimeout keeps ApplicationRef unstable and delays the
    // SSR render by up to 5s (same class as the notification-poll SSR fix).
    if (this.isBrowser) {
      this.timer = setTimeout(() => {
        void this.router.navigate([this.isConsentRequired() ? '/auth/sign-up' : '/auth/sign-in']);
      }, 5000);
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
