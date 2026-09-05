import { CommonModule } from '@angular/common';
import { LocalizedDatePipe } from '../../core/i18n/localized-date.pipe';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { SessionStateService } from '../../core/auth/session-state.service';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';
type DashboardTab = 'in-progress' | 'finished';

/**
 * Server-side status buckets — the collaboration state machine split the way
 * the legacy dashboard splits it (`getStatusFiltersForTab`, legacy
 * applied-opportunity.service.ts:508). Registrations ([APPLIED,
 * ACCEPTED_BY_COMPANY]) is the already-ported list at
 * /collaborations/registrations; its tab here navigates there.
 */
const IN_PROGRESS_STATUSES: ReadonlyArray<OpportunityStatus> = [
  OpportunityStatus.ACCEPTED_BY_INFLUENCER,
  OpportunityStatus.CONTENT_SEND_TO_ACCEPT,
  OpportunityStatus.CONTENT_APPROVED,
  OpportunityStatus.CONTENT_REJECTED,
  OpportunityStatus.CONTENT_POSTED,
  OpportunityStatus.CONTENT_POSTED_REJECTED,
  OpportunityStatus.TO_BE_PAID,
];
const FINISHED_STATUSES: ReadonlyArray<OpportunityStatus> = [
  OpportunityStatus.DONE,
  OpportunityStatus.REJECTED_BY_COMPANY,
  OpportunityStatus.REJECTED_BY_INFLUENCER,
];

/** Legacy paginator parity: 6 cards per page, first/last buttons, fixed size. */
const PAGE_SIZE = 6;

/**
 * The collaboration workflow is presented to users as 8 steps; every status
 * pins to its phase (rejected states pin to the step they interrupt), so the
 * per-row progress bar reads "step n of 8" exactly like legacy
 * CollaborationStatusService.getStatusIndex.
 */
const STATUS_STEP: Readonly<Partial<Record<OpportunityStatus, number>>> = {
  [OpportunityStatus.APPLIED]: 1,
  [OpportunityStatus.ACCEPTED_BY_COMPANY]: 2,
  [OpportunityStatus.REJECTED_BY_COMPANY]: 2,
  [OpportunityStatus.ACCEPTED_BY_INFLUENCER]: 3,
  [OpportunityStatus.REJECTED_BY_INFLUENCER]: 3,
  [OpportunityStatus.CONTENT_SEND_TO_ACCEPT]: 4,
  [OpportunityStatus.CONTENT_REJECTED]: 4,
  [OpportunityStatus.CONTENT_APPROVED]: 5,
  [OpportunityStatus.CONTENT_POSTED]: 6,
  [OpportunityStatus.CONTENT_POSTED_REJECTED]: 6,
  [OpportunityStatus.TO_BE_PAID]: 7,
  [OpportunityStatus.DONE]: 8,
};
const TOTAL_STEPS = 8;

interface RowCta {
  /** RouterLink target — always an EXISTING route; the dashboard is a
   * navigation surface. Mutable array: routerLink's input type rejects
   * ReadonlyArray under strictTemplates. */
  readonly link: (string | number)[];
  /** transloco key under collaborations.dashboard.cta.* */
  readonly labelKey: string;
  /** amber = this user must act now; primary = waiting/neutral view. */
  readonly tone: 'act' | 'view';
}

/**
 * Collaboration dashboard — Journey 5's landing surface at
 * `/collaborations/{dashboard,in-progress,finished}` (dashboard redirects to
 * in-progress, mirroring legacy tab 0).
 *
 * Legacy rendered one flip-card component per status with in-card actions;
 * greenfield's pattern is drill-in: the ACTIONS already live in the ported
 * routes (influencer accept/decline + rating + payment contact in
 * `registrations/:id` — iter-49 P0 #5; content submission in
 * `registrations/:id/content`; company review/validate + influencer rating in
 * `applications/:id/review`; applicant accept/reject in `:id/applicants`).
 * This component is the missing aggregation layer: server-side status-bucket
 * lists (page size 6, legacy parity) + live tab counters from
 * `/applied-opportunity/statistics` + a role-aware CTA per row that deep-links
 * into the right action route, amber-toned when it is THIS user's turn (legacy
 * getButtonColor semantics).
 *
 * The active tab derives from route data subscribed REACTIVELY — legacy
 * regressed on sidebar navigation by reading the route snapshot once
 * (recorded in the journey5-legacy-brief playbook); `route.data` keeps
 * same-component navigations live. The Registrations tab navigates to the
 * already-ported `/collaborations/registrations` list.
 */
