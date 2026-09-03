import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { PageSupportTicketDtoOut } from '../../../api/model/page-support-ticket-dto-out';
import { SupportTicketApiService } from '../../../core/support/support-ticket.service';
import { AdminTicketsListComponent } from './admin-tickets-list.component';

// Iter-61 P0 #8 — /support/admin/tickets ported from legacy: server-side
// status/category/search filtering, client-side show-closed toggle,
// localStorage + URL persistence, rows open the admin detail.
describe('AdminTicketsListComponent', () => {
  let fixture: ComponentFixture<AdminTicketsListComponent>;
  let host: HTMLElement;
  let ticketApi: { getTickets: jest.Mock };

  const PAGE: PageSupportTicketDtoOut = {
    totalElements: 3,
    totalPages: 1,
    number: 0,
    size: 10,
    content: [
      {
        id: 11,
        ticketReference: 'CIO-11',
        subject: 'Card declined',
        status: TicketStatus.OPEN,
        category: TicketCategory.BILLING_PAYMENT,
        createdTime: '2026-09-02T09:00:00Z',
        lastUpdateTime: '2026-09-02T09:00:00Z',
      },
      {
        id: 12,
        ticketReference: 'CIO-12',
        subject: 'Feature wish',
        status: TicketStatus.CLOSED,
        category: TicketCategory.FEATURE_REQUEST,
        createdTime: '2026-09-01T09:00:00Z',
        lastUpdateTime: '2026-09-01T09:00:00Z',
      },
      {
        id: 13,
        ticketReference: 'CIO-13',
        subject: 'OAuth broken',
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.TECHNICAL_PROBLEM,
        createdTime: '2026-09-02T09:00:00Z',
        lastUpdateTime: '2026-09-02T09:00:00Z',
      },
    ],
  };

  const setup = async (queryParams: Record<string, string> = {}): Promise<void> => {
    localStorage.clear();
    ticketApi = { getTickets: jest.fn().mockReturnValue(of(PAGE)) };

    await TestBed.configureTestingModule({
      imports: [
        AdminTicketsListComponent,
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

    fixture = TestBed.createComponent(AdminTicketsListComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  afterEach(() => {
    localStorage.clear();
  });

  it('loads the queue and hides CLOSED rows by default (legacy client-side rule)', async () => {
    await setup();
    expect(ticketApi.getTickets).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      status: null,
      category: null,
      searchQuery: null,
    });
    const rows = host.querySelectorAll('[data-testid^="admin-ticket-row-"]');
    expect(rows.length).toBe(2);
    expect(host.textContent).not.toContain('CIO-12');
  });

  it('reveals CLOSED rows via the toggle without a server round-trip', async () => {
    await setup();
    fixture.componentInstance.toggleShowClosed(true);
    fixture.detectChanges();

    expect(host.querySelectorAll('[data-testid^="admin-ticket-row-"]').length).toBe(3);
    expect(ticketApi.getTickets).toHaveBeenCalledTimes(1);
  });

  it('sends status/category/search filters to the server and resets the page', async () => {
    await setup();
    fixture.componentInstance.pageIndex.set(2);
    fixture.componentInstance.filterForm.controls.category.setValue(
      TicketCategory.TECHNICAL_PROBLEM,
    );

    expect(ticketApi.getTickets).toHaveBeenLastCalledWith({
      page: 0,
      size: 10,
      status: null,
      category: TicketCategory.TECHNICAL_PROBLEM,
      searchQuery: null,
    });
    expect(fixture.componentInstance.pageIndex()).toBe(0);
  });

  it('renders per-category chips with the legacy palette', async () => {
    await setup();
    const billingChip = host.querySelector('[data-testid="admin-ticket-row-11"] .bg-pink-100');
    expect(billingChip?.textContent).toContain('support.tickets.category.billingPayment');
  });

  it('restores filters from URL params over localStorage', async () => {
    localStorage.setItem(
      'admin-tickets-filters',
      JSON.stringify({ searchQuery: 'stale', page: 4 }),
    );
    await setup({ search: 'oauth', status: TicketStatus.IN_PROGRESS, showClosed: 'true' });

    expect(fixture.componentInstance.filterForm.getRawValue().searchQuery).toBe('oauth');
    expect(fixture.componentInstance.showClosedTickets()).toBe(true);
    expect(ticketApi.getTickets).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      status: TicketStatus.IN_PROGRESS,
      category: null,
      searchQuery: 'oauth',
    });
  });

  it('opens the admin detail on row click', async () => {
    await setup();
    const navigate = TestBed.inject(Router).navigate as jest.Mock;
    (host.querySelector('[data-testid="admin-ticket-row-11"]') as HTMLTableRowElement).click();
    expect(navigate).toHaveBeenCalledWith(['/support/admin/tickets', 11]);
  });

  it('opens the admin detail on row Enter (keyboard a11y)', async () => {
    await setup();
    const navigate = TestBed.inject(Router).navigate as jest.Mock;
    (
      host.querySelector('[data-testid="admin-ticket-row-11"]') as HTMLTableRowElement
    ).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navigate).toHaveBeenCalledWith(['/support/admin/tickets', 11]);
  });

  it('shows the retry error state on load failure (e.g. non-admin 403)', async () => {
    localStorage.clear();
    ticketApi = { getTickets: jest.fn().mockReturnValue(throwError(() => new Error('403'))) };
    await TestBed.configureTestingModule({
      imports: [
        AdminTicketsListComponent,
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
    fixture = TestBed.createComponent(AdminTicketsListComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="admin-tickets-error"]')?.textContent).toContain(
      'support.admin.tickets.retrieve.failed',
    );
  });
});
