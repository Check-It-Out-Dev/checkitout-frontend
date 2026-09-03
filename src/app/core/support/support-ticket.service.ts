import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SupportTicketControllerService as GeneratedSupportTicketService } from '../../api/api/support-ticket-controller.api';
import { TicketCategory } from '../../api/model/ticket-category';
import { TicketStatus } from '../../api/model/ticket-status';
import type { PageSupportTicketDtoOut } from '../../api/model/page-support-ticket-dto-out';
import type { AdminTicketResponseDtoIn } from '../../api/model/admin-ticket-response-dto-in';
import type { SupportTicketDtoIn } from '../../api/model/support-ticket-dto-in';
import type { SupportTicketDtoOut } from '../../api/model/support-ticket-dto-out';
import type { TicketAttachmentDtoIn } from '../../api/model/ticket-attachment-dto-in';
import type { TicketAttachmentDtoOut } from '../../api/model/ticket-attachment-dto-out';
import type { TicketResponseDtoIn } from '../../api/model/ticket-response-dto-in';
import type { TicketResponseDtoOut } from '../../api/model/ticket-response-dto-out';

/**
 * Ticket-category select options — the same nine categories and label keys
 * legacy hard-coded in its SupportTicketService, but the values come from
 * the generated enum so a BE category change breaks the build, not prod.
 */
export const TICKET_CATEGORY_OPTIONS: readonly {
  readonly labelKey: string;
  readonly value: TicketCategory;
}[] = [
  { labelKey: 'support.tickets.category.accountIssue', value: TicketCategory.ACCOUNT_ISSUE },
  { labelKey: 'support.tickets.category.billingPayment', value: TicketCategory.BILLING_PAYMENT },
  {
    labelKey: 'support.tickets.category.technicalProblem',
    value: TicketCategory.TECHNICAL_PROBLEM,
  },
  { labelKey: 'support.tickets.category.featureRequest', value: TicketCategory.FEATURE_REQUEST },
  {
    labelKey: 'support.tickets.category.partnershipIssue',
    value: TicketCategory.PARTNERSHIP_ISSUE,
  },
  {
    labelKey: 'support.tickets.category.contentModeration',
    value: TicketCategory.CONTENT_MODERATION,
  },
  { labelKey: 'support.tickets.category.generalInquiry', value: TicketCategory.GENERAL_INQUIRY },
  {
    labelKey: 'support.tickets.category.earlyAccessInterest',
    value: TicketCategory.EARLY_ACCESS_INTEREST,
  },
  { labelKey: 'support.tickets.category.other', value: TicketCategory.OTHER },
];

export const TICKET_CATEGORY_LABEL_KEYS: Record<TicketCategory, string> = {
  [TicketCategory.ACCOUNT_ISSUE]: 'support.tickets.category.accountIssue',
  [TicketCategory.BILLING_PAYMENT]: 'support.tickets.category.billingPayment',
  [TicketCategory.TECHNICAL_PROBLEM]: 'support.tickets.category.technicalProblem',
  [TicketCategory.FEATURE_REQUEST]: 'support.tickets.category.featureRequest',
  [TicketCategory.PARTNERSHIP_ISSUE]: 'support.tickets.category.partnershipIssue',
  [TicketCategory.CONTENT_MODERATION]: 'support.tickets.category.contentModeration',
  [TicketCategory.GENERAL_INQUIRY]: 'support.tickets.category.generalInquiry',
  [TicketCategory.EARLY_ACCESS_INTEREST]: 'support.tickets.category.earlyAccessInterest',
  [TicketCategory.OTHER]: 'support.tickets.category.other',
};

/** Admin-view category chips — legacy's per-category palette. */
export const TICKET_CATEGORY_CHIP_CLASSES: Record<TicketCategory, string> = {
  [TicketCategory.ACCOUNT_ISSUE]: 'bg-indigo-100 text-indigo-800',
  [TicketCategory.BILLING_PAYMENT]: 'bg-pink-100 text-pink-800',
  [TicketCategory.TECHNICAL_PROBLEM]: 'bg-red-100 text-red-800',
  [TicketCategory.FEATURE_REQUEST]: 'bg-emerald-100 text-emerald-800',
  [TicketCategory.PARTNERSHIP_ISSUE]: 'bg-sky-100 text-sky-800',
  [TicketCategory.CONTENT_MODERATION]: 'bg-orange-100 text-orange-800',
  [TicketCategory.GENERAL_INQUIRY]: 'bg-gray-200 text-gray-700',
  [TicketCategory.EARLY_ACCESS_INTEREST]: 'bg-teal-100 text-teal-800',
  [TicketCategory.OTHER]: 'bg-gray-200 text-gray-700',
};

/** Admin list filter — mirrors the generated getTickets query surface. */
export interface AdminTicketListFilter {
  page: number;
  size: number;
  status?: TicketStatus | null;
  category?: TicketCategory | null;
  searchQuery?: string | null;
}

