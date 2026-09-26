import { CommonModule, isPlatformBrowser } from '@angular/common';
import { LocalizedDatePipe } from '../../core/i18n/localized-date.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { groupedDecimal } from '../../core/i18n/number-format';
import { isDemoMode } from '../../core/demo/demo-mode';
import { PublicConfigApiService } from '../../core/config/public-config.service';
import { firstValueFrom, forkJoin } from 'rxjs';
import type { InvoiceRecordDtoOut } from '../../core/api-frozen/hidden-models';
import type { SubscriptionStatusDtoOut } from '../../core/api-frozen/hidden-models';
import { SubscriptionStatus } from '../../core/api-frozen/hidden-models';
import {
  DowngradeRequestDtoInTargetPlanEnum,
  SubscriptionApiService,
  SubscriptionWriteApi,
  UpgradeRequestDtoInTargetPlanEnum,
} from '../../core/subscription/subscription.service';
import {
  DowngradeConfirmDialogComponent,
  type DowngradeConfirmDialogData,
  type DowngradeConfirmResult,
} from './downgrade-confirm-dialog.component';
import {
  TrialConsentDialogComponent,
  type TrialConsentDialogData,
  type TrialConsentResult,
} from './trial-consent-dialog.component';
import {
  UpgradeConfirmDialogComponent,
  type UpgradeConfirmDialogData,
  type UpgradeConfirmResult,
} from './upgrade-confirm-dialog.component';

type LoadState = 'loading' | 'loaded' | 'error' | 'not-applicable';
type TrialState = 'idle' | 'activating' | 'activated' | 'error';
type CancelDowngradeState = 'idle' | 'cancelling' | 'error';
type PortalState = 'idle' | 'opening' | 'error';

/**
 * Read-only billing page at `/user/settings/plan-billing` (Stage 3 / D1).
 *
 * Shows three sections:
 *  - status card: current plan, price, billing period, usage counter, status badge
 *  - pending-downgrade banner (if `targetPlanName` set)
 *  - trial-eligible CTA (D2 wires the action)
 *  - invoice list
 *
 * Stage 3 follow-ups (D2-D7) layer write actions (trial activation, upgrade,
 * downgrade, cancel-downgrade, Stripe Portal, consent) on top of this view.
 */
@Component({
  selector: 'app-plan-billing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LocalizedDatePipe,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './plan-billing.component.html',
})
export class PlanBillingComponent implements OnInit {
  private readonly api = inject(SubscriptionApiService);
  private readonly writeApi = inject(SubscriptionWriteApi);
  private readonly dialog = inject(MatDialog);
  private readonly publicConfig = inject(PublicConfigApiService);

  /**
   * Whether paid subscription actions (upgrade / trial / downgrade / portal)
   * are available. `false` on a free-only deploy where SubscriptionPaidController
   * is not registered — the paid CTAs are hidden so a click never 404s. Fails
   * safe to `true` (see PublicConfigApiService).
   */
  readonly paymentsEnabled = toSignal(this.publicConfig.paymentsEnabled(), {
    initialValue: true,
  });

  /**
   * Plan menu used by the upgrade buttons. Display copy stays in the
   * template; this just maps the BE enum to a price hint.
   */
  readonly UPGRADE_PLANS: ReadonlyArray<{
    readonly target: UpgradeRequestDtoInTargetPlanEnum;
    readonly price: number;
  }> = [
    // Prices mirror the BE subscription_plan seed (22-03-2026-subscription-tables.sql:
    // BUSINESS 29 PLN, ENTERPRISE 99 PLN) and the landing tiers (0/29/99). There is
    // no BE plans-list endpoint to source these live; the current plan's price does
    // come live from /status (s.currentPlanPrice). Keep in sync with that seed.
    { target: UpgradeRequestDtoInTargetPlanEnum.BUSINESS, price: 29 },
    { target: UpgradeRequestDtoInTargetPlanEnum.ENTERPRISE, price: 99 },
  ];

  /** "29 PLN / miesiąc" — the month word used to be hard-coded English ("/ mo"). */
  /** Invoice kinds are free-form strings on the BE (`STANDARD` by default);
   * known ones get a label, unknown ones show as sent rather than as a key. */
  invoiceTypeLabel(type: string): string {
    const key = `plan_billing.invoices.type.${type}`;
    const label = this.transloco.translate(key);
    return label === key ? type : label;
  }

  priceLabel(price: number): string {
    return this.transloco.translate('plan_billing.price_per_month', { price });
  }

