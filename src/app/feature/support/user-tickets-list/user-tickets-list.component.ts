import { CommonModule } from '@angular/common';
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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { PageSupportTicketDtoOut } from '../../../api/model/page-support-ticket-dto-out';
import type { SupportTicketDtoOut } from '../../../api/model/support-ticket-dto-out';
import {
  SupportTicketApiService,
  TICKET_STATUS_CHIP_CLASSES,
  TICKET_STATUS_LABEL_KEYS,
  TICKET_STATUS_OPTIONS,
} from '../../../core/support/support-ticket.service';

interface PersistedFilters {
  searchQuery: string;
  status: TicketStatus | null;
  page: number;
  size: number;
}

const STORAGE_KEY = 'user-tickets-filters';

/**
 * `/support/tickets/my-tickets` — the authed user's ticket list, ported
 * from legacy (iter-60, audit P0 #8). Server-side pagination (newest
 * first); the search box and status select filter the CURRENT page
 * client-side, exactly like legacy. Filters persist to localStorage and
 * mirror into the URL (`?search&status&page&size`) so the view survives
 * reloads and can be shared. Rows deep-link into the public status view
 * with the ticket's own reference+email pair.
 */
@Component({
    selector: 'app-user-tickets-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        TranslocoModule,
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatSelectModule,
    ],
    templateUrl: './user-tickets-list.component.html'
})
export class UserTicketsListComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SupportTicketApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusOptions = TICKET_STATUS_OPTIONS;
  readonly pageSizeOptions = [5, 10, 25];

  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly pageData = signal<PageSupportTicketDtoOut | null>(null);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);

  /** Client-side filter state mirrored from the form (page-local, like legacy). */
  private readonly searchQuery = signal('');
  private readonly statusFilter = signal<TicketStatus | null>(null);

  readonly filteredTickets = computed(() => {
    const content = this.pageData()?.content ?? [];
    const query = this.searchQuery().toLowerCase();
    const status = this.statusFilter();
    return content.filter((ticket) => {
      if (status && ticket.status !== status) return false;
      if (!query) return true;
      return (
        (ticket.subject ?? '').toLowerCase().includes(query) ||
        (ticket.ticketReference ?? '').toLowerCase().includes(query)
      );
    });
  });

  readonly totalElements = computed(() => this.pageData()?.totalElements ?? 0);

  readonly filterForm = this.fb.group({
    searchQuery: [''],
    status: this.fb.control<TicketStatus | null>(null),
  });

  ngOnInit(): void {
    this.restoreFilters();

    this.filterForm.controls.searchQuery.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.searchQuery.set(value);
        this.persistFilters();
      });
    this.filterForm.controls.status.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.statusFilter.set(value);
        this.persistFilters();
      });

    this.loadTickets();
  }

  loadTickets(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    this.api
      .getMyTickets(this.pageIndex(), this.pageSize())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (page) => this.pageData.set(page),
        error: () => this.errorKey.set('support.tickets.my.retrieve.failed'),
      });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.persistFilters();
    this.loadTickets();
  }

  clearFilters(): void {
    this.filterForm.reset({ searchQuery: '', status: null });
    this.searchQuery.set('');
    this.statusFilter.set(null);
    this.pageIndex.set(0);
    localStorage.removeItem(STORAGE_KEY);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    this.loadTickets();
  }

  viewTicket(ticket: SupportTicketDtoOut): void {
    void this.router.navigate(['/support/tickets/status'], {
      queryParams: { ref: ticket.ticketReference, email: ticket.contactEmail },
    });
  }

  createNewTicket(): void {
    void this.router.navigate(['/support/tickets/create']);
  }

  statusLabelKey(status: TicketStatus | undefined): string {
    return status ? TICKET_STATUS_LABEL_KEYS[status] : TICKET_STATUS_LABEL_KEYS[TicketStatus.OPEN];
  }

  statusChipClass(status: TicketStatus | undefined): string {
    return status
      ? TICKET_STATUS_CHIP_CLASSES[status]
      : TICKET_STATUS_CHIP_CLASSES[TicketStatus.OPEN];
  }

  /** URL params win over localStorage — a shared link overrides a stale device state. */
  private restoreFilters(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const saved = JSON.parse(stored) as Partial<PersistedFilters>;
        this.applyFilters(saved);
      }
    } catch {
      // Corrupt storage — start clean.
    }

    const params = this.route.snapshot.queryParams;
    if (Object.keys(params).length > 0) {
      this.applyFilters({
        searchQuery: (params['search'] as string) ?? '',
        status: (params['status'] as TicketStatus) || null,
        page: parseInt(params['page'] as string, 10) || 0,
        size: parseInt(params['size'] as string, 10) || 10,
      });
    }
  }

  private applyFilters(f: Partial<PersistedFilters>): void {
    this.filterForm.patchValue(
      { searchQuery: f.searchQuery ?? '', status: f.status ?? null },
      { emitEvent: false },
    );
    this.searchQuery.set(f.searchQuery ?? '');
    this.statusFilter.set(f.status ?? null);
    this.pageIndex.set(f.page ?? 0);
    this.pageSize.set(f.size ?? 10);
  }

  private persistFilters(): void {
    const state: PersistedFilters = {
      searchQuery: this.searchQuery(),
      status: this.statusFilter(),
      page: this.pageIndex(),
      size: this.pageSize(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    const queryParams: Record<string, string | number> = {};
    if (state.searchQuery) queryParams['search'] = state.searchQuery;
    if (state.status) queryParams['status'] = state.status;
    if (state.page > 0) queryParams['page'] = state.page;
    if (state.size !== 10) queryParams['size'] = state.size;
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }
}
