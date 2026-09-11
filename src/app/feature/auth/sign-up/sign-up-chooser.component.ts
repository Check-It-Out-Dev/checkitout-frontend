import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

/**
 * Role chooser at `/auth/sign-up`. Two big cards: Influencer (creators) +
 * Business (brands). Picking either routes to the role-specific flow.
 *
 * The two flows diverge in what BE needs to verify the account:
 * - Influencer: Instagram OAuth + follower-count check (Stage 2 slice)
 * - Business: NIP + GUS lookup → /company/setup (Stage 2 slice B5)
 *
 * Phase 3 Stage 1 (B4) only ports the basic email+password registration.
 */
@Component({
  selector: 'app-sign-up-chooser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, TranslocoModule],
  template: `
    <section class="flex w-full items-start justify-center px-4">
      <div class="flex w-full max-w-md flex-col gap-6">
        <a routerLink="/" class="mb-2 inline-block" aria-label="Check It Out home">
          <img src="assets/brand/c-mark.svg" class="h-10 w-10" alt="" />
        </a>
        <h1 class="text-left font-display text-5xl font-normal text-ink">
          {{ 'auth.sign_up.title' | transloco }}
        </h1>
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-slate2">
          {{ 'auth.sign_up.or_sign_up_as' | transloco }}
        </p>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <a
            routerLink="/auth/sign-up/influencer"
            data-testid="sign-up-as-influencer"
            class="group flex flex-col items-start gap-3 rounded-2xl border border-beige bg-white p-6 transition hover:-translate-y-px hover:border-coral-500 hover:shadow-md"
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-xl bg-coral-50 transition group-hover:bg-coral-100"
            >
              <mat-icon class="!h-7 !w-7 !text-3xl text-coral-500">photo_camera</mat-icon>
            </span>
            <h3 class="font-display text-2xl text-ink">
              {{ 'auth.sign_up.sign_up_influencer' | transloco }}
            </h3>
            <p class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-slate2">
              {{ 'landing.hero.cta.secondary2' | transloco }}
            </p>
          </a>
          <a
            routerLink="/auth/sign-up/business"
            data-testid="sign-up-as-business"
            class="group flex flex-col items-start gap-3 rounded-2xl border border-beige bg-white p-6 transition hover:-translate-y-px hover:border-coral-500 hover:shadow-md"
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 transition group-hover:bg-navy-100"
            >
              <mat-icon class="!h-7 !w-7 !text-3xl text-navy-500">business_center</mat-icon>
            </span>
            <h3 class="font-display text-2xl text-ink">
              {{ 'auth.sign_up.sign_up_business' | transloco }}
            </h3>
            <p class="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-slate2">
              {{ 'landing.hero.cta.primary' | transloco }}
            </p>
          </a>
        </div>

        <p class="text-sm text-slate2">
          {{ 'auth.sign_up.already_have_account' | transloco }}
          <a
            routerLink="/auth/sign-in"
            class="font-medium text-coral-600 underline"
            data-testid="sign-up-chooser-sign-in"
          >
            {{ 'auth.sign_in.submit' | transloco }}
          </a>
        </p>
      </div>
    </section>
  `,
})
export class SignUpChooserComponent {}
