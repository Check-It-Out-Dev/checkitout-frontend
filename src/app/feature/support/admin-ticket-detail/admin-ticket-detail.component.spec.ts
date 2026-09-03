import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { SupportTicketDtoOut } from '../../../api/model/support-ticket-dto-out';
import type { UserDtoOut } from '../../../api/model/user-dto-out';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { SupportTicketApiService } from '../../../core/support/support-ticket.service';
import { AdminTicketDetailComponent } from './admin-ticket-detail.component';

// Iter-62 P0 #8 — /support/admin/tickets/:id ported from legacy: detail +
// admin-only technical dump + conversation + reply form with an optional
// status transition and email toggle; the thread refreshes from the server
// after each reply.
describe('AdminTicketDetailComponent', () => {
  let fixture: ComponentFixture<AdminTicketDetailComponent>;
  let host: HTMLElement;
  let ticketApi: { getTicketById: jest.Mock; addAdminResponse: jest.Mock };
  let sessionUser: ReturnType<typeof signal<UserDtoOut | null>>;

  const TICKET: SupportTicketDtoOut = {
    id: 42,
    ticketReference: 'CIO-20260902-0042',
    contactEmail: 'anon@example.com',
    subject: 'App crashed on submit',
    description: 'It exploded.',
    technicalDescription: '=== ERROR DETAILS ===\nstatus: 500\ntrace: req-123',
    status: TicketStatus.OPEN,
    category: TicketCategory.TECHNICAL_PROBLEM,
    createdTime: '2026-09-02T09:00:00Z',
    lastUpdateTime: '2026-09-02T10:00:00Z',
    responses: [
      { id: 1, content: 'First look done.', fromAdmin: true, adminName: 'Ola' },
      { id: 2, content: 'Still broken.', fromAdmin: false },
    ],
  };

  const setup = async (paramId: string | null = '42'): Promise<void> => {
    ticketApi = {
      getTicketById: jest.fn().mockReturnValue(of(TICKET)),
      addAdminResponse: jest.fn().mockReturnValue(of({ id: 3 })),
    };
    sessionUser = signal<UserDtoOut | null>({
      firstName: 'Norbert',
      lastName: 'Marchewka',
    } as UserDtoOut);

    await TestBed.configureTestingModule({
      imports: [
        AdminTicketDetailComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: SupportTicketApiService, useValue: ticketApi },
        { provide: SessionStateService, useValue: { user: sessionUser } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['id', paramId]]) } },
        },
      ],
    }).compileComponents();

    jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(AdminTicketDetailComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  it('loads the ticket from the route id and renders detail + thread', async () => {
    await setup();
    expect(ticketApi.getTicketById).toHaveBeenCalledWith(42);
    expect(host.textContent).toContain('App crashed on submit');
    expect(host.textContent).toContain('support.tickets.status.open');
    expect(host.textContent).toContain('Ola');
    expect(host.querySelector('[data-testid="admin-response-form"]')).toBeTruthy();
  });

  it('renders the admin-only technical dump panel', async () => {
    await setup();
    const panel = host.querySelector('[data-testid="admin-ticket-technical"]');
    expect(panel?.textContent).toContain('status: 500');
    expect(panel?.textContent).toContain('support.admin.ticket_detail.technical_description_note');
  });

  it('hides the dump panel when the BE sent none (non-admin shape)', async () => {
    await setup();
    ticketApi.getTicketById.mockReturnValue(of({ ...TICKET, technicalDescription: undefined }));
    fixture.componentInstance.loadTicket(42);
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="admin-ticket-technical"]')).toBeNull();
  });

  it('submits the reply with status transition, session admin name and email flag', async () => {
    await setup();
    const refreshed = { ...TICKET, status: TicketStatus.IN_PROGRESS };
    ticketApi.addAdminResponse.mockReturnValue(of({ id: 3 }));
    ticketApi.getTicketById.mockReturnValue(of(refreshed));

    fixture.componentInstance.responseForm.setValue({
      content: 'We shipped a fix.',
      newStatus: TicketStatus.IN_PROGRESS,
      sendEmail: false,
    });
    fixture.componentInstance.submitResponse();
    fixture.detectChanges();

    expect(ticketApi.addAdminResponse).toHaveBeenCalledWith(42, {
      content: 'We shipped a fix.',
      newStatus: TicketStatus.IN_PROGRESS,
      adminName: 'Norbert Marchewka',
      sendEmail: false,
    });
    expect(fixture.componentInstance.ticket()?.status).toBe(TicketStatus.IN_PROGRESS);
    expect(fixture.componentInstance.responseForm.getRawValue()).toEqual({
      content: '',
      newStatus: null,
      sendEmail: true,
    });
  });

  it('omits newStatus when none selected and falls back to Support Agent without a session', async () => {
    await setup();
    sessionUser.set(null);
    fixture.componentInstance.responseForm.patchValue({ content: 'Noted.' });
    fixture.componentInstance.submitResponse();

    expect(ticketApi.addAdminResponse).toHaveBeenCalledWith(42, {
      content: 'Noted.',
      adminName: 'Support Agent',
      sendEmail: true,
    });
  });

  it('shows the reply error and keeps the form on failure', async () => {
    await setup();
    ticketApi.addAdminResponse.mockReturnValue(throwError(() => new Error('500')));
    fixture.componentInstance.responseForm.patchValue({ content: 'x' });
    fixture.componentInstance.submitResponse();
    fixture.detectChanges();

    expect(host.textContent).toContain('support.tickets.submit_response_error');
    expect(fixture.componentInstance.responseForm.getRawValue().content).toBe('x');
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('shows not-found when the load fails', async () => {
    await setup();
    ticketApi.getTicketById.mockReturnValue(throwError(() => new Error('404')));
    fixture.componentInstance.loadTicket(99);
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="admin-ticket-error"]')?.textContent).toContain(
      'support.admin.ticket_detail.errors.ticket_not_found',
    );
  });

  it('redirects to the queue when the route id is missing', async () => {
    await setup(null);
    const navigate = TestBed.inject(Router).navigate as jest.Mock;
    expect(navigate).toHaveBeenCalledWith(['/support/admin/tickets']);
  });
});
