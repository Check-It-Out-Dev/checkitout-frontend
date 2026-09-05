import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

/**
 * `/auth/action` — entry point for Firebase email-action links.
 *
 * Firebase forwards verification + password-reset links to a single
 * URL (`?mode=verifyEmail|resetPassword&oobCode=…`) plus optional
 * `continueUrl`, `lang`, `ut` (user-type for influencer-vs-company
 * branching), `iac` (initial-access-code marker). We dispatch to the
 * right downstream component preserving every relevant query param.
 *
 * Ports legacy `ActionRouterComponent` 1:1 (22 LOC). The error path
 * shows a translation-keyed message so a stale or malformed link
 * isn't a silent 404.
 */
@Component({
  selector: 'app-action-router',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslocoModule],
  // Same card as /auth/error: the two "this link is no good" screens should
  // read as one family, not as a skinned page next to a bare one.
  template: `
    <section
      class="flex min-h-[60vh] w-full items-center justify-center p-4"
      data-testid="action-router"
    >
      @if (showError()) {
        <div class="w-full max-w-md rounded-2xl border border-beige bg-cream p-8 text-center">
          <span
            class="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100"
          >
            <mat-icon class="!h-8 !w-8 !text-3xl !text-amber-700">error_outline</mat-icon>
          </span>
          <h1 class="font-display text-3xl text-ink" data-testid="action-router-error-title">
            {{ 'auth.action.unknown_mode_title' | transloco }}
          </h1>
          <p class="mt-3 text-slate2">
            {{ 'auth.action.unknown_mode_message' | transloco }}
          </p>
          <a
            mat-flat-button
            class="mt-6 w-full"
            color="primary"
            routerLink="/auth/sign-in"
            data-testid="action-router-sign-in"
          >
            {{ 'auth.action.return_to_sign_in' | transloco }}
          </a>
        </div>
      }
    </section>
  `,
})
export class ActionRouterComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly showError = signal(false);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');

    if (mode === 'verifyEmail' && oobCode) {
      const queryParams: Record<string, string> = { oobCode };
      const passthrough = ['continueUrl', 'lang', 'ut', 'iac'] as const;
      for (const key of passthrough) {
        const value = params.get(key);
        if (value) queryParams[key] = value;
      }
      void this.router.navigate(['/auth/verify-email'], { queryParams, replaceUrl: true });
      return;
    }

    if (mode === 'resetPassword' && oobCode) {
      const queryParams: Record<string, string> = { oobCode };
      const lang = params.get('lang');
      if (lang) queryParams['lang'] = lang;
      void this.router.navigate(['/auth/reset-password'], { queryParams, replaceUrl: true });
      return;
    }

    this.showError.set(true);
  }
}
