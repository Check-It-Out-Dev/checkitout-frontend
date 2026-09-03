import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import type { UserDtoOut } from '../../../api/model/user-dto-out';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { SupportTicketApiService } from '../../../core/support/support-ticket.service';
import { CreateTicketComponent } from './create-ticket.component';

// Iter-58a P0 #8 — /support/tickets/create ported from legacy (form +
// error-interceptor autofill + success panel; attachments follow in the
// upload slice). SessionStateService and the core wrapper are stubbed.
describe('CreateTicketComponent', () => {
  let fixture: ComponentFixture<CreateTicketComponent>;
  let host: HTMLElement;
  let ticketApi: { createTicket: jest.Mock; addTicketAttachments: jest.Mock };
  let sessionUser: ReturnType<typeof signal<UserDtoOut | null>>;
  let sessionProbed: ReturnType<typeof signal<boolean>>;

  const setup = async (queryParams: Record<string, string> = {}): Promise<void> => {
    ticketApi = {
      createTicket: jest.fn(),
      addTicketAttachments: jest.fn(),
    };
    sessionUser = signal<UserDtoOut | null>(null);
    sessionProbed = signal(true);

    await TestBed.configureTestingModule({
      imports: [
        CreateTicketComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: SupportTicketApiService, useValue: ticketApi },
        {
          provide: SessionStateService,
          useValue: {
            user: sessionUser,
            probed: sessionProbed,
            probe: jest.fn(() => of(null)),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateTicketComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  it('renders the anonymous form with an editable email and the guidance card', async () => {
    await setup();
    expect(host.querySelector('[data-testid="create-ticket-email"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="create-ticket-anonymous-warning"]')).toBeTruthy();
    expect(host.textContent).toContain('support@checkitout.app');
  });

  it('shows the authed email read-only and prefills the control', async () => {
    await setup();
    sessionUser.set({ email: 'norbert@checkitout.app' } as UserDtoOut);
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(
      host.querySelector('[data-testid="create-ticket-email-readonly"]')?.textContent,
    ).toContain('norbert@checkitout.app');
    expect(host.querySelector('[data-testid="create-ticket-anonymous-warning"]')).toBeNull();
    expect(fixture.componentInstance.form.getRawValue().contactEmail).toBe(
      'norbert@checkitout.app',
    );
  });

  it('submits the DTO and shows the success panel with the reference', async () => {
    await setup();
    ticketApi.createTicket.mockReturnValue(of({ id: 7, ticketReference: 'TICK-2026-0007' }));

    fixture.componentInstance.form.setValue({
      contactEmail: 'anon@example.com',
      subject: 'Broken page',
      description: 'It exploded.',
      category: TicketCategory.TECHNICAL_PROBLEM,
    });
    fixture.componentInstance.submitTicket();
    fixture.detectChanges();

    expect(ticketApi.createTicket).toHaveBeenCalledWith({
      contactEmail: 'anon@example.com',
      subject: 'Broken page',
      description: 'It exploded.',
      category: TicketCategory.TECHNICAL_PROBLEM,
    });
    expect(host.querySelector('[data-testid="ticket-reference"]')?.textContent).toContain(
      'TICK-2026-0007',
    );
    expect(host.querySelector('[data-testid="create-ticket-form"]')).toBeNull();
  });

  it('keeps the form and shows the error alert when creation fails', async () => {
    await setup();
    ticketApi.createTicket.mockReturnValue(throwError(() => new Error('boom')));

    fixture.componentInstance.form.setValue({
      contactEmail: 'anon@example.com',
      subject: 'x',
      description: 'y',
      category: TicketCategory.OTHER,
    });
    fixture.componentInstance.submitTicket();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="create-ticket-error"]')?.textContent).toContain(
      'support.tickets.create_error',
    );
    expect(host.querySelector('[data-testid="create-ticket-form"]')).toBeTruthy();
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('does not submit an invalid form', async () => {
    await setup();
    fixture.componentInstance.submitTicket();
    expect(ticketApi.createTicket).not.toHaveBeenCalled();
  });

  it('autofills a technical-problem report from the error deep link', async () => {
    const errorData = JSON.stringify({
      type: 'HttpErrorResponse',
      message: 'Internal Server Error',
      requestId: 'req-123',
      error: { status: 500, path: '/api/users/me' },
    });
    await setup({ errorData, subject: 'raw backend subject', timestamp: '2026-09-02T10:00:00Z' });

    const value = fixture.componentInstance.form.getRawValue();
    expect(value.category).toBe(TicketCategory.TECHNICAL_PROBLEM);
    expect(value.subject).toBe('support.error.application_error_subject');
    expect(value.description).toContain('2026-09-02T10:00:00Z');

    // The admin-only dump rides along on submit, capped at 100k chars.
    ticketApi.createTicket.mockReturnValue(of({ id: 1, ticketReference: 'R' }));
    fixture.componentInstance.form.patchValue({ contactEmail: 'anon@example.com' });
    fixture.componentInstance.submitTicket();
    const dto = ticketApi.createTicket.mock.calls[0][0];
    expect(dto.technicalDescription).toContain('req-123');
    expect(dto.technicalDescription).toContain('/api/users/me');
  });

  it('resets to a fresh form via create-another', async () => {
    await setup();
    ticketApi.createTicket.mockReturnValue(of({ id: 7, ticketReference: 'TICK-1' }));
    fixture.componentInstance.form.setValue({
      contactEmail: 'anon@example.com',
      subject: 's',
      description: 'd',
      category: TicketCategory.OTHER,
    });
    fixture.componentInstance.submitTicket();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="create-ticket-success"]')).toBeTruthy();

    (host.querySelector('[data-testid="create-ticket-another"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="create-ticket-form"]')).toBeTruthy();
    expect(fixture.componentInstance.form.getRawValue().subject).toBe('');
  });

  it('navigates to the status page with ref + email after success', async () => {
    await setup();
    const router = TestBed.inject(Router);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    ticketApi.createTicket.mockReturnValue(of({ id: 7, ticketReference: 'TICK-9' }));

    fixture.componentInstance.form.setValue({
      contactEmail: 'anon@example.com',
      subject: 's',
      description: 'd',
      category: TicketCategory.OTHER,
    });
    fixture.componentInstance.submitTicket();
    fixture.componentInstance.goToTicketStatus();

    expect(navigate).toHaveBeenCalledWith(['/support/tickets/status'], {
      queryParams: { ref: 'TICK-9', email: 'anon@example.com' },
    });
  });
});
