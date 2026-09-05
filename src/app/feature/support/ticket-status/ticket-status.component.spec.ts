import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { SupportTicketDtoOut } from '../../../api/model/support-ticket-dto-out';
import { SupportTicketApiService } from '../../../core/support/support-ticket.service';
import { TicketStatusComponent } from './ticket-status.component';

// Iter-59 P0 #8 — /support/tickets/status ported from legacy: lookup by
// reference+email, detail with conversation thread, customer reply that
// refreshes the whole thread, closed/resolved tickets are read-only.
describe('TicketStatusComponent', () => {
  let fixture: ComponentFixture<TicketStatusComponent>;
  let host: HTMLElement;
  let ticketApi: {
    getTicketByReference: jest.Mock;
    getTicketByAccessToken: jest.Mock;
    addCustomerResponse: jest.Mock;
  };

  const TICKET: SupportTicketDtoOut = {
    id: 42,
    ticketReference: 'CIO-20260902-0042',
    contactEmail: 'anon@example.com',
    subject: 'Payment declined',
    description: 'My card was declined twice.',
    status: TicketStatus.IN_PROGRESS,
    category: TicketCategory.BILLING_PAYMENT,
    createdTime: '2026-09-02T09:00:00Z',
    lastUpdateTime: '2026-09-02T10:00:00Z',
    responses: [
      {
        id: 1,
        content: 'We are looking into it.',
        fromAdmin: true,
        adminName: 'Ola',
        createdTime: '2026-09-02T10:00:00Z',
      },
      { id: 2, content: 'Thanks!', fromAdmin: false, createdTime: '2026-09-02T11:00:00Z' },
    ],
    attachments: [
      {
        id: 9,
        fileName: 'receipt.pdf',
        contentType: 'application/pdf',
        fileSize: 52224,
        downloadUrl: 'https://storage.example/receipt.pdf',
      },
    ],
  };

  const setup = async (queryParams: Record<string, string> = {}): Promise<void> => {
    // Safe defaults — ngOnInit may auto-lookup before a test overrides them.
    ticketApi = {
      getTicketByReference: jest.fn().mockReturnValue(of(TICKET)),
      getTicketByAccessToken: jest.fn().mockReturnValue(of(TICKET)),
      addCustomerResponse: jest.fn().mockReturnValue(of({ id: 99 })),
    };

    await TestBed.configureTestingModule({
      imports: [
        TicketStatusComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()), // marketing toolbar → SessionStateService → HttpClient
        { provide: SupportTicketApiService, useValue: ticketApi },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
      ],
    }).compileComponents();

    // The URL-mirroring navigate() would hit the real router; stub it.
    jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(TicketStatusComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  it('shows the lookup form by default', async () => {
    await setup();
    expect(host.querySelector('[data-testid="ticket-lookup-form"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="ticket-status-detail"]')).toBeNull();
  });

  it('looks the ticket up and renders detail, thread and attachments', async () => {
    await setup();
    ticketApi.getTicketByReference.mockReturnValue(of(TICKET));

    fixture.componentInstance.lookupForm.setValue({
      reference: 'CIO-20260902-0042',
      email: 'anon@example.com',
    });
    fixture.componentInstance.lookupTicket();
    fixture.detectChanges();

    expect(ticketApi.getTicketByReference).toHaveBeenCalledWith(
      'CIO-20260902-0042',
      'anon@example.com',
    );
    expect(host.querySelector('[data-testid="ticket-status-detail"]')).toBeTruthy();
    expect(host.textContent).toContain('Payment declined');
    expect(host.textContent).toContain('support.tickets.status.inProgress');
    expect(host.textContent).toContain('Ola');
    expect(host.textContent).toContain('receipt.pdf');
    expect(host.textContent).toContain('51.0 KB');
    expect(host.querySelector('[data-testid="ticket-response-form"]')).toBeTruthy();
  });

  it('auto-looks-up from ?ref&email query params (create-page deep link)', async () => {
    await setup({ ref: 'CIO-1', email: 'anon@example.com' });

    expect(fixture.componentInstance.lookupForm.getRawValue()).toEqual({
      reference: 'CIO-1',
      email: 'anon@example.com',
    });
    expect(ticketApi.getTicketByReference).toHaveBeenCalledWith('CIO-1', 'anon@example.com');
    expect(host.querySelector('[data-testid="ticket-status-detail"]')).toBeTruthy();
  });

  it('auto-opens from a ?token magic link without reference+email', async () => {
    await setup({ token: 'signed-token', ref: 'CIO-20260902-0042' });

    expect(ticketApi.getTicketByAccessToken).toHaveBeenCalledWith('signed-token');
    expect(ticketApi.getTicketByReference).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="ticket-status-detail"]')).toBeTruthy();
    expect(host.textContent).toContain('Payment declined');
  });

  it('falls back to the lookup form (ref prefilled) when the token is expired', async () => {
    ticketApi = {
      getTicketByReference: jest.fn().mockReturnValue(of(TICKET)),
      getTicketByAccessToken: jest.fn().mockReturnValue(throwError(() => new Error('401'))),
      addCustomerResponse: jest.fn().mockReturnValue(of({ id: 99 })),
    };
    await TestBed.configureTestingModule({
      imports: [
        TicketStatusComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()), // marketing toolbar → SessionStateService → HttpClient
        { provide: SupportTicketApiService, useValue: ticketApi },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: { token: 'bad', ref: 'CIO-9' } } },
        },
      ],
    }).compileComponents();
    jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(TicketStatusComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ticket-status-error"]')?.textContent).toContain(
      'support.tickets.status.errors.link_expired',
    );
    expect(host.querySelector('[data-testid="ticket-lookup-form"]')).toBeTruthy();
    expect(fixture.componentInstance.lookupForm.getRawValue().reference).toBe('CIO-9');
  });

  it('shows not-found on lookup failure and keeps the form', async () => {
    await setup();
    ticketApi.getTicketByReference.mockReturnValue(throwError(() => new Error('404')));

    fixture.componentInstance.lookupForm.setValue({ reference: 'X', email: 'a@b.c' });
    fixture.componentInstance.lookupTicket();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ticket-status-error"]')?.textContent).toContain(
      'support.tickets.status.errors.ticket_not_found',
    );
    expect(host.querySelector('[data-testid="ticket-lookup-form"]')).toBeTruthy();
  });

  it('submits a reply with the reference+email pair and refreshes the thread', async () => {
    await setup();
    ticketApi.getTicketByReference.mockReturnValue(of(TICKET));
    fixture.componentInstance.lookupForm.setValue({
      reference: 'CIO-20260902-0042',
      email: 'anon@example.com',
    });
    fixture.componentInstance.lookupTicket();

    const refreshed = {
      ...TICKET,
      responses: [
        ...(TICKET.responses ?? []),
        { id: 3, content: 'One more thing', fromAdmin: false },
      ],
    };
    ticketApi.addCustomerResponse.mockReturnValue(of({ id: 3 }));
    ticketApi.getTicketByReference.mockReturnValue(of(refreshed));

    fixture.componentInstance.responseForm.setValue({ content: 'One more thing' });
    fixture.componentInstance.submitResponse();
    fixture.detectChanges();

    expect(ticketApi.addCustomerResponse).toHaveBeenCalledWith(
      'CIO-20260902-0042',
      'anon@example.com',
      { content: 'One more thing' },
    );
    expect(host.textContent).toContain('One more thing');
    expect(fixture.componentInstance.responseForm.getRawValue().content).toBe('');
  });

  it('hides the reply form and shows the closed notice for RESOLVED tickets', async () => {
    await setup();
    ticketApi.getTicketByReference.mockReturnValue(
      of({ ...TICKET, status: TicketStatus.RESOLVED }),
    );
    fixture.componentInstance.lookupForm.setValue({ reference: 'R', email: 'a@b.c' });
    fixture.componentInstance.lookupTicket();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ticket-response-form"]')).toBeNull();
    expect(host.querySelector('[data-testid="ticket-closed-notice"]')).toBeTruthy();
  });

  it('returns to the lookup form via back', async () => {
    await setup();
    ticketApi.getTicketByReference.mockReturnValue(of(TICKET));
    fixture.componentInstance.lookupForm.setValue({ reference: 'R', email: 'a@b.c' });
    fixture.componentInstance.lookupTicket();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="ticket-status-detail"]')).toBeTruthy();

    (host.querySelector('[data-testid="ticket-status-back"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ticket-lookup-form"]')).toBeTruthy();
  });

  it('maps every status to a label key and chip class', async () => {
    await setup();
    const cmp = fixture.componentInstance;
    for (const status of Object.values(TicketStatus)) {
      expect(cmp.statusLabelKey(status)).toMatch(/^support\.tickets\.status\./);
      expect(cmp.statusChipClass(status)).toContain('bg-');
    }
    expect(cmp.statusLabelKey(undefined)).toBe('support.tickets.status.open');
  });
});
