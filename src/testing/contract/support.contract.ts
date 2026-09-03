/**
 * L0 contract: SupportTicketApiService ↔ generated models. Compile-time
 * only; see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type {
  AdminTicketListFilter,
  SupportTicketApiService,
} from '../../app/core/support/support-ticket.service';
import type { AdminTicketResponseDtoIn } from '../../app/api/model/admin-ticket-response-dto-in';
import type { PageSupportTicketDtoOut } from '../../app/api/model/page-support-ticket-dto-out';
import type { SupportTicketDtoIn } from '../../app/api/model/support-ticket-dto-in';
import type { SupportTicketDtoOut } from '../../app/api/model/support-ticket-dto-out';
import type { TicketAttachmentDtoIn } from '../../app/api/model/ticket-attachment-dto-in';
import type { TicketAttachmentDtoOut } from '../../app/api/model/ticket-attachment-dto-out';
import type { TicketResponseDtoIn } from '../../app/api/model/ticket-response-dto-in';
import type { TicketResponseDtoOut } from '../../app/api/model/ticket-response-dto-out';
import type { Equal, Expect } from '../type-assert';

type _createTicket = Expect<
  Equal<
    SupportTicketApiService['createTicket'],
    (dto: SupportTicketDtoIn) => Observable<SupportTicketDtoOut>
  >
>;

type _addTicketAttachments = Expect<
  Equal<
    SupportTicketApiService['addTicketAttachments'],
    (ticketId: number, attachments: TicketAttachmentDtoIn[]) => Observable<TicketAttachmentDtoOut[]>
  >
>;

type _getMyTickets = Expect<
  Equal<
    SupportTicketApiService['getMyTickets'],
    (page: number, size: number) => Observable<PageSupportTicketDtoOut>
  >
>;

type _getTickets = Expect<
  Equal<
    SupportTicketApiService['getTickets'],
    (filter: AdminTicketListFilter) => Observable<PageSupportTicketDtoOut>
  >
>;

type _getTicketById = Expect<
  Equal<SupportTicketApiService['getTicketById'], (id: number) => Observable<SupportTicketDtoOut>>
>;

type _addAdminResponse = Expect<
  Equal<
    SupportTicketApiService['addAdminResponse'],
    (ticketId: number, dto: AdminTicketResponseDtoIn) => Observable<TicketResponseDtoOut>
  >
>;

type _getTicketByReference = Expect<
  Equal<
    SupportTicketApiService['getTicketByReference'],
    (reference: string, email: string) => Observable<SupportTicketDtoOut>
  >
>;

type _addCustomerResponse = Expect<
  Equal<
    SupportTicketApiService['addCustomerResponse'],
    (reference: string, email: string, dto: TicketResponseDtoIn) => Observable<TicketResponseDtoOut>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type SupportContract = [
  _createTicket,
  _addTicketAttachments,
  _getMyTickets,
  _getTickets,
  _getTicketById,
  _addAdminResponse,
  _getTicketByReference,
  _addCustomerResponse,
];
