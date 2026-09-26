import { CommonModule } from '@angular/common';
import { LocalizedDatePipe } from '../../../core/i18n/localized-date.pipe';
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
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { PageSupportTicketDtoOut } from '../../../api/model/page-support-ticket-dto-out';
import type { SupportTicketDtoOut } from '../../../api/model/support-ticket-dto-out';
import {
  SupportTicketApiService,
  TICKET_CATEGORY_CHIP_CLASSES,
  TICKET_CATEGORY_LABEL_KEYS,
  TICKET_CATEGORY_OPTIONS,
  TICKET_STATUS_CHIP_CLASSES,
  TICKET_STATUS_LABEL_KEYS,
  TICKET_STATUS_OPTIONS,
} from '../../../core/support/support-ticket.service';

interface PersistedAdminFilters {
  searchQuery: string;
  status: TicketStatus | null;
  category: TicketCategory | null;
  page: number;
  size: number;
  showClosedTickets: boolean;
}

const STORAGE_KEY = 'admin-tickets-filters';

/**
 * `/support/admin/tickets` — the admin queue, ported from legacy
 * (iter-61, audit P0 #8). Status / category / search filter SERVER-side
 * through the typed getTickets query (exactly what legacy sent); the
 * show-closed toggle filters the loaded page client-side, also like
 * legacy. Legacy's stats cards were `hidden` dead code and are not
 * ported. Rows open the admin detail. The BE enforces the ADMIN role
 * (403) — the FE has no role guard, same as legacy.
 */
@Component({
  selector: 'app-admin-tickets-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LocalizedDatePipe,
    ReactiveFormsModule,
    TranslocoModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './admin-tickets-list.component.html',
})
export class AdminTicketsListComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SupportTicketApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusOptions = TICKET_STATUS_OPTIONS;
  readonly categoryOptions = TICKET_CATEGORY_OPTIONS;
  readonly pageSizeOptions = [5, 10, 25, 50];

  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly pageData = signal<PageSupportTicketDtoOut | null>(null);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly showClosedTickets = signal(false);

  /** Loaded page minus CLOSED rows unless the toggle shows them (legacy client-side rule). */
  readonly displayedTickets = computed(() => {
    const content = this.pageData()?.content ?? [];
    if (this.showClosedTickets()) return content;
    return content.filter((ticket) => ticket.status !== TicketStatus.CLOSED);
  });

  readonly totalElements = computed(() => this.pageData()?.totalElements ?? 0);

  readonly filterForm = this.fb.group({
    searchQuery: [''],
    status: this.fb.control<TicketStatus | null>(null),
    category: this.fb.control<TicketCategory | null>(null),
  });

  ngOnInit(): void {
    this.restoreFilters();

    this.filterForm.controls.searchQuery.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onFiltersChange());
    this.filterForm.controls.status.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onFiltersChange());
    this.filterForm.controls.category.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onFiltersChange());

    this.loadTickets();
  }

  loadTickets(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    const { searchQuery, status, category } = this.filterForm.getRawValue();
    this.api
      .getTickets({
        page: this.pageIndex(),
        size: this.pageSize(),
        status,
        category,
        searchQuery: searchQuery || null,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (page) => this.pageData.set(page),
        error: () => this.errorKey.set('support.admin.tickets.retrieve.failed'),
      });
  }

  toggleShowClosed(show: boolean): void {
    this.showClosedTickets.set(show);
    this.persistFilters();
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.persistFilters();
    this.loadTickets();
  }

  clearFilters(): void {
    this.filterForm.reset({ searchQuery: '', status: null, category: null }, { emitEvent: false });
    this.pageIndex.set(0);
    this.showClosedTickets.set(false);
    localStorage.removeItem(STORAGE_KEY);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    this.loadTickets();
  }

  viewTicket(ticket: SupportTicketDtoOut): void {
    void this.router.navigate(['/support/admin/tickets', ticket.id]);
  }

  statusLabelKey(status: TicketStatus | undefined): string {
    return status ? TICKET_STATUS_LABEL_KEYS[status] : TICKET_STATUS_LABEL_KEYS[TicketStatus.OPEN];
  }

  statusChipClass(status: TicketStatus | undefined): string {
    return status
      ? TICKET_STATUS_CHIP_CLASSES[status]
      : TICKET_STATUS_CHIP_CLASSES[TicketStatus.OPEN];
  }

  categoryLabelKey(category: TicketCategory | undefined): string {
    return category
      ? TICKET_CATEGORY_LABEL_KEYS[category]
      : TICKET_CATEGORY_LABEL_KEYS[TicketCategory.OTHER];
  }

  categoryChipClass(category: TicketCategory | undefined): string {
    return category
      ? TICKET_CATEGORY_CHIP_CLASSES[category]
      : TICKET_CATEGORY_CHIP_CLASSES[TicketCategory.OTHER];
  }

  private onFiltersChange(): void {
    this.pageIndex.set(0);
    this.persistFilters();
    this.loadTickets();
  }

  /** URL params win over localStorage — a shared link overrides device state. */
  private restoreFilters(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.applyFilters(JSON.parse(stored) as Partial<PersistedAdminFilters>);
      }
    } catch {
      // Corrupt storage — start clean.
    }

    const params = this.route.snapshot.queryParams;
    if (Object.keys(params).length > 0) {
      this.applyFilters({
        searchQuery: (params['search'] as string) ?? '',
        status: (params['status'] as TicketStatus) || null,
        category: (params['category'] as TicketCategory) || null,
        page: parseInt(params['page'] as string, 10) || 0,
        size: parseInt(params['size'] as string, 10) || 10,
        showClosedTickets: params['showClosed'] === 'true',
      });
    }
  }

  private applyFilters(f: Partial<PersistedAdminFilters>): void {
    this.filterForm.patchValue(
      { searchQuery: f.searchQuery ?? '', status: f.status ?? null, category: f.category ?? null },
      { emitEvent: false },
    );
    this.pageIndex.set(f.page ?? 0);
    this.pageSize.set(f.size ?? 10);
    this.showClosedTickets.set(f.showClosedTickets ?? false);
  }

  private persistFilters(): void {
    const { searchQuery, status, category } = this.filterForm.getRawValue();
    const state: PersistedAdminFilters = {
      searchQuery,
      status,
      category,
      page: this.pageIndex(),
      size: this.pageSize(),
      showClosedTickets: this.showClosedTickets(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const queryParams: Record<string, string | number | boolean> = {};
    if (state.searchQuery) queryParams['search'] = state.searchQuery;
    if (state.status) queryParams['status'] = state.status;
    if (state.category) queryParams['category'] = state.category;
    if (state.page > 0) queryParams['page'] = state.page;
    if (state.size !== 10) queryParams['size'] = state.size;
    if (state.showClosedTickets) queryParams['showClosed'] = true;
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }
}
