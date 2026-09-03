import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { ShellStatusService } from '../../core/shell/shell-status.service';
import { RateLimitStateService } from '../../core/rate-limit/rate-limit-state.service';
import { SessionStateService } from '../../core/auth/session-state.service';
import { ReconsentDialogComponent } from '../legal/reconsent-dialog.component';

/**
 * Shell-level top-rail banners stacked above the router-outlet. Renders
 * when the user has outstanding obligations that gate full platform usage:
 *
 * - **Profile incomplete** (red) — derived from `/api/users/me` on shell
 *   mount; lists the missing fields and links to the profile-edit page.
 * - **Terms updated** (amber) — set when any API response carries
 *   `X-Consent-Required: 1`; links to the legal-acceptance flow.
 * - **Email unverified** (yellow) — set when any API response carries
 *   `X-Email-Verification-Required: 1`; links to the resend-verification
 *   action.
 *
 * Mirrors the legacy banners exactly (caught by Stage 5a fork as P1
 * regression #133). Banner copy + actions still need to align with the
 * legal-acceptance and email-verification slices when they ship; for now
 * the CTAs deep-link to the closest existing routes.
 */
@Component({
  selector: 'app-shell-banners',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatDialogModule, MatIconModule, TranslocoModule],
  template: `
    @if (status.blockedForTerms()) {
      <div
        role="alert"
        data-testid="shell-banner-blocked-terms"
        class="flex items-start gap-3 border-b border-red-300 bg-red-100 px-4 py-3 text-sm text-red-900"
      >
        <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-red-700">block</mat-icon>
        <div class="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <p class="flex-1">
            <strong>{{ 'shell.banners.blocked_terms.title' | transloco }}</strong>
            <span class="ml-1">
              {{ 'shell.banners.blocked_terms.body' | transloco }}
              @if (status.blockedDaysRemaining() !== null) {
                <span class="font-medium">
                  {{
                    'shell.banners.blocked_terms.days'
                      | transloco: { days: status.blockedDaysRemaining() }
                  }}
                </span>
              }
            </span>
          </p>
          <button
            mat-flat-button
            color="warn"
            type="button"
            (click)="openReconsent()"
            data-testid="shell-banner-blocked-cta"
          >
            {{ 'shell.banners.blocked_terms.cta' | transloco }}
          </button>
        </div>
      </div>
    }
    @if (status.profileMissingFields(); as missing) {
      @if (missing.length > 0) {
        <div
          role="alert"
          data-testid="shell-banner-profile-incomplete"
          class="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-red-700">error</mat-icon>
          <div class="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <p class="flex-1">
              <strong>{{ 'shell.banners.profile_incomplete.title' | transloco }}</strong>
              <span class="ml-1 text-red-800">
                {{
                  'shell.banners.profile_incomplete.body'
                    | transloco: { fields: fieldLabels(missing) }
                }}
              </span>
            </p>
            <a
              mat-stroked-button
              routerLink="/user/settings/account"
              data-testid="shell-banner-profile-cta"
            >
              {{ 'shell.banners.profile_incomplete.cta' | transloco }}
            </a>
          </div>
        </div>
      }
    }
    @if (status.consentRequired()) {
      <div
        role="alert"
        data-testid="shell-banner-consent-required"
        class="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-amber-700">gavel</mat-icon>
        <div class="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <p class="flex-1">
            <strong>{{ 'shell.banners.consent.title' | transloco }}</strong>
            <span class="ml-1">{{ 'shell.banners.consent.body' | transloco }}</span>
            @if (status.consentDaysRemaining() !== null) {
              <span class="ml-1 font-medium">
                {{
                  'shell.banners.consent.days' | transloco: { days: status.consentDaysRemaining() }
                }}
              </span>
            }
          </p>
          <button
            mat-stroked-button
            type="button"
            (click)="openReconsent()"
            data-testid="shell-banner-consent-cta"
          >
            {{ 'shell.banners.consent.cta' | transloco }}
          </button>
        </div>
      </div>
    }
    @if (status.emailVerificationRequired()) {
      <div
        role="alert"
        data-testid="shell-banner-email-verification"
        class="flex items-start gap-3 border-b border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900"
      >
        <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-yellow-700">mark_email_unread</mat-icon>
        <div class="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <p class="flex-1">
            <strong>{{ 'shell.banners.email_verify.title' | transloco }}</strong>
            <span class="ml-1">{{ 'shell.banners.email_verify.body' | transloco }}</span>
          </p>
          <a
            mat-stroked-button
            routerLink="/auth/verify-email"
            data-testid="shell-banner-email-verify-cta"
          >
            {{ 'shell.banners.email_verify.cta' | transloco }}
          </a>
        </div>
      </div>
    }
    @if (status.trialOffer()) {
      <div
        role="status"
        data-testid="shell-banner-trial-offer"
        class="flex items-start gap-3 border-b border-navy-400/30 bg-navy-50 px-4 py-3 text-sm text-navy-900"
      >
        <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-navy-500">stars</mat-icon>
        <div class="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <p class="flex-1">
            <strong>{{ 'shell.banners.trial_offer.title' | transloco }}</strong>
            <span class="ml-1">{{ 'shell.banners.trial_offer.body' | transloco }}</span>
          </p>
          <a
            mat-stroked-button
            routerLink="/user/settings/plan-billing"
            data-testid="shell-banner-trial-offer-cta"
          >
            {{ 'shell.banners.trial_offer.cta' | transloco }}
          </a>
        </div>
        <button
          mat-icon-button
          type="button"
          (click)="status.dismissTrialOffer()"
          [attr.aria-label]="'shell.banners.trial_offer.dismiss' | transloco"
          data-testid="shell-banner-trial-offer-dismiss"
        >
          <mat-icon class="!h-5 !w-5 !text-xl text-navy-500">close</mat-icon>
        </button>
      </div>
    }
    @if (rateLimit.active()) {
      <div
        role="alert"
        data-testid="shell-banner-rate-limit"
        class="flex items-start gap-3 border-b border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900"
      >
        <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-orange-700">schedule</mat-icon>
        <div class="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <p class="flex-1">
            <strong>{{ 'shell.banners.rate_limit.title' | transloco }}</strong>
            <span class="ml-1">
              {{ 'shell.banners.rate_limit.body' | transloco }}
              @if (rateLimit.retryAfterSeconds(); as seconds) {
                <span class="ml-1 font-medium">
                  {{ 'shell.banners.rate_limit.retry' | transloco: { seconds: seconds } }}
                </span>
              }
            </span>
          </p>
        </div>
      </div>
    }
  `,
})
export class ShellBannersComponent {
  protected readonly status = inject(ShellStatusService);
  protected readonly rateLimit = inject(RateLimitStateService);
  private readonly dialog = inject(MatDialog);
  private readonly session = inject(SessionStateService);
  private readonly transloco = inject(TranslocoService);

  /** Human labels for the missing-field tokens (legacy prints "Primary
   *  Address", not raw keys); unknown tokens fall back to themselves. */
  fieldLabels(missing: readonly string[]): string {
    return missing
      .map((f) => {
        const key = `shell.banners.profile_incomplete.fieldNames.${f}`;
        const label = this.transloco.translate(key);
        return label === key ? f : label;
      })
      .join(', ');
  }

  /** Opens the reconsent dialog; on accept, re-probes the session so the
   *  refreshed accountStatus propagates (banner already cleared
   *  optimistically by the dialog via `clearConsent()`). */
  openReconsent(): void {
    this.dialog
      .open(ReconsentDialogComponent, { maxWidth: '95vw', autoFocus: false })
      .afterClosed()
      .subscribe((accepted) => {
        if (accepted) this.session.probe().subscribe();
      });
  }
}
