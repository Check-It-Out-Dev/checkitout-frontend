import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { PageSupportTicketDtoOut } from '../../../api/model/page-support-ticket-dto-out';
import { SupportTicketApiService } from '../../../core/support/support-ticket.service';
import { UserTicketsListComponent } from './user-tickets-list.component';

// Iter-60 P0 #8 — /support/tickets/my-tickets ported from legacy: server
// pagination, page-local search/status filtering, localStorage + URL filter
// persistence, rows deep-link into the public status view.
describe('UserTicketsListComponent', () => {
  let fixture: ComponentFixture<UserTicketsListComponent>;
  let host: HTMLElement;
  let ticketApi: { getMyTickets: jest.Mock };

  const PAGE: PageSupportTicketDtoOut = {
    totalElements: 12,
    totalPages: 2,
    number: 0,
    size: 10,
    content: [
      {
        id: 1,
        ticketReference: 'CIO-1',
        contactEmail: 'me@example.com',
        subject: 'Billing question',
        status: TicketStatus.OPEN,
        createdTime: '2026-09-02T09:00:00Z',
      },
      {
        id: 2,
        ticketReference: 'CIO-2',
        contactEmail: 'me@example.com',
        subject: 'Feature idea',
        status: TicketStatus.RESOLVED,
        createdTime: '2026-09-01T09:00:00Z',
      },
    ],
  };

  const debounceSettled = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
  };

  const setup = async (queryParams: Record<string, string> = {}): Promise<void> => {
    localStorage.clear();
    ticketApi = { getMyTickets: jest.fn().mockReturnValue(of(PAGE)) };

    await TestBed.configureTestingModule({
      imports: [
        UserTicketsListComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: SupportTicketApiService, useValue: ticketApi },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
      ],
    }).compileComponents();

    jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(UserTicketsListComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  afterEach(() => {
    localStorage.clear();
  });

  it('loads the first page newest-first and renders rows with status chips', async () => {
    await setup();
    expect(ticketApi.getMyTickets).toHaveBeenCalledWith(0, 10);
    const rows = host.querySelectorAll('[data-testid^="my-ticket-row-"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('CIO-1');
    expect(rows[0].textContent).toContain('support.tickets.status.open');
    expect(rows[1].textContent).toContain('support.tickets.status.resolved');
  });

  it('filters the current page client-side by debounced search', async () => {
    await setup();
    fixture.componentInstance.filterForm.controls.searchQuery.setValue('billing');
    await debounceSettled();

    const rows = host.querySelectorAll('[data-testid^="my-ticket-row-"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Billing question');
    // Server not re-queried — legacy filters the loaded page only.
    expect(ticketApi.getMyTickets).toHaveBeenCalledTimes(1);
  });

  it('filters by status and persists the choice', async () => {
    await setup();
    fixture.componentInstance.filterForm.controls.status.setValue(TicketStatus.RESOLVED);
    fixture.detectChanges();

    const rows = host.querySelectorAll('[data-testid^="my-ticket-row-"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Feature idea');

    const stored = JSON.parse(localStorage.getItem('user-tickets-filters') ?? '{}');
    expect(stored.status).toBe(TicketStatus.RESOLVED);
  });

  it('restores filters from the URL over localStorage', async () => {
    localStorage.setItem(
      'user-tickets-filters',
      JSON.stringify({ searchQuery: 'stale', status: null, page: 3, size: 25 }),
    );
    await setup({ search: 'billing', page: '1', size: '5' });

    expect(fixture.componentInstance.filterForm.getRawValue().searchQuery).toBe('billing');
    expect(fixture.componentInstance.pageIndex()).toBe(1);
    expect(fixture.componentInstance.pageSize()).toBe(5);
    expect(ticketApi.getMyTickets).toHaveBeenCalledWith(1, 5);
  });

  it('re-queries the server on page change', async () => {
    await setup();
    fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 25, length: 12 });
    expect(ticketApi.getMyTickets).toHaveBeenLastCalledWith(1, 25);
  });

  it('deep-links a row into the public status view with the ticket pair', async () => {
    await setup();
    const navigate = TestBed.inject(Router).navigate as jest.Mock;

    (host.querySelector('[data-testid="my-ticket-row-1"]') as HTMLTableRowElement).click();

    expect(navigate).toHaveBeenCalledWith(['/support/tickets/status'], {
      queryParams: { ref: 'CIO-1', email: 'me@example.com' },
    });
  });

  it('deep-links a row into the public status view on Enter (keyboard a11y)', async () => {
    await setup();
    const navigate = TestBed.inject(Router).navigate as jest.Mock;

    (host.querySelector('[data-testid="my-ticket-row-1"]') as HTMLTableRowElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(navigate).toHaveBeenCalledWith(['/support/tickets/status'], {
      queryParams: { ref: 'CIO-1', email: 'me@example.com' },
    });
  });

  it('shows the empty state when the page has no tickets', async () => {
    localStorage.clear();
    ticketApi = { getMyTickets: jest.fn().mockReturnValue(of({ totalElements: 0, content: [] })) };
    await TestBed.configureTestingModule({
      imports: [
        UserTicketsListComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: SupportTicketApiService, useValue: ticketApi },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UserTicketsListComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="my-tickets-empty"]')).toBeTruthy();
  });

  it('shows the retry error state on load failure', async () => {
    localStorage.clear();
    ticketApi = { getMyTickets: jest.fn().mockReturnValue(throwError(() => new Error('500'))) };
    await TestBed.configureTestingModule({
      imports: [
        UserTicketsListComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: SupportTicketApiService, useValue: ticketApi },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UserTicketsListComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="my-tickets-error"]')?.textContent).toContain(
      'support.tickets.my.retrieve.failed',
    );
  });
});