  readonly state = signal<LoadState>('loading');
  readonly status = signal<SubscriptionStatusDtoOut | null>(null);
  readonly invoices = signal<InvoiceRecordDtoOut[]>([]);
  readonly trialState = signal<TrialState>('idle');
  readonly trialErrorKey = signal<string | null>(null);
  readonly upgrading = signal<UpgradeRequestDtoInTargetPlanEnum | null>(null);
  readonly downgrading = signal<DowngradeRequestDtoInTargetPlanEnum | null>(null);
  readonly cancelDowngradeState = signal<CancelDowngradeState>('idle');
  readonly cancelDowngradeErrorKey = signal<string | null>(null);
  readonly portalState = signal<PortalState>('idle');
  readonly portalErrorKey = signal<string | null>(null);
  /** Neutral notice next to the portal button (demo build only). */
  readonly portalNoticeKey = signal<string | null>(null);
  readonly cancellingTrial = signal(false);

  /**
   * Downgrade targets visible to the user, derived from the current plan:
   *   ENTERPRISE_ACTIVE → BUSINESS or FREE
   *   BUSINESS_ACTIVE → FREE
   *   anything else → no downgrade options
   */
  readonly availableDowngrades = computed<readonly DowngradeRequestDtoInTargetPlanEnum[]>(() => {
    const s = this.status();
    if (!s) return [];
    if (s.targetPlanName) return []; // already a downgrade pending
    if (s.status === SubscriptionStatus.ENTERPRISE_ACTIVE) {
      return [
        DowngradeRequestDtoInTargetPlanEnum.BUSINESS,
        DowngradeRequestDtoInTargetPlanEnum.FREE,
      ];
    }
    if (s.status === SubscriptionStatus.BUSINESS_ACTIVE) {
      return [DowngradeRequestDtoInTargetPlanEnum.FREE];
    }
    return [];
  });

  /**
   * The upgrade buttons with the current plan marked: a Business subscriber
   * was offered "Wybierz plan BUSINESS" as if it were an upgrade. The plan
   * is known only from the status enum (no plans endpoint); Enterprise
   * subscribers never see the section at all.
   */
  readonly upgradeOptions = computed(() => {
    const current = this.status()?.status;
    return this.UPGRADE_PLANS.map((plan) => ({
      ...plan,
      isCurrent:
        current === SubscriptionStatus.BUSINESS_ACTIVE &&
        plan.target === UpgradeRequestDtoInTargetPlanEnum.BUSINESS,
    }));
  });

  readonly statusBadgeClass = computed(() => statusBadgeClass(this.status()?.status));
  readonly statusBadgeKey = computed(() => statusBadgeKey(this.status()?.status));
  readonly usagePercent = computed(() => {
    const s = this.status();
    if (!s?.campaignLimit || s.campaignLimit <= 0) return 0;
    const used = s.campaignsUsedThisPeriod ?? 0;
    return Math.min(100, Math.round((used / s.campaignLimit) * 100));
  });
  readonly canActivateTrial = computed(() => {
    const s = this.status();
    return Boolean(s?.trialEligible && !s?.trialUsed && this.trialState() !== 'activating');
  });
  readonly canCancelTrial = computed(
    () => this.status()?.status === SubscriptionStatus.TRIAL_ENTERPRISE,
  );

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  /** PLN price with a locale-correct decimal separator — "0,00" on PL. */
  formatPrice(n: number): string {
    return groupedDecimal(this.transloco.getActiveLang(), n);
  }

  ngOnInit(): void {
    this.load();
    // bfcache (audit P2): coming back from the Stripe customer portal via
    // the browser's Back button restores this page from the back/forward
    // cache WITHOUT re-running ngOnInit — the plan/status on screen would
    // be whatever it was before the user changed it in the portal. A
    // `pageshow` with `persisted` marks exactly that restore; reload.
    if (isPlatformBrowser(this.platformId)) {
      const onPageShow = (e: PageTransitionEvent) => {
        if (e.persisted) this.load();
      };
      window.addEventListener('pageshow', onPageShow);
      this.destroyRef.onDestroy(() => window.removeEventListener('pageshow', onPageShow));
    }
  }

  load(): void {
    this.state.set('loading');
    forkJoin({
      status: this.api.getStatus(),
      invoices: this.api.getInvoices(),
    }).subscribe({
      next: ({ status, invoices }) => {
        this.status.set(status);
        this.invoices.set(invoices ?? []);
        this.state.set('loaded');
      },
      error: (err: unknown) => {
        // BE returns 403/404 on getStatus when the account type can't subscribe (INFLUENCER).
        const status = (err as { status?: number })?.status;
        this.state.set(status === 403 || status === 404 ? 'not-applicable' : 'error');
      },
    });
  }

