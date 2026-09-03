import { of } from 'rxjs';
import { TicketCategory } from '../../api/model/ticket-category';
import { TicketStatus } from '../../api/model/ticket-status';
import type { PageSupportTicketDtoOut } from '../../api/model/page-support-ticket-dto-out';
import { SupportTicketApiService } from '../../core/support/support-ticket.service';
import { AdminTicketsListComponent } from '../../feature/support/admin-tickets-list/admin-tickets-list.component';
import type { SandboxFixture } from '../sandbox-registry';

const PAGE: PageSupportTicketDtoOut = {
  totalElements: 5,
  totalPages: 1,
  number: 0,
  size: 10,
  content: [
    {
      id: 11,
      ticketReference: 'CIO-20260902-0111',
      subject: 'Payment declined on upgrade',
      status: TicketStatus.OPEN,
      category: TicketCategory.BILLING_PAYMENT,
      createdTime: '2026-09-02T09:00:00Z',
      lastUpdateTime: '2026-09-02T08:30:00Z',
    },
    {
      id: 12,
      ticketReference: 'CIO-20260902-0104',
      subject: 'Instagram OAuth loop on Safari',
      status: TicketStatus.IN_PROGRESS,
      category: TicketCategory.TECHNICAL_PROBLEM,
      createdTime: '2026-09-02T10:00:00Z',
      lastUpdateTime: '2026-09-02T07:15:00Z',
    },
    {
      id: 13,
      ticketReference: 'CIO-20260901-0097',
      subject: 'Please add campaign duplication',
      status: TicketStatus.WAITING_FOR_CUSTOMER,
      category: TicketCategory.FEATURE_REQUEST,
      createdTime: '2026-09-01T12:00:00Z',
      lastUpdateTime: '2026-09-02T16:40:00Z',
    },
    {
      id: 14,
      ticketReference: 'CIO-20260901-0080',
      subject: 'Reported profile content',
      status: TicketStatus.RESOLVED,
      category: TicketCategory.CONTENT_MODERATION,
      createdTime: '2026-09-01T09:00:00Z',
      lastUpdateTime: '2026-09-02T11:00:00Z',
    },
    {
      id: 15,
      ticketReference: 'CIO-20260901-0061',
      subject: 'Cannot verify my company NIP',
      status: TicketStatus.OPEN,
      category: TicketCategory.ACCOUNT_ISSUE,
      createdTime: '2026-09-01T14:00:00Z',
      lastUpdateTime: '2026-09-01T09:20:00Z',
    },
  ],
};

export const ADMIN_TICKETS_LIST_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'admin-tickets-loaded',
    label: 'Admin tickets · queue with category+status chips (iter-61 P0 #8)',
    component: AdminTicketsListComponent,
    providers: [{ provide: SupportTicketApiService, useValue: { getTickets: () => of(PAGE) } }],
    viewport: { width: 1400, height: 1000 },
  },
];
