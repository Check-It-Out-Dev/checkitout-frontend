import { of } from 'rxjs';
import { TicketStatus } from '../../api/model/ticket-status';
import type { PageSupportTicketDtoOut } from '../../api/model/page-support-ticket-dto-out';
import { SupportTicketApiService } from '../../core/support/support-ticket.service';
import { UserTicketsListComponent } from '../../feature/support/user-tickets-list/user-tickets-list.component';
import type { SandboxFixture } from '../sandbox-registry';

const PAGE: PageSupportTicketDtoOut = {
  totalElements: 4,
  totalPages: 1,
  number: 0,
  size: 10,
  content: [
    {
      id: 1,
      ticketReference: 'CIO-20260902-0101',
      contactEmail: 'anna.kowalska@example.com',
      subject: 'Payment declined on upgrade',
      status: TicketStatus.IN_PROGRESS,
      createdTime: '2026-09-02T09:00:00Z',
    },
    {
      id: 2,
      ticketReference: 'CIO-20260901-0092',
      contactEmail: 'anna.kowalska@example.com',
      subject: 'Instagram account not linking',
      status: TicketStatus.WAITING_FOR_CUSTOMER,
      createdTime: '2026-09-01T14:20:00Z',
    },
    {
      id: 3,
      ticketReference: 'CIO-20260901-0077',
      contactEmail: 'anna.kowalska@example.com',
      subject: 'Invoice for May missing',
      status: TicketStatus.RESOLVED,
      createdTime: '2026-09-01T11:05:00Z',
    },
    {
      id: 4,
      ticketReference: 'CIO-20260611-0048',
      contactEmail: 'anna.kowalska@example.com',
      subject: 'How do I archive a campaign?',
      status: TicketStatus.CLOSED,
      createdTime: '2026-06-11T08:45:00Z',
    },
  ],
};

export const USER_TICKETS_LIST_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'my-tickets-loaded',
    label: 'My tickets · 4 rows, all chip colors (iter-60 P0 #8)',
    component: UserTicketsListComponent,
    providers: [{ provide: SupportTicketApiService, useValue: { getMyTickets: () => of(PAGE) } }],
    viewport: { width: 1280, height: 900 },
  },
  {
    id: 'my-tickets-empty',
    label: 'My tickets · empty state (iter-60 P0 #8)',
    component: UserTicketsListComponent,
    providers: [
      {
        provide: SupportTicketApiService,
        useValue: { getMyTickets: () => of({ totalElements: 0, content: [] }) },
      },
    ],
    viewport: { width: 1280, height: 700 },
  },
];
