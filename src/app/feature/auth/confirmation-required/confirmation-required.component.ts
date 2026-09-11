import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

/**
 * `/auth/confirmation-required` — static "check your email" landing
 * shown after a sign-up that triggered a verification email.
 *
 * Mirrors legacy `AuthConfirmationRequiredComponent` 1:1 — pure copy,
 * no behavior. Reachable via `noAuthGuard` so a logged-in user gets
 * bounced into the app shell instead.
 */
@Component({
  selector: 'app-confirmation-required',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoModule],
  template: `
    <section
      class="flex min-h-[60vh] w-full items-start justify-center px-4"
      data-testid="confirmation-required"
    >
      <div class="max-w-md">
        <span
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-coral-50 text-coral-500"
        >
          <span class="font-display text-3xl italic">✉</span>
        </span>
        <h1
          class="mt-4 font-display text-4xl font-normal text-ink"
          data-testid="confirmation-required-title"
        >
          {{ 'auth.confirmation_required.title' | transloco }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-slate2">
          {{ 'auth.confirmation_required.message' | transloco }}
        </p>
        <div
          class="mt-5 rounded-2xl border border-beige bg-cream p-4 text-sm text-ink"
          data-testid="confirmation-required-info"
        >
          {{ 'auth.confirmation_required.after_confirmation' | transloco }}
        </div>
        <p class="mt-6 text-sm text-slate2">
          <span>{{ 'auth.confirmation_required.return_to' | transloco }}</span>
          <a
            class="ml-1 font-medium text-coral-600 underline"
            routerLink="/auth/sign-in"
            data-testid="confirmation-required-sign-in"
          >
            {{ 'auth.confirmation_required.sign_in_link' | transloco }}
          </a>
        </p>
      </div>
    </section>
  `,
})
export class ConfirmationRequiredComponent {}
