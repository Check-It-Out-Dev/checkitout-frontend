import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
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
  imports: [RouterLink, TranslocoModule],
  template: `
    <section
      class="flex min-h-[60vh] w-full items-start justify-center p-4"
      data-testid="action-router"
    >
      @if (showError()) {
        <div class="max-w-md">
          <h1 class="text-2xl font-semibold tracking-tight" data-testid="action-router-error-title">
            {{ 'auth.action.unknown_mode_title' | transloco }}
          </h1>
          <p class="mt-3 text-sm text-slate-700">
            {{ 'auth.action.unknown_mode_message' | transloco }}
          </p>
          <a
            class="mt-6 inline-block text-sm text-blue-600 hover:underline"
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
