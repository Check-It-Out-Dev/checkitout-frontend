import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { catchError, forkJoin, of } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityStatusHistoryDtoOut } from '../../api/model/applied-opportunity-status-history-dto-out';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import type { PaymentContactDto } from '../../api/model/payment-contact-dto';
import { RateStatus } from '../../api/model/rate-status';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

/**
 * Influencer-side application detail at
 * `/collaborations/registrations/:id`. Stage 4 / E4.
 *
 * Shows the parent campaign title + brief, the application's current status,
 * and a chronological status-history timeline pulled from the BE
 * `/applied-opportunity/{id}/status-history` endpoint. Content-submission
 * upload comes in a follow-up slice (E7) — this slice is read-only.
 *
 * The status badge palette mirrors `applied-opportunities-list.component.ts`
 * so the two views feel like the same surface.
 */
@Component({
    selector: 'app-applied-opportunity-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        DatePipe,
        RouterLink,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        TranslocoModule,
    ],
    templateUrl: './applied-opportunity-detail.component.html'
})
export class AppliedOpportunityDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AppliedOpportunityApiService);

  readonly state = signal<LoadState>('loading');
  readonly application = signal<AppliedOpportunityDtoOut | null>(null);
  readonly history = signal<AppliedOpportunityStatusHistoryDtoOut[]>([]);

  readonly currentStatus = computed(() => this.application()?.opportunityStatus?.value ?? null);
  readonly campaignTitle = computed(() => this.application()?.partnershipOpportunity?.title ?? '');
  readonly campaignId = computed(() => this.application()?.partnershipOpportunity?.id ?? null);
  readonly hasHistory = computed(() => this.history().length > 0);

  readonly companyRatingFromInfluencer = computed(
    () => this.application()?.rateStatus?.value ?? 'DEFAULT',
  );
  /** Influencer can rate the company once status reaches CONTENT_POSTED
   * (or any later terminal state). The BE drives the rating window so we
   * keep the gate loose: anything past CONTENT_POSTED qualifies. */
  readonly canRateCompany = computed(() => {
    const s = this.currentStatus();
    return (
      s === OpportunityStatus.CONTENT_POSTED ||
      s === OpportunityStatus.TO_BE_PAID ||
      s === OpportunityStatus.DONE
    );
  });
  readonly hasRatedCompany = computed(() => this.companyRatingFromInfluencer() !== 'DEFAULT');

  readonly ratingSubmitting = signal<boolean>(false);
  readonly ratingErrorKey = signal<string | null>(null);

  /**
   * Payment-contact reveal at `TO_BE_PAID` / `DONE` (iter-48 P0 #6 fix).
   *
   * BE returns the OTHER party's payment contact (name + email + optional
   * phone + optional avatar) only when the applied-opportunity is in a
   * payment-relevant state, and only to the two parties on the
   * applied-opportunity (others get 403/404). The FE asks eagerly after
   * load() and tolerates a 4xx silently — `paymentContact` stays null,
   * the template section stays hidden.
   *
   * Without this wire, payouts could not be coordinated through the
   * platform: influencer had no way to see the company's billing email,
   * company had no way to see the influencer's. PARITY-CHECKLIST G43
   * incorrectly claimed this was wired before iter-48.
   */
  readonly paymentContact = signal<PaymentContactDto | null>(null);
  readonly paymentContactLoading = signal<boolean>(false);
  readonly canShowPaymentContact = computed(() => {
    const s = this.currentStatus();
    return s === OpportunityStatus.TO_BE_PAID || s === OpportunityStatus.DONE;
  });

  /**
   * Influencer accept/decline of the company's offer (iter-49 P0 #5).
   *
   * When the company accepts an application the BE parks it at
   * ACCEPTED_BY_COMPANY and waits for the influencer's counter-signature:
   * PATCH /applied-opportunity/status/update/{id}?accept=true|false moves it
   * to ACCEPTED_BY_INFLUENCER or REJECTED_BY_INFLUENCER. Legacy renders this
   * as a two-step card flip ("Accept this offer?" → "This action cannot be
   * undone."), so we keep the same informed-consent shape: first click arms
   * the confirmation, second click commits.
   */
  readonly canDecide = computed(
    () => this.currentStatus() === OpportunityStatus.ACCEPTED_BY_COMPANY,
  );
  /**
   * Cancel-cooperation from the rejected-content state (iter-102, PARITY
   * row 157 residue): legacy's CONTENT_REJECTED card offered "cancel the
   * cooperation" alongside resubmit — same PATCH with accept=false, which
   * the BE maps from CONTENT_REJECTED to REJECTED_BY_INFLUENCER. Decline
   * only; resubmission lives on the content page.
   */
  readonly canCancelFromRejected = computed(
    () => this.currentStatus() === OpportunityStatus.CONTENT_REJECTED,
  );
  /**
   * Mark-as-posted, the influencer's CONTENT_APPROVED → CONTENT_POSTED step
   * (J4 residue). Once the company approves the draft the BE parks the
   * application at CONTENT_APPROVED and waits for the influencer to confirm
   * the content is live on Instagram. The BE lists CONTENT_APPROVED among its
   * INFLUENCER_DRIVABLE_STATES, so the same generic PATCH
   * /applied-opportunity/status/update/{id}?accept=true advances it to
   * CONTENT_POSTED (OpportunityStatus.getNextStatus) — no separate endpoint.
   * We reuse the accept/decline arm→confirm machinery with a 'posted' kind so
   * the informed-consent shape (irreversible second click) stays identical.
   */
  readonly canMarkPosted = computed(() => {
    const s = this.currentStatus();
    // Both CONTENT_APPROVED and CONTENT_POSTED_REJECTED advance to
    // CONTENT_POSTED via getNextStatus(accept=true) on the BE, and both are
    // INFLUENCER_DRIVABLE_STATES. The second is the company rejecting the
    // already-posted content — the influencer fixes it and re-confirms.
    return (
      s === OpportunityStatus.CONTENT_APPROVED || s === OpportunityStatus.CONTENT_POSTED_REJECTED
    );
  });
  /** Posted-rejected re-confirm reuses the same PATCH but needs a distinct,
   * rejection-aware prompt (the content was live and got flagged). */
  readonly postedFromRejected = computed(
    () => this.currentStatus() === OpportunityStatus.CONTENT_POSTED_REJECTED,
  );
  /** i18n base key for the mark-posted card — swaps the whole copy block
   * (title / prompt / cta / confirm) between the approved and posted-rejected
   * variants. */
  readonly postedKey = computed(() =>
    this.postedFromRejected()
      ? 'applied_opportunities.posted.rejected'
      : 'applied_opportunities.posted',
  );
  readonly pendingDecision = signal<'accept' | 'decline' | 'posted' | null>(null);
  readonly decisionSubmitting = signal<boolean>(false);
  readonly decisionErrorKey = signal<string | null>(null);

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!id || Number.isNaN(id)) {
      this.state.set('not-found');
      return;
    }
    this.load(id);
  }

  load(id: number): void {
    this.state.set('loading');
    // The application is the primary datum; the status history is a
    // secondary audit strip. A history failure must NOT blank the whole
    // page (a forkJoin would) — catch it to an empty list so the detail
    // still renders. (Parity sweep: BE status-history 500'd on a lazy
    // proxy; even once fixed, a flaky sub-call shouldn't nuke the view.)
    forkJoin({
      application: this.api.getById(id),
      history: this.api
        .getStatusHistory(id)
        .pipe(catchError(() => of([] as AppliedOpportunityStatusHistoryDtoOut[]))),
    }).subscribe({
      next: ({ application, history }) => {
        this.application.set(application);
        this.history.set(this.sortNewestFirst(history));
        this.state.set('loaded');
        // Iter-48 P0 #3 — payment-contact reveal only when status is
        // payment-relevant. The check mirrors `canShowPaymentContact`
        // but reads from the just-set application to avoid signal
        // timing ambiguity inside the subscribe callback.
        const s = application.opportunityStatus?.value;
        if (s === OpportunityStatus.TO_BE_PAID || s === OpportunityStatus.DONE) {
          this.loadPaymentContact(id);
        }
      },
      error: (err: { status?: number }) => {
        this.state.set(err?.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  private loadPaymentContact(id: number): void {
    this.paymentContactLoading.set(true);
    this.api.getPaymentContact(id).subscribe({
      next: (contact) => {
        this.paymentContact.set(contact);
        this.paymentContactLoading.set(false);
      },
      error: () => {
        // 403/404 mean the BE doesn't believe we're authorized to see
        // the contact yet (state racing with status-history, or session
        // got recycled mid-load). The template branch stays hidden.
        // Other errors also fall through to "no contact" — better than
        // surfacing a transient toast on a peripheral detail.
        this.paymentContact.set(null);
        this.paymentContactLoading.set(false);
      },
    });
  }

  armDecision(kind: 'accept' | 'decline' | 'posted'): void {
    if (this.decisionSubmitting()) return;
    this.decisionErrorKey.set(null);
    this.pendingDecision.set(kind);
  }

  cancelDecision(): void {
    if (this.decisionSubmitting()) return;
    this.pendingDecision.set(null);
  }

  confirmDecision(): void {
    const kind = this.pendingDecision();
    const id = this.application()?.id;
    if (!kind || id == null || this.decisionSubmitting()) return;
    this.decisionSubmitting.set(true);
    this.decisionErrorKey.set(null);
    // accept=true for both the offer-accept and the mark-as-posted advance;
    // only an explicit decline sends accept=false.
    this.api.updateOpportunityStatus(id, kind !== 'decline').subscribe({
      next: (updated) => {
        this.application.set(updated);
        this.pendingDecision.set(null);
        this.decisionSubmitting.set(false);
        this.refreshHistory(id);
      },
      error: (err: { status?: number }) => {
        this.decisionErrorKey.set(
          err?.status === 403
            ? 'applied_opportunities.decision.error.forbidden'
            : err?.status === 409
              ? 'applied_opportunities.decision.error.bad_state'
              : 'applied_opportunities.decision.error.failed',
        );
        this.decisionSubmitting.set(false);
      },
    });
  }

  /** The accepted/declined transition writes a status-history row on the BE;
   * re-pull the timeline so it reflects the decision without a full reload.
   * Failure keeps the stale list — the badge already updated from the PATCH
   * response. */
  private refreshHistory(id: number): void {
    this.api.getStatusHistory(id).subscribe({
      next: (history) => this.history.set(this.sortNewestFirst(history)),
      error: () => undefined,
    });
  }

  private sortNewestFirst(
    history: AppliedOpportunityStatusHistoryDtoOut[],
  ): AppliedOpportunityStatusHistoryDtoOut[] {
    return [...history].sort((a, b) => {
      const at = a.changedAt ? Date.parse(a.changedAt) : 0;
      const bt = b.changedAt ? Date.parse(b.changedAt) : 0;
      return bt - at;
    });
  }

  rateCompany(rating: 'POSITIVE' | 'NEGATIVE'): void {
    const id = this.application()?.id;
    if (id == null || this.ratingSubmitting()) return;
    this.ratingSubmitting.set(true);
    this.ratingErrorKey.set(null);
    const rate = rating === 'POSITIVE' ? RateStatus.POSITIVE : RateStatus.NEGATIVE;
    this.api.rateCompany(id, rate).subscribe({
      next: (updated) => {
        this.application.set(updated);
        this.ratingSubmitting.set(false);
      },
      error: (err: { status?: number }) => {
        this.ratingErrorKey.set(
          err?.status === 403
            ? 'applied_opportunities.rating.error.forbidden'
            : err?.status === 409
              ? 'applied_opportunities.rating.error.bad_state'
              : 'applied_opportunities.rating.error.failed',
        );
        this.ratingSubmitting.set(false);
      },
    });
  }

  statusBadgeClass(status?: string | null): string {
    switch (status) {
      case OpportunityStatus.APPLIED:
        return 'bg-slate-100 text-slate-700';
      case OpportunityStatus.ACCEPTED_BY_COMPANY:
      case OpportunityStatus.ACCEPTED_BY_INFLUENCER:
      case OpportunityStatus.CONTENT_APPROVED:
      case OpportunityStatus.CONTENT_POSTED:
        return 'bg-emerald-100 text-emerald-800';
      case OpportunityStatus.REJECTED_BY_COMPANY:
      case OpportunityStatus.REJECTED_BY_INFLUENCER:
      case OpportunityStatus.CONTENT_REJECTED:
      case OpportunityStatus.CONTENT_POSTED_REJECTED:
        return 'bg-red-100 text-red-800';
      case OpportunityStatus.CONTENT_SEND_TO_ACCEPT:
        return 'bg-blue-100 text-blue-800';
      case OpportunityStatus.TO_BE_PAID:
        return 'bg-amber-100 text-amber-800';
      case OpportunityStatus.DONE:
        return 'bg-slate-200 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }
}
