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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Stage 4 / E6 — Company-facing campaign management dashboard at
 * `/collaborations/dashboard`.
 *
 * Reads the same `findPaginated` endpoint as the influencer-side browse list
 * but the BE auto-scopes results to the logged-in actor's company for
 * non-admin sessions. Each row links to detail (read-only) AND to the edit
 * form from E5. Inactive campaigns get a quieter badge so the list reads
 * top-down by recency without the eye getting pulled to dimmed rows first.
 *
 * Empty-state pushes the user to /collaborations/create — the most common
 * next step on first visit.
 */
@Component({
    selector: 'app-my-campaigns',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        DatePipe,
        RouterLink,
        MatButtonModule,
        MatIconModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        TranslocoModule,
    ],
    templateUrl: './my-campaigns.component.html'
})
export class MyCampaignsComponent implements OnInit {
  private readonly api = inject(OpportunityApiService);

  readonly state = signal<LoadState>('loading');
  readonly items = signal<PartnershipOpportunityDtoOut[]>([]);
  readonly totalElements = signal<number>(0);
  readonly pageIndex = signal<number>(0);
  readonly pageSize = signal<number>(DEFAULT_PAGE_SIZE);

  readonly hasResults = computed(() => this.items().length > 0);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    // BE auto-scopes findPaginated to the logged-in company for non-admin
    // actors, so no explicit `company` filter is needed.
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

  statusBadgeClass(active?: boolean): string {
    return active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate2';
  }
}