  /**
   * Trial activation is consent-gated (iter-50, audit P0 #3): the dialog
   * records `POST /subscription/consent` with the GDPR proof bundle and only
   * closes accepted after it succeeds; the trial POST fires afterwards —
   * mirroring legacy's SubscriptionConsentDialog-first ordering, which the
   * BE does not enforce server-side.
   */
  async activateTrial(): Promise<void> {
    if (!this.canActivateTrial()) return;

    const data: TrialConsentDialogData = {
      documentName: 'Subscription Activation Consent',
      documentLabel: this.transloco.translate('plan_billing.documents.activation_consent'),
      documentHash: '',
    };
    const ref = this.dialog.open<
      TrialConsentDialogComponent,
      TrialConsentDialogData,
      TrialConsentResult
    >(TrialConsentDialogComponent, {
      data,
      width: '480px',
      disableClose: true,
      autoFocus: 'first-tabbable',
    });

    const result = await firstValueFrom(ref.afterClosed());
    if (!result?.accepted) return;

    this.trialState.set('activating');
    this.trialErrorKey.set(null);

    this.writeApi.activateTrial().subscribe({
      next: () => {
        this.trialState.set('activated');
        // Reload status so the badge + plan name flip to TRIAL_ENTERPRISE.
        // Don't await — UI shows the success state until status() updates.
        this.api.getStatus().subscribe({
          next: (status) => this.status.set(status),
          error: () => undefined,
        });
      },
      error: (err: unknown) => {
        this.trialState.set('error');
        this.trialErrorKey.set(this.classifyTrialError(err));
      },
    });
  }

