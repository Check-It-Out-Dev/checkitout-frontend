import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { TicketCategory } from '../../api/model/ticket-category';
import { TicketStatus } from '../../api/model/ticket-status';
import type { SupportTicketDtoOut } from '../../api/model/support-ticket-dto-out';
import { SupportTicketApiService } from '../../core/support/support-ticket.service';
import { TicketStatusComponent } from '../../feature/support/ticket-status/ticket-status.component';
import type { SandboxFixture } from '../sandbox-registry';

const TICKET: SupportTicketDtoOut = {
  id: 42,
  ticketReference: 'CIO-20260902-0042',
  contactEmail: 'anna.kowalska@example.com',
  subject: 'Payment declined on upgrade',
  description:
    'I tried to upgrade to the Business plan twice and my card was declined both times.\nThe bank says the charge was never attempted.',
  status: TicketStatus.IN_PROGRESS,
  category: TicketCategory.BILLING_PAYMENT,
  createdTime: '2026-09-02T09:00:00Z',
  lastUpdateTime: '2026-09-02T10:30:00Z',
  adminAssignee: 'Ola',
  responses: [
    {
      id: 1,
      content:
        'Thanks for the report — we can see the failed attempts and are checking with the payment provider.',
      fromAdmin: true,
      adminName: 'Ola',
      createdTime: '2026-09-02T10:15:00Z',
    },
    {
      id: 2,
      content: 'Great, thank you! Happy to retry whenever you say.',
      fromAdmin: false,
      createdTime: '2026-09-02T11:40:00Z',
    },
  ],
  attachments: [
    {
      id: 9,
      fileName: 'bank-statement-excerpt.pdf',
      contentType: 'application/pdf',
      fileSize: 52224,
      downloadUrl: 'https://storage.example/receipt.pdf',
    },
  ],
};

export const TICKET_STATUS_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'ticket-status-lookup',
    label: 'Ticket status · lookup form (iter-59 P0 #8)',
    component: TicketStatusComponent,
    viewport: { width: 1280, height: 900 },
  },
  {
    id: 'ticket-status-loaded',
    label: 'Ticket status · detail + thread + reply (iter-59 P0 #8)',
    component: TicketStatusComponent,
    providers: [
      {
        provide: SupportTicketApiService,
        useValue: { getTicketByReference: () => of(TICKET) },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParams: { ref: TICKET.ticketReference, email: TICKET.contactEmail },
          },
        },
      },
    ],
    viewport: { width: 1280, height: 1800 },
  },
];
