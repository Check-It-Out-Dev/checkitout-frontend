import { CommonModule } from '@angular/common';
import { LocalizedDatePipe } from '../../core/i18n/localized-date.pipe';
import { HttpErrorResponse } from '@angular/common/http';
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
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import { groupedNumber } from '../../core/i18n/number-format';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { SessionStateService } from '../../core/auth/session-state.service';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { AdminCascadeDeleteDialogComponent } from './admin-cascade-delete-dialog.component';

type LoadState = 'loading' | 'loaded' | 'not_found' | 'error';
type ApplyState = 'idle' | 'submitting' | 'applied' | 'error';

/**
 * Influencer-side opportunity detail at `/collaborations/:id` — shows the
 * full campaign brief and an "Apply" CTA that posts to /applied-opportunity.
 *
 * The form is intentionally minimal (just the optional note) — the BE
 * resolves the influencer from session and rejects re-apply with 409.
 */
@Component({
  selector: 'app-opportunity-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LocalizedDatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './opportunity-detail.component.html',
})
export class OpportunityDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly oppApi = inject(OpportunityApiService);
  private readonly applyApi = inject(AppliedOpportunityApiService);
  private readonly dialog = inject(MatDialog);
  private readonly session = inject(SessionStateService);

  /** Admin-only cascade-delete affordance (legacy-parity: the delete
   * dialog on legacy collaboration details was ADMIN-gated too). */
  readonly isAdmin = computed(
    () => (this.session.user()?.userType?.value as string | undefined) === 'ADMIN',
  );

  /** Apply-guard #1: only influencer accounts can apply — a company would
   * only hit the BE's 403. Companies see an informational note instead. */
  readonly isInfluencer = computed(
    () => (this.session.user()?.userType?.value as string | undefined) === 'INFLUENCER',
  );

  readonly state = signal<LoadState>('loading');
  readonly opp = signal<PartnershipOpportunityDtoOut | null>(null);
  readonly applyState = signal<ApplyState>('idle');
  readonly applyErrorKey = signal<string | null>(null);
  readonly opportunityId = signal<number | null>(null);

  readonly noteControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!idParam || Number.isNaN(id)) {
      this.state.set('not_found');
      return;
    }
    this.opportunityId.set(id);
    this.load(id);
    // Apply-guard #2: pre-mark "applied" so a re-visit renders the applied
    // state up front instead of letting the user click into the BE's 409.
    if (this.isInfluencer()) this.preCheckApplied(id);
  }

  /**
   * Best-effort pre-check against my recent applications (first 50 — an
   * influencer applies to a handful, not hundreds). Any failure or a miss
   * beyond page one degrades gracefully: the 409 classification on submit
   * remains the backstop.
   */
  private preCheckApplied(id: number): void {
    this.applyApi.list(0, 50).subscribe({
      next: (page) => {
        if ((page.content ?? []).some((a) => a.partnershipOpportunity?.id === id)) {
          this.applyState.set('applied');
        }
      },
      error: () => undefined,
    });
  }

  load(id: number): void {
    this.state.set('loading');
    this.oppApi.getById(id).subscribe({
      next: (o) => {
        this.opp.set(o);
        this.state.set('loaded');
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.state.set('not_found');
          return;
        }
        this.state.set('error');
      },
    });
  }

  apply(): void {
    const id = this.opportunityId();
    if (!id || this.applyState() === 'submitting' || this.applyState() === 'applied') return;
    if (this.noteControl.invalid) {
      this.noteControl.markAsTouched();
      return;
    }

    this.applyState.set('submitting');
    this.applyErrorKey.set(null);
    const note = this.noteControl.value.trim() || undefined;

    this.applyApi.apply(id, note).subscribe({
      next: () => {
        this.applyState.set('applied');
      },
      error: (err: unknown) => {
        this.applyState.set('error');
        this.applyErrorKey.set(this.classifyApplyError(err));
      },
    });
  }

  contentTypeArray(o: PartnershipOpportunityDtoOut): ContentTypeDtoOut[] {
    const cts = o.contentTypes;
    if (!cts) return [];
    if (Array.isArray(cts)) return cts as ContentTypeDtoOut[];
    return Array.from(cts);
  }

  compensationDisplay(o: PartnershipOpportunityDtoOut): string {
    const type = o.compensationType?.value;
    // 0 is "not set" for money bounds (BE nullable ints arrive as 0 on some
    // legacy rows) — a 0 bound must never print as a "100–0" range.
    const min = o.compensationAmountMin || undefined;
    const max = o.compensationAmountMax || undefined;
    const currency = o.currency?.isoCode ?? o.currency?.sign ?? '';
    if (type === 'CASH' && (min !== undefined || max !== undefined)) {
      const left = min ?? max;
      const right = max ?? min;
      if (left === right) return `${left} ${currency}`.trim();
      return `${left}–${right} ${currency}`.trim();
    }
    return o.compensationDescription || '—';
  }

  goBack(): void {
    void this.router.navigateByUrl('/collaborations/list');
  }

  openCascadeDelete(): void {
    const id = this.opportunityId();
    if (id == null) return;
    const opp = this.opp();
    this.dialog
      .open(AdminCascadeDeleteDialogComponent, {
        maxWidth: '95vw',
        autoFocus: false,
        data: {
          partnershipOpportunityId: id,
          title: opp?.title,
          companyName: opp?.company?.name,
        },
      })
      .afterClosed()
      .subscribe((deleted: boolean | undefined) => {
        if (deleted) void this.router.navigateByUrl('/collaborations/list');
      });
  }

  private readonly transloco = inject(TranslocoService);

  /** Locale-aware grouping — "50 000" in Polish, "50,000" in English. */
  formatCount(n: number): string {
    return groupedNumber(this.transloco.getActiveLang(), n);
  }

  private classifyApplyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'opportunities.detail.apply.errors.invalid_input';
      if (err.status === 401) return 'opportunities.detail.apply.errors.not_authenticated';
      if (err.status === 403) return 'opportunities.detail.apply.errors.forbidden';
      if (err.status === 409) return 'opportunities.detail.apply.errors.already_applied';
      if (err.status === 429) return 'opportunities.detail.apply.errors.rate_limited';
    }
    return 'opportunities.detail.apply.errors.failed';
  }
}