  private classifyTrialError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 409) return 'plan_billing.trial.errors.already_used';
      if (err.status === 429) return 'plan_billing.trial.errors.rate_limited';
    }
    return 'plan_billing.trial.errors.failed';
  }

  /**
   * Opens the consent + upgrade dialog. On success the user is redirected
   * to Stripe Checkout via `window.location.href`. The redirect itself is
   * factored into a protected method so tests can override it without
   * fighting jsdom's read-only `window.location`.
   */
  async startUpgrade(target: UpgradeRequestDtoInTargetPlanEnum): Promise<void> {
    if (this.upgrading()) return;
    this.upgrading.set(target);

    const data: UpgradeConfirmDialogData = {
      targetPlan: target,
      priceDisplay: this.priceLabel(
        this.UPGRADE_PLANS.find((p) => p.target === target)?.price ?? 0,
      ),
      documentName: 'Subscription Terms v1',
      documentLabel: this.transloco.translate('plan_billing.documents.terms'),
      documentHash: '',
    };
    const ref = this.dialog.open<
      UpgradeConfirmDialogComponent,
      UpgradeConfirmDialogData,
      UpgradeConfirmResult
    >(UpgradeConfirmDialogComponent, { data, width: '480px', autoFocus: 'first-tabbable' });

    try {
      const result = await firstValueFrom(ref.afterClosed());
      if (result?.sessionUrl) {
        this.redirectTo(result.sessionUrl);
      }
    } finally {
      this.upgrading.set(null);
    }
  }

  /**
   * Redirect side-effect — overridable in tests. Replaces the current page
   * so the back button doesn't return to the consent dialog state.
   */
  protected redirectTo(url: string): void {
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  async startDowngrade(target: DowngradeRequestDtoInTargetPlanEnum): Promise<void> {
    if (this.downgrading()) return;
    this.downgrading.set(target);

    const data: DowngradeConfirmDialogData = {
      targetPlan: target,
      currentPlanName: this.status()?.currentPlanName ?? '',
      billingPeriodEnd: this.status()?.billingPeriodEnd,
    };
    const ref = this.dialog.open<
      DowngradeConfirmDialogComponent,
      DowngradeConfirmDialogData,
      DowngradeConfirmResult
    >(DowngradeConfirmDialogComponent, { data, width: '480px', autoFocus: 'first-tabbable' });

    try {
      const result = await firstValueFrom(ref.afterClosed());
      if (result === 'confirmed') {
        // Refresh status so the pending-downgrade banner appears.
        this.api.getStatus().subscribe({
          next: (status) => this.status.set(status),
          error: () => undefined,
        });
      }
    } finally {
      this.downgrading.set(null);
    }
  }

  /**
   * Cancels an active Enterprise trial (TRIAL_ENTERPRISE → FREE). The BE
   * `requestDowngrade(FREE)` short-circuits to an immediate trial cancellation
   * (no Stripe, drops to Free now) — see SubscriptionService.requestDowngrade.
   * Reuses DowngradeConfirmDialog with `isTrialCancel` for the trial-specific
   * copy; the dialog itself issues the write.
   */
  async cancelTrial(): Promise<void> {
    if (this.cancellingTrial()) return;
    this.cancellingTrial.set(true);

    const data: DowngradeConfirmDialogData = {
      targetPlan: DowngradeRequestDtoInTargetPlanEnum.FREE,
      currentPlanName: this.status()?.currentPlanName ?? '',
      isTrialCancel: true,
    };
    const ref = this.dialog.open<
      DowngradeConfirmDialogComponent,
      DowngradeConfirmDialogData,
      DowngradeConfirmResult
    >(DowngradeConfirmDialogComponent, { data, width: '480px', autoFocus: 'first-tabbable' });

    try {
      const result = await firstValueFrom(ref.afterClosed());
      if (result === 'confirmed') {
        // Reload so the badge + plan flip from TRIAL_ENTERPRISE to FREE_ACTIVE.
        this.load();
      }
    } finally {
      this.cancellingTrial.set(false);
    }
  }

  cancelPendingDowngrade(): void {
    if (this.cancelDowngradeState() === 'cancelling') return;
    this.cancelDowngradeState.set('cancelling');
    this.cancelDowngradeErrorKey.set(null);

    this.writeApi.cancelDowngrade().subscribe({
      next: () => {
        this.cancelDowngradeState.set('idle');
        // Refresh status so the pending-downgrade banner disappears.
        this.api.getStatus().subscribe({
          next: (status) => this.status.set(status),
          error: () => undefined,
        });
      },
      error: (err: unknown) => {
        this.cancelDowngradeState.set('error');
        this.cancelDowngradeErrorKey.set(this.classifyCancelError(err));
      },
    });
  }

  private classifyCancelError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 409) return 'plan_billing.cancel_downgrade.errors.no_pending';
      if (err.status === 429) return 'plan_billing.cancel_downgrade.errors.rate_limited';
    }
    return 'plan_billing.cancel_downgrade.errors.failed';
  }

  /**
   * Opens the Stripe Customer Portal — payment-method updates, invoice
   * downloads, plan management. Only meaningful when the user already has
   * a Stripe customer (status.hasStripeSubscription === true). Reuses the
   * same `redirectTo` helper as the upgrade flow so jsdom stays happy
   * during tests.
   */
  openCustomerPortal(): void {
    if (this.portalState() === 'opening') return;
    // The demo has no Stripe customer: the portal button used to redirect
    // to the same page, i.e. do nothing visible. Say so instead.
    if (isDemoMode()) {
      this.portalNoticeKey.set('plan_billing.portal.demo_unavailable');
      return;
    }
    this.portalState.set('opening');
    this.portalErrorKey.set(null);

    this.writeApi.createPortalSession().subscribe({
      next: (res) => {
        const url = res?.['url'];
        if (!url) {
          this.portalState.set('error');
          this.portalErrorKey.set('plan_billing.portal.errors.no_url');
          return;
        }
        this.redirectTo(url);
        // Keep state at 'opening' so the spinner stays visible during the
        // browser-level navigation; if redirect fails the user reloads.
      },
      error: (err: unknown) => {
        this.portalState.set('error');
        this.portalErrorKey.set(this.classifyPortalError(err));
      },
    });
  }

  private classifyPortalError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 409) return 'plan_billing.portal.errors.no_customer';
      if (err.status === 429) return 'plan_billing.portal.errors.rate_limited';
    }
    return 'plan_billing.portal.errors.failed';
  }
}

function statusBadgeClass(status?: SubscriptionStatus | string): string {
  switch (status) {
    case SubscriptionStatus.FREE_ACTIVE:
      return 'bg-slate-100 text-slate-700';
    case SubscriptionStatus.TRIAL_ENTERPRISE:
      return 'bg-amber-100 text-amber-800';
    case SubscriptionStatus.BUSINESS_ACTIVE:
    case SubscriptionStatus.ENTERPRISE_ACTIVE:
      return 'bg-emerald-100 text-emerald-800';
    case SubscriptionStatus.DOWNGRADE_PENDING:
      return 'bg-blue-100 text-blue-800';
    case SubscriptionStatus.PAYMENT_FAILED:
    case SubscriptionStatus.TERMS_PENDING:
    case SubscriptionStatus.SUSPENDED_LEGAL:
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function statusBadgeKey(status?: SubscriptionStatus | string): string {
  if (!status) return 'plan_billing.status.unknown';
  return `plan_billing.status.${String(status).toLowerCase()}`;
}
