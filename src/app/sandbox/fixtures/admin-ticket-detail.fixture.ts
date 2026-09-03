import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { TicketCategory } from '../../api/model/ticket-category';
import { TicketStatus } from '../../api/model/ticket-status';
import type { SupportTicketDtoOut } from '../../api/model/support-ticket-dto-out';
import { SupportTicketApiService } from '../../core/support/support-ticket.service';
import { AdminTicketDetailComponent } from '../../feature/support/admin-ticket-detail/admin-ticket-detail.component';
import type { SandboxFixture } from '../sandbox-registry';

const TICKET: SupportTicketDtoOut = {
  id: 42,
  ticketReference: 'CIO-20260902-0042',
  contactEmail: 'anna.kowalska@example.com',
  subject: 'Application error while publishing a campaign',
  description:
    'The page showed a generic error right after I clicked publish.\nThe campaign draft seems saved but never went live.',
  technicalDescription:
    '=== ERROR DETAILS ===\nTimestamp: 2026-09-02T09:14:03Z\nError type: HttpErrorResponse\nError message: Internal Server Error\nTrace ID: req-8f3a2c\nStatus code: 500\nAPI path: /api/partnership-opportunities\n\n=== BROWSER INFORMATION ===\nUser agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\nLanguage: pl-PL\nScreen resolution: 2560x1440\nTimezone: Europe/Warsaw',
  status: TicketStatus.IN_PROGRESS,
  category: TicketCategory.TECHNICAL_PROBLEM,
  createdTime: '2026-09-02T09:15:00Z',
  lastUpdateTime: '2026-09-02T11:00:00Z',
  adminAssignee: 'Ola',
  responses: [
    {
      id: 1,
      content: 'Thanks — we found the trace and are reproducing it now.',
      fromAdmin: true,
      adminName: 'Ola',
      createdTime: '2026-09-02T10:00:00Z',
    },
    {
      id: 2,
      content: 'Great, let me know if you need anything else from me.',
      fromAdmin: false,
      createdTime: '2026-09-02T12:30:00Z',
    },
  ],
};

export const ADMIN_TICKET_DETAIL_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'admin-ticket-detail',
    label: 'Admin ticket detail · technical dump + reply form (iter-62 P0 #8)',
    component: AdminTicketDetailComponent,
    providers: [
      { provide: SupportTicketApiService, useValue: { getTicketById: () => of(TICKET) } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: new Map([['id', '42']]) } },
      },
    ],
    viewport: { width: 1280, height: 2200 },
  },
];