@Component({
  selector: 'app-collaboration-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LocalizedDatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    TranslocoModule,
  ],
  templateUrl: './collaboration-dashboard.component.html',
})
export class CollaborationDashboardComponent implements OnInit {
  private readonly api = inject(AppliedOpportunityApiService);
  private readonly session = inject(SessionStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<LoadState>('loading');
  readonly items = signal<AppliedOpportunityDtoOut[]>([]);
  readonly totalElements = signal<number>(0);
  readonly pageIndex = signal<number>(0);
  readonly activeTab = signal<DashboardTab>('in-progress');

  /** Live tab counters from GET /applied-opportunity/statistics. */
  readonly inProgressCount = signal<number | null>(null);
  readonly registrationsCount = signal<number | null>(null);
  readonly finishedCount = signal<number | null>(null);

  readonly pageSize = PAGE_SIZE;

  /** Tab strip order: in-progress (0) · registrations (1, navigates away) · finished (2). */
  readonly activeTabIndex = computed(() => (this.activeTab() === 'in-progress' ? 0 : 2));

  private readonly role = computed(() => this.session.user()?.userType?.value ?? null);
  readonly isCompany = computed(() => this.role() === 'COMPANY');

  ngOnInit(): void {
    // Reactive route→tab binding: /collaborations/in-progress and /finished
    // share this component; same-component sidebar navigation must re-drive
    // the list (legacy snapshot-read bug — see class docs).
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const tab = (data['collabTab'] as DashboardTab | undefined) ?? 'in-progress';
      this.activeTab.set(tab);
      this.pageIndex.set(0);
      this.load();
    });
    this.refreshStatistics();
  }

  load(): void {
    this.state.set('loading');
    const statuses = this.activeTab() === 'in-progress' ? IN_PROGRESS_STATUSES : FINISHED_STATUSES;
    this.api
      .list(this.pageIndex(), this.pageSize, { opportunityStatus: statuses.join(',') })
      .subscribe({
        next: (page) => {
          const content = page.content ?? [];
          this.items.set(content);
          this.totalElements.set(page.totalElements ?? content.length);
          this.state.set(content.length === 0 ? 'empty' : 'loaded');
        },
        error: () => this.state.set('error'),
      });
  }

  refreshStatistics(): void {
    this.api.getStatistics().subscribe({
      next: (stats) => {
        this.inProgressCount.set(stats.inProgress ?? null);
        this.registrationsCount.set(stats.newOpportunities ?? null);
        this.finishedCount.set(stats.done ?? null);
      },
      // Counters are decoration — the lists are authoritative. Stay silent.
      error: () => undefined,
    });
  }

  /** Tab clicks navigate between routes (legacy behavior); tab 1 goes to the ported registrations list. */
  onTabIndexChange(index: number): void {
    const target = index === 0 ? 'in-progress' : index === 1 ? 'registrations' : 'finished';
    void this.router.navigate(['/collaborations', target]);
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.load();
  }

  /** "Step n of 8" workflow position for the row's progress bar. */
  step(status?: string): number {
    return STATUS_STEP[status as OpportunityStatus] ?? 1;
  }

  progressPercent(status?: string): number {
    return Math.round((this.step(status) / TOTAL_STEPS) * 100);
  }

  /** The other party's display name: company sees the influencer, influencer sees the campaign's company. */
  counterpartyName(row: AppliedOpportunityDtoOut): string {
    if (this.isCompany()) {
      // Union of Company/Influencer public profiles — both expose `name`;
      // the influencer variant may only carry its social `displayName`.
      const inf = row.influencer as { name?: string; displayName?: string } | undefined;
      return inf?.name || inf?.displayName || '—';
    }
    return row.partnershipOpportunity?.company?.name ?? '—';
  }

  /**
   * Role-aware deep link per row — amber ('act') when it is this user's turn
   * in the state machine, quiet ('view') otherwise. Targets are the EXISTING
   * action routes; this dashboard adds no new mutation surface.
   */
  cta(row: AppliedOpportunityDtoOut): RowCta {
    const status = row.opportunityStatus?.value as OpportunityStatus | undefined;
    const id = row.id ?? 0;
    const detail = ['/collaborations', 'registrations', id];
    const content = ['/collaborations', 'registrations', id, 'content'];
    const review = ['/collaborations', 'applications', id, 'review'];

    if (this.isCompany()) {
      switch (status) {
        case OpportunityStatus.CONTENT_SEND_TO_ACCEPT:
        case OpportunityStatus.CONTENT_POSTED:
          return { link: review, labelKey: 'review_content', tone: 'act' };
        case OpportunityStatus.TO_BE_PAID:
          return { link: detail, labelKey: 'process_payment', tone: 'act' };
        case OpportunityStatus.DONE:
          return this.rated(row, 'companyRateStatus')
            ? { link: detail, labelKey: 'view', tone: 'view' }
            : { link: review, labelKey: 'rate', tone: 'act' };
        default:
          return { link: detail, labelKey: 'view', tone: 'view' };
      }
    }
    switch (status) {
      case OpportunityStatus.ACCEPTED_BY_INFLUENCER:
      case OpportunityStatus.CONTENT_REJECTED:
        return { link: content, labelKey: 'submit_content', tone: 'act' };
      case OpportunityStatus.CONTENT_APPROVED:
      case OpportunityStatus.CONTENT_POSTED_REJECTED:
        return { link: detail, labelKey: 'publish_content', tone: 'act' };
      case OpportunityStatus.DONE:
        return this.rated(row, 'rateStatus')
          ? { link: detail, labelKey: 'view', tone: 'view' }
          : { link: detail, labelKey: 'rate', tone: 'act' };
      default:
        return { link: detail, labelKey: 'view', tone: 'view' };
    }
  }

  private rated(row: AppliedOpportunityDtoOut, field: 'rateStatus' | 'companyRateStatus'): boolean {
    const value = row[field]?.value;
    return value != null && value !== 'DEFAULT';
  }

  /** Status-chip palette — same semantics as the registrations list. */
  statusBadgeClass(status?: string): string {
    switch (status) {
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
