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
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';
type TabKey = 'in-progress' | 'applications' | 'completed';

const TAB_KEYS: ReadonlyArray<TabKey> = ['in-progress', 'applications', 'completed'];

const IN_PROGRESS_STATUSES: ReadonlyArray<OpportunityStatus> = [
  OpportunityStatus.ACCEPTED_BY_COMPANY,
  OpportunityStatus.ACCEPTED_BY_INFLUENCER,
  OpportunityStatus.CONTENT_SEND_TO_ACCEPT,
  OpportunityStatus.CONTENT_APPROVED,
  OpportunityStatus.CONTENT_POSTED,
  OpportunityStatus.TO_BE_PAID,
];
const APPLICATIONS_STATUSES: ReadonlyArray<OpportunityStatus> = [OpportunityStatus.APPLIED];
const COMPLETED_STATUSES: ReadonlyArray<OpportunityStatus> = [
  OpportunityStatus.DONE,
  OpportunityStatus.REJECTED_BY_COMPANY,
  OpportunityStatus.REJECTED_BY_INFLUENCER,
  OpportunityStatus.CONTENT_REJECTED,
  OpportunityStatus.CONTENT_POSTED_REJECTED,
];

// Page size doubled vs E3 — the tab UI lives client-side over a single page,
// so fetching more rows up-front keeps tab counts honest without paging the
// user through buckets they can already see.
const DEFAULT_PAGE_SIZE = 50;

/**
 * Influencer-side "my applications" list at `/collaborations/registrations`.
 * Stage 4 / E3.
 *
 * Read-only view of `GET /applied-opportunity (paged, current user)`. Each
 * row shows the parent campaign title, application date, status badge, and
 * a link to the application detail (E4 will fill in the destination).
 * The active bucket is deep-linkable via `?tab=` and kept in the URL on
 * tab change (replaceUrl — tab flips don't pollute history).
 *
 * Status badge palette mirrors the BE state-machine color semantics:
 *   APPLIED → slate (waiting)
 *   ACCEPTED_* → emerald (forward progress)
 *   REJECTED_*, CONTENT_REJECTED, CONTENT_POSTED_REJECTED → red (terminal-bad)
 *   CONTENT_* (active) → blue (in-flight)
 *   TO_BE_PAID → amber (action pending elsewhere)
 *   DONE → slate-strong (terminal-good, but quiet)
 */
@Component({
  selector: 'app-applied-opportunities-list',
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
  templateUrl: './applied-opportunities-list.component.html',
})
export class AppliedOpportunitiesListComponent implements OnInit {
  private readonly api = inject(AppliedOpportunityApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly state = signal<LoadState>('loading');
  readonly items = signal<AppliedOpportunityDtoOut[]>([]);
  readonly totalElements = signal<number>(0);
  readonly pageIndex = signal<number>(0);
  readonly pageSize = signal<number>(DEFAULT_PAGE_SIZE);
  readonly activeTab = signal<TabKey>('applications');

  constructor() {
    // Deep-linkable buckets: `?tab=in-progress|applications|completed` selects
    // the tab, so shared links (and guided tours) land on the intended view.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const tab = params.get('tab') as TabKey | null;
      if (tab && TAB_KEYS.includes(tab)) this.activeTab.set(tab);
    });
  }

  readonly hasResults = computed(() => this.items().length > 0);

  /** Items currently visible — items() filtered by the active tab. */
  readonly visibleItems = computed(() => {
    const all = this.items();
    const buckets: Record<TabKey, ReadonlyArray<OpportunityStatus>> = {
      'in-progress': IN_PROGRESS_STATUSES,
      applications: APPLICATIONS_STATUSES,
      completed: COMPLETED_STATUSES,
    };
    const allowed = buckets[this.activeTab()];
    return all.filter((row) => {
      const v = row.opportunityStatus?.value as OpportunityStatus | undefined;
      return v != null && allowed.includes(v);
    });
  });

  readonly inProgressCount = computed(
    () =>
      this.items().filter((r) =>
        IN_PROGRESS_STATUSES.includes(r.opportunityStatus?.value as OpportunityStatus),
      ).length,
  );
  readonly applicationsCount = computed(
    () =>
      this.items().filter((r) =>
        APPLICATIONS_STATUSES.includes(r.opportunityStatus?.value as OpportunityStatus),
      ).length,
  );
  readonly completedCount = computed(
    () =>
      this.items().filter((r) =>
        COMPLETED_STATUSES.includes(r.opportunityStatus?.value as OpportunityStatus),
      ).length,
  );

  /** MatTabGroup uses a numeric index. Map the active tab key → index. */
  readonly activeTabIndex = computed(() => {
    switch (this.activeTab()) {
      case 'in-progress':
        return 0;
      case 'applications':
        return 1;
      case 'completed':
        return 2;
    }
  });

  setTabFromIndex(index: number): void {
    const next = TAB_KEYS[index];
    // The guard also swallows mat-tab-group's echo when [selectedIndex]
    // changes programmatically (deep link), avoiding a redundant navigation.
    if (!next || next === this.activeTab()) return;
    this.activeTab.set(next);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: next },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.api.list(this.pageIndex(), this.pageSize()).subscribe({
      next: (page) => {
        const content = page.content ?? [];
        this.items.set(content);
        this.totalElements.set(page.totalElements ?? content.length);
        this.state.set(content.length === 0 ? 'empty' : 'loaded');
      },
      error: () => this.state.set('error'),
    });
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  /**
   * Tailwind class set for the status badge based on the BE enum value.
   * Returns Tailwind utility classes — kept in TS so the template stays
   * declarative + the test assertion targets stable labels.
   */
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
