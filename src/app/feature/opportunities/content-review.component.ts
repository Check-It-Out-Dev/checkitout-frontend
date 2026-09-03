import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { forkJoin } from 'rxjs';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { RateStatus } from '../../api/model/rate-status';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { AppliedOpportunityContentApiService } from '../../core/applied-opportunities/applied-opportunity-content.service';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error' | 'not-found';

/**
 * Stage 4 / E7c — Company-side content review for an accepted
 * application at `/collaborations/applications/:id/review`.
 *
 * Lists every submitted content row for the given AppliedOpportunity
 * id. Each PENDING row gets Approve / Reject buttons; non-pending rows
 * just show their final status. Approving / rejecting calls the BE,
 * patches the row in place, and clears the per-row pending flag.
 *
 * Reachable from the campaign applicants list (E7a) — the row in that
 * list links here for any applicant whose status reached the
 * content-submission stage.
 */
@Component({
    selector: 'app-content-review',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        DatePipe,
        ReactiveFormsModule,
        RouterLink,
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        TranslocoModule,
    ],
    templateUrl: './content-review.component.html'
})
export class ContentReviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AppliedOpportunityContentApiService);
  private readonly appliedApi = inject(AppliedOpportunityApiService);

  readonly appliedOpportunityId = signal<number | null>(null);
  readonly state = signal<LoadState>('loading');
  readonly items = signal<AppliedOpportunityContentDtoOut[]>([]);
  readonly pendingDecisions = signal<ReadonlySet<number>>(new Set());
  readonly application = signal<AppliedOpportunityDtoOut | null>(null);
  readonly ratingSubmitting = signal<boolean>(false);
  readonly ratingErrorKey = signal<string | null>(null);

  readonly hasItems = computed(() => this.items().length > 0);
  readonly influencerRatingFromCompany = computed(
    () => this.application()?.companyRateStatus?.value ?? 'DEFAULT',
  );
  readonly canRateInfluencer = computed(() =>
    this.items().some((c) => c.approvalStatus === ('APPROVED' as never)),
  );
  readonly hasRatedInfluencer = computed(() => this.influencerRatingFromCompany() !== 'DEFAULT');

  /** True when the influencer has reported at least one engagement metric —
   *  the company sees them read-only (only the content owner may update). */
  hasMetrics(row: AppliedOpportunityContentDtoOut): boolean {
    return (
      row.likesCount != null ||
      row.commentsCount != null ||
      row.viewsCount != null ||
      row.sharesCount != null
    );
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!id || Number.isNaN(id)) {
      this.state.set('not-found');
      return;
    }
    this.appliedOpportunityId.set(id);
    this.load(id);
  }

  load(appliedOpportunityId: number): void {
    this.state.set('loading');
    forkJoin({
      content: this.api.listForAppliedOpportunity(appliedOpportunityId),
      application: this.appliedApi.getById(appliedOpportunityId),
    }).subscribe({
      next: ({ content, application }) => {
        this.items.set(content);
        this.application.set(application);
        this.state.set(content.length === 0 ? 'empty' : 'loaded');
      },
      error: () => this.state.set('error'),
    });
  }

  rateInfluencer(rating: 'POSITIVE' | 'NEGATIVE'): void {
    const id = this.appliedOpportunityId();
    if (id == null || this.ratingSubmitting()) return;
    this.ratingSubmitting.set(true);
    this.ratingErrorKey.set(null);
    const rate = rating === 'POSITIVE' ? RateStatus.POSITIVE : RateStatus.NEGATIVE;
    this.appliedApi.rateInfluencer(id, rate).subscribe({
      next: (updated) => {
        this.application.set(updated);
        this.ratingSubmitting.set(false);
      },
      error: (err: { status?: number }) => {
        this.ratingErrorKey.set(
          err?.status === 403
            ? 'applied_opportunities.rating_company.error.forbidden'
            : err?.status === 409
              ? 'applied_opportunities.rating_company.error.bad_state'
              : 'applied_opportunities.rating_company.error.failed',
        );
        this.ratingSubmitting.set(false);
      },
    });
  }

  approve(contentId: number): void {
    this.decide(contentId, true);
  }

  /**
   * Rejection is two-step (legacy card parity): the first click ARMS an
   * inline notes textarea on the row (max 500 chars, optional — the
   * influencer sees the note as the revision reason); Potwierdź sends,
   * Anuluj disarms. Arming a different row moves the form there and
   * clears the previous draft.
   */
  readonly rejectArmedId = signal<number | null>(null);
  readonly rejectNotes = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  armReject(contentId: number): void {
    this.rejectArmedId.set(contentId);
    this.rejectNotes.reset('');
  }

  cancelReject(): void {
    this.rejectArmedId.set(null);
    this.rejectNotes.reset('');
  }

  confirmReject(contentId: number): void {
    if (this.rejectNotes.invalid) return;
    this.decide(contentId, false, this.rejectNotes.value);
    this.rejectArmedId.set(null);
    this.rejectNotes.reset('');
  }

  private decide(contentId: number, accept: boolean, approvalNotes?: string): void {
    if (this.pendingDecisions().has(contentId)) return;
    this.pendingDecisions.update((s) => new Set([...s, contentId]));
    const obs = accept ? this.api.approve(contentId) : this.api.reject(contentId, approvalNotes);
    obs.subscribe({
      next: () => {
        // BE returns 204 / void from approve+reject; we patch the row's
        // status (and the rejection note) locally rather than re-fetching
        // the whole list.
        this.items.update((rows) =>
          rows.map((r) =>
            r.id === contentId
              ? {
                  ...r,
                  approvalStatus: (accept ? 'APPROVED' : 'REJECTED') as never,
                  ...(accept ? {} : { approvalNotes: approvalNotes?.trim() || r.approvalNotes }),
                }
              : r,
          ),
        );
        this.clearPending(contentId);
      },
      error: () => this.clearPending(contentId),
    });
  }

  private clearPending(contentId: number): void {
    this.pendingDecisions.update((s) => {
      const n = new Set(s);
      n.delete(contentId);
      return n;
    });
  }

  isAwaiting(row: AppliedOpportunityContentDtoOut): boolean {
    const s = row.approvalStatus;
    return s == null || s === ('PENDING' as never);
  }

  badgeClass(status?: string): string {
    if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800';
    if (status === 'REJECTED') return 'bg-red-100 text-red-800';
    return 'bg-slate-100 text-slate-700';
  }
}
