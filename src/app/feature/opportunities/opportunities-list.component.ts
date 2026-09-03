import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';

type CompensationFilter = 'ALL' | 'CASH' | 'BARTER';

interface FilterFormShape {
  compensationType: FormControl<CompensationFilter>;
  city: FormControl<string>;
}

type LoadState = 'loading' | 'loaded' | 'error' | 'empty';

const DEFAULT_PAGE_SIZE = 12;
const FILTER_STORAGE_KEY = 'cio.opportunities.filter';

/**
 * Influencer-side opportunity browse list at `/campaigns`. Paginated card
 * grid showing campaign title, company, compensation, content type, and
 * city. Stage 4 / E1.
 *
 * Filtering (city / compensation / service-type) lands in a follow-up
 * slice — current scope is the read path + pagination so we have a
 * working canvas for E2 (detail + apply) to plug into.
 */
@Component({
  selector: 'app-opportunities-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoModule,
  ],
  templateUrl: './opportunities-list.component.html',
})
export class OpportunitiesListComponent implements OnInit {
  private readonly api = inject(OpportunityApiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly state = signal<LoadState>('loading');
  readonly items = signal<PartnershipOpportunityDtoOut[]>([]);
  readonly totalElements = signal<number>(0);
  readonly pageIndex = signal<number>(0);
  readonly pageSize = signal<number>(DEFAULT_PAGE_SIZE);

  readonly hasResults = computed(() => this.items().length > 0);

  /** Stage 5 / P2 — filter state. The submitted values map to BE filter
   * keys when load() runs; an empty city or `ALL` compensation type means
   * "no filter" and is left out of the payload. */
  readonly filterForm = new FormGroup<FilterFormShape>({
    compensationType: new FormControl<CompensationFilter>('ALL', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.restoreFilters();
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.api.list(this.pageIndex(), this.pageSize(), this.buildFilters()).subscribe({
      next: (page) => {
        const content = page.content ?? [];
        this.items.set(content);
        this.totalElements.set(page.totalElements ?? content.length);
        this.state.set(content.length === 0 ? 'empty' : 'loaded');
      },
      error: () => this.state.set('error'),
    });
  }

  applyFilters(): void {
    this.persistFilters();
    this.pageIndex.set(0);
    this.load();
  }

  resetFilters(): void {
    this.filterForm.reset({ compensationType: 'ALL', city: '' });
    this.clearPersistedFilters();
    this.pageIndex.set(0);
    this.load();
  }

  /**
   * Restore the last-used filter from localStorage so the browse filter
   * survives navigating away and back (audit P1 opp-filter-persist).
   * Browser-only — localStorage is undefined during SSR; malformed or tampered
   * values fall back to the default filter.
   */
  private restoreFilters(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(FILTER_STORAGE_KEY);
    } catch {
      return; // storage blocked (private mode / disabled) — keep defaults
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { compensationType?: unknown; city?: unknown };
      const compensationType: CompensationFilter =
        parsed.compensationType === 'CASH' || parsed.compensationType === 'BARTER'
          ? parsed.compensationType
          : 'ALL';
      const city = typeof parsed.city === 'string' ? parsed.city : '';
      this.filterForm.setValue({ compensationType, city });
    } catch {
      // malformed JSON — keep defaults
    }
  }

  private persistFilters(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const raw = this.filterForm.getRawValue();
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ compensationType: raw.compensationType, city: raw.city.trim() }),
      );
    } catch {
      // storage full/blocked — non-fatal
    }
  }

  private clearPersistedFilters(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.removeItem(FILTER_STORAGE_KEY);
    } catch {
      // non-fatal
    }
  }

  private buildFilters(): Record<string, string> {
    // Always include `active: 'true'` — the discover-campaigns list shows
    // only currently-open opportunities. Without this filter, closed and
    // expired campaigns render alongside live ones and influencers can
    // attempt to apply to dead listings. Caught 2026-05-09 by the
    // Stage-5b trace-equivalence checker as drift vs legacy.
    const out: Record<string, string> = { active: 'true' };
    const raw = this.filterForm.getRawValue();
    if (raw.compensationType !== 'ALL') {
      out['compensationType'] = raw.compensationType;
    }
    const city = raw.city.trim();
    if (city) {
      out['city'] = city;
    }
    return out;
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  /**
   * Convert the codegen's `Set<ContentTypeDtoOut>` (a real Set on the wire,
   * but Angular templates can't `@for` it) to an array. JSON parsing on the
   * client returns an Array, so this is mostly a TS-level coercion.
   */
  contentTypeArray(o: PartnershipOpportunityDtoOut): ContentTypeDtoOut[] {
    const cts = o.contentTypes;
    if (!cts) return [];
    if (Array.isArray(cts)) return cts as ContentTypeDtoOut[];
    return Array.from(cts);
  }

  /**
   * Display compensation as a single string. CASH shows currency + range;
   * BARTER shows compensationDescription text-only. Falls back to a dash
   * when both sides are blank (admin-side data error — render won't break).
   */
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
}
