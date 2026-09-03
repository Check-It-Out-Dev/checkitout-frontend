import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SupportTicketControllerService as GeneratedSupportTicketService } from '../../api/api/support-ticket-controller.api';
import { TicketCategory } from '../../api/model/ticket-category';
import { SupportTicketApiService, TICKET_CATEGORY_OPTIONS } from './support-ticket.service';

describe('SupportTicketApiService', () => {
  let service: SupportTicketApiService;
  let generated: {
    createTicket: jest.Mock;
    addTicketAttachments: jest.Mock;
    getTicketByReference: jest.Mock;
    addCustomerResponse: jest.Mock;
    getMyTickets: jest.Mock;
    getTickets: jest.Mock;
    getTicketById: jest.Mock;
    addAdminResponse: jest.Mock;
  };

  beforeEach(() => {
    generated = {
      createTicket: jest.fn().mockReturnValue(of({ id: 1 })),
      addTicketAttachments: jest.fn().mockReturnValue(of([])),
      getTicketByReference: jest.fn().mockReturnValue(of({ id: 1 })),
      addCustomerResponse: jest.fn().mockReturnValue(of({ id: 2 })),
      getMyTickets: jest.fn().mockReturnValue(of({ content: [] })),
      getTickets: jest.fn().mockReturnValue(of({ content: [] })),
      getTicketById: jest.fn().mockReturnValue(of({ id: 1 })),
      addAdminResponse: jest.fn().mockReturnValue(of({ id: 3 })),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: GeneratedSupportTicketService, useValue: generated }],
    });
    service = TestBed.inject(SupportTicketApiService);
  });

  it('wraps createTicket with the generated request-params shape', () => {
    const dto = {
      contactEmail: 'a@b.c',
      subject: 's',
      description: 'd',
      category: TicketCategory.OTHER,
    };
    service.createTicket(dto).subscribe();
    expect(generated.createTicket).toHaveBeenCalledWith({ supportTicketDtoIn: dto });
  });

  it('wraps addTicketAttachments with ticketId + dto list', () => {
    const attachments = [{ uploadId: 'upload-log-txt' }];
    service.addTicketAttachments(7, attachments).subscribe();
    expect(generated.addTicketAttachments).toHaveBeenCalledWith({
      ticketId: 7,
      ticketAttachmentDtoIn: attachments,
    });
  });

  it('pins my-tickets to newest-first server sorting', () => {
    service.getMyTickets(2, 25).subscribe();
    expect(generated.getMyTickets).toHaveBeenCalledWith({
      pageable: { page: 2, size: 25, sort: ['createdTime,desc'] },
    });
  });

  it('sends only present admin filters, pinned to lastUpdateTime,desc', () => {
    service
      .getTickets({ page: 1, size: 25, status: null, category: null, searchQuery: 'x' })
      .subscribe();
    expect(generated.getTickets).toHaveBeenCalledWith({
      pageable: { page: 1, size: 25, sort: ['lastUpdateTime,desc'] },
      searchQuery: 'x',
    });
  });

  it('wraps the admin getById + admin responses', () => {
    service.getTicketById(7).subscribe();
    expect(generated.getTicketById).toHaveBeenCalledWith({ id: 7 });

    const dto = { content: 'hi', adminName: 'Ola', sendEmail: true };
    service.addAdminResponse(7, dto).subscribe();
    expect(generated.addAdminResponse).toHaveBeenCalledWith({
      ticketId: 7,
      adminTicketResponseDtoIn: dto,
    });
  });

  it('wraps the status-lookup pair and customer responses', () => {
    service.getTicketByReference('CIO-1', 'a@b.c').subscribe();
    expect(generated.getTicketByReference).toHaveBeenCalledWith({
      reference: 'CIO-1',
      email: 'a@b.c',
    });

    service.addCustomerResponse('CIO-1', 'a@b.c', { content: 'hi' }).subscribe();
    expect(generated.addCustomerResponse).toHaveBeenCalledWith({
      reference: 'CIO-1',
      email: 'a@b.c',
      ticketResponseDtoIn: { content: 'hi' },
    });
  });

  it('exposes all nine legacy categories with generated enum values', () => {
    expect(TICKET_CATEGORY_OPTIONS.length).toBe(9);
    expect(TICKET_CATEGORY_OPTIONS.map((o) => o.value)).toEqual(
      expect.arrayContaining(Object.values(TicketCategory)),
    );
  });
});