/** Status filter options — same five statuses and label keys as legacy. */
export const TICKET_STATUS_OPTIONS: readonly {
  readonly labelKey: string;
  readonly value: TicketStatus;
}[] = [
  { labelKey: 'support.tickets.status.open', value: TicketStatus.OPEN },
  { labelKey: 'support.tickets.status.inProgress', value: TicketStatus.IN_PROGRESS },
  {
    labelKey: 'support.tickets.status.waitingForCustomer',
    value: TicketStatus.WAITING_FOR_CUSTOMER,
  },
  { labelKey: 'support.tickets.status.resolved', value: TicketStatus.RESOLVED },
  { labelKey: 'support.tickets.status.closed', value: TicketStatus.CLOSED },
];

export const TICKET_STATUS_LABEL_KEYS: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'support.tickets.status.open',
  [TicketStatus.IN_PROGRESS]: 'support.tickets.status.inProgress',
  [TicketStatus.WAITING_FOR_CUSTOMER]: 'support.tickets.status.waitingForCustomer',
  [TicketStatus.RESOLVED]: 'support.tickets.status.resolved',
  [TicketStatus.CLOSED]: 'support.tickets.status.closed',
};

/** Same semantic palette as legacy (blue/amber/purple/green/gray). */
export const TICKET_STATUS_CHIP_CLASSES: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'bg-blue-100 text-blue-800',
  [TicketStatus.IN_PROGRESS]: 'bg-amber-100 text-amber-800',
  [TicketStatus.WAITING_FOR_CUSTOMER]: 'bg-purple-100 text-purple-800',
  [TicketStatus.RESOLVED]: 'bg-emerald-100 text-emerald-800',
  [TicketStatus.CLOSED]: 'bg-gray-200 text-gray-700',
};

/**
 * Thin typed wrapper around the generated support-ticket client — the only
 * place feature code may touch it (`check:api-wrappers` gate). Public
 * endpoints (create, status lookup) work anonymously; list/admin endpoints
 * ride the session cookie.
 */
@Injectable({ providedIn: 'root' })
export class SupportTicketApiService {
  private readonly api = inject(GeneratedSupportTicketService);

  /** POST /support/tickets — public; BE overrides contactEmail for authed users. */
  createTicket(dto: SupportTicketDtoIn): Observable<SupportTicketDtoOut> {
    return this.api.createTicket({ supportTicketDtoIn: dto });
  }

  /** POST /support/tickets/{id}/attachments — registers already-uploaded file metadata. */
  addTicketAttachments(
    ticketId: number,
    attachments: TicketAttachmentDtoIn[],
  ): Observable<TicketAttachmentDtoOut[]> {
    return this.api.addTicketAttachments({ ticketId, ticketAttachmentDtoIn: attachments });
  }

  /**
   * GET the authed user's tickets, newest first. Legacy's column-sort UI
   * never actually reached the BE (it reloaded page+size only), so the
   * port pins the one sort order users ever saw.
   */
  getMyTickets(page: number, size: number): Observable<PageSupportTicketDtoOut> {
    return this.api.getMyTickets({ pageable: { page, size, sort: ['createdTime,desc'] } });
  }

  /**
   * GET all tickets (admin) with server-side status/category/search
   * filtering, most-recently-updated first. The BE rejects non-admins
   * with 403 — legacy relied on that too (no FE role guard).
   */
  getTickets(filter: AdminTicketListFilter): Observable<PageSupportTicketDtoOut> {
    return this.api.getTickets({
      pageable: { page: filter.page, size: filter.size, sort: ['lastUpdateTime,desc'] },
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.searchQuery ? { searchQuery: filter.searchQuery } : {}),
    });
  }

  /** GET one ticket by id — owner or admin; admins also receive technicalDescription. */
  getTicketById(id: number): Observable<SupportTicketDtoOut> {
    return this.api.getTicketById({ id });
  }

  /** POST an admin reply; may carry a status transition + email toggle. */
  addAdminResponse(
    ticketId: number,
    dto: AdminTicketResponseDtoIn,
  ): Observable<TicketResponseDtoOut> {
    return this.api.addAdminResponse({ ticketId, adminTicketResponseDtoIn: dto });
  }

  /** GET by reference + contact email — the public status-lookup pair. */
  getTicketByReference(reference: string, email: string): Observable<SupportTicketDtoOut> {
    return this.api.getTicketByReference({ reference, email });
  }

  /**
   * GET by signed magic-link token — the one-click path from support emails.
   * The token itself is the authorization (HMAC-signed {ticketId, exp}), so
   * no reference/email is needed; invalid or expired tokens 401 (pentest
   * 3.2/3.3).
   */
  getTicketByAccessToken(token: string): Observable<SupportTicketDtoOut> {
    return this.api.getTicketByAccessToken({ token });
  }

  /** POST a customer reply, authorized by the same reference + email pair. */
  addCustomerResponse(
    reference: string,
    email: string,
    dto: TicketResponseDtoIn,
  ): Observable<TicketResponseDtoOut> {
    return this.api.addCustomerResponse({ reference, email, ticketResponseDtoIn: dto });
  }
}
