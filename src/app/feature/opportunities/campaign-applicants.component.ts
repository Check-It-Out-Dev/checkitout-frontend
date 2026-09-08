import { CommonModule } from '@angular/common';
import { LocalizedDatePipe } from '../../core/i18n/localized-date.pipe';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import type { PartnershipOpportunitySimpleDtoOut } from '../../api/model/partnership-opportunity-simple-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import {
  RejectApplicantDialogComponent,
  type RejectApplicantDialogData,
} from './reject-applicant-dialog.component';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error' | 'not-found';

/** The inbox lists rows at the stage where the decision is still the company's. */
const INBOX_STATUSES: ReadonlyArray<OpportunityStatus> = [
  OpportunityStatus.APPLIED,
  OpportunityStatus.ACCEPTED_BY_COMPANY,
];

/** A campaign published in the last week is still "new" to its applicants. */
const NEW_CAMPAIGN_DAYS = 7;

export type CampaignStage = 'new' | 'running' | 'closed';

/** Where a campaign is in its own life, read off the row's nested copy of it. */
export function campaignStage(
  campaign: Pick<PartnershipOpportunitySimpleDtoOut, 'createdTime' | 'active'>,
  now = Date.now(),
): CampaignStage {
  if (campaign.active === false) return 'closed';
  const created = campaign.createdTime ? Date.parse(campaign.createdTime) : NaN;
  if (!Number.isNaN(created) && now - created < NEW_CAMPAIGN_DAYS * 86_400_000) return 'new';
  return 'running';
}

/**
 * Stage 4 / E7a — Company-facing applicants list per campaign at
 * `/collaborations/:id/applicants`.
 *
 * Lists every applied-opportunity row whose `partnershipOpportunity.id`
 * matches the route param. The company sees the influencer name, applied
 * date, current status, and an Accept / Reject button pair when the
 * status is still APPLIED. Hitting either button calls
 * `updateOpportunityStatus(id, accept)` and refreshes the row in place.
 *
 * Defers rich applicant detail (Instagram link, follower count, content
 * portfolio) to E7b — this slice is the minimal triage view.
 */
@Component({
  selector: 'app-campaign-applicants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LocalizedDatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
    AvatarComponent,
  ],
  templateUrl: './campaign-applicants.component.html',
})
export class CampaignApplicantsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly api = inject(AppliedOpportunityApiService);

  readonly campaignId = signal<number | null>(null);
  /** No campaign in the route: the inbox across every campaign of this company. */
  readonly inbox = signal(false);
  readonly state = signal<LoadState>('loading');
  readonly items = signal<AppliedOpportunityDtoOut[]>([]);
  /** Per-row in-flight flag — disables both buttons on that row while a
   * decision is being saved. */
  readonly pendingDecisions = signal<ReadonlySet<number>>(new Set());

  readonly hasResults = computed(() => this.items().length > 0);

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === null) {
      this.inbox.set(true);
      this.load(null);
      return;
    }
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      this.state.set('not-found');
      return;
    }
    this.campaignId.set(id);
    this.load(id);
  }

  load(campaignId: number | null): void {
    this.state.set('loading');
    const filters: Record<string, string> =
      campaignId === null
        ? { opportunityStatus: INBOX_STATUSES.join(',') }
        : { 'partnershipOpportunity.id': String(campaignId) };
    this.api.list(0, 100, filters).subscribe({
      next: (page) => {
        const content = page.content ?? [];
        this.items.set(content);
        this.state.set(content.length === 0 ? 'empty' : 'loaded');
      },
      error: () => this.state.set('error'),
    });
  }

  /**
   * One confirmation before turning an applicant down. Rejecting used to
   * happen on a single click, next to the accept button, with no undo.
   */
  reject(row: AppliedOpportunityDtoOut): void {
    const id = row.id;
    if (id == null || this.pendingDecisions().has(id)) return;
    this.dialog
      .open<RejectApplicantDialogComponent, RejectApplicantDialogData, boolean>(
        RejectApplicantDialogComponent,
        {
          width: '520px',
          autoFocus: 'first-tabbable',
          data: { influencerName: this.influencerDisplayName(row) },
        },
      )
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.decide(id, false);
      });
  }

  decide(applicantId: number, accept: boolean): void {
    if (this.pendingDecisions().has(applicantId)) return;
    this.pendingDecisions.update((s) => new Set([...s, applicantId]));
    this.api.updateOpportunityStatus(applicantId, accept).subscribe({
      next: (updated) => {
        this.items.update((rows) => rows.map((r) => (r.id === applicantId ? updated : r)));
        this.pendingDecisions.update((s) => {
          const n = new Set(s);
          n.delete(applicantId);
          return n;
        });
      },
      error: () => {
        this.pendingDecisions.update((s) => {
          const n = new Set(s);
          n.delete(applicantId);
          return n;
        });
      },
    });
  }

  campaignStage(campaign: PartnershipOpportunitySimpleDtoOut): CampaignStage {
    return campaignStage(campaign);
  }

  /** The campaign chip: green for one just published, amber for one running. */
  campaignBadgeClass(campaign: PartnershipOpportunitySimpleDtoOut): string {
    switch (campaignStage(campaign)) {
      case 'new':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'running':
        return 'border-amber-200 bg-amber-50 text-amber-900';
      default:
        return 'border-beige bg-cream text-slate2';
    }
  }

  campaignStageClass(campaign: PartnershipOpportunitySimpleDtoOut): string {
    switch (campaignStage(campaign)) {
      case 'new':
        return 'text-emerald-700';
      case 'running':
        return 'text-amber-700';
      default:
        return 'text-slate2';
    }
  }

  isAwaitingDecision(row: AppliedOpportunityDtoOut): boolean {
    return row.opportunityStatus?.value === OpportunityStatus.APPLIED;
  }

  /** PublicProfileDto is a union (PublicProfileDto | CompanyPublicProfileDto)
   * — only the influencer branch carries `lastName`. Cast through `unknown`
   * to read both fields safely; falls back to '' when the field is absent. */
  influencerDisplayName(row: AppliedOpportunityDtoOut): string {
    const profile = row.influencer as { firstName?: string; lastName?: string } | undefined;
    if (!profile?.firstName) return '';
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  }

  statusBadgeClass(status?: string): string {
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
