import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PartnershipOpportunityAPIService as GeneratedPartnershipApiService } from '../../api/api/partnership-opportunity-api.api';
import type { PagePartnershipOpportunityDtoOut } from '../../api/model/page-partnership-opportunity-dto-out';
import type { PartnershipOpportunityDtoIn } from '../../api/model/partnership-opportunity-dto-in';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { OpportunityApiService } from './opportunity.service';

describe('OpportunityApiService', () => {
  let service: OpportunityApiService;
  let api: {
    findPaginated7: jest.Mock;
    getById7: jest.Mock;
    create7: jest.Mock;
    patch7: jest.Mock;
  };

  beforeEach(() => {
    api = {
      findPaginated7: jest.fn(),
      getById7: jest.fn(),
      create7: jest.fn(),
      patch7: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        OpportunityApiService,
        { provide: GeneratedPartnershipApiService, useValue: api },
      ],
    });
    service = TestBed.inject(OpportunityApiService);
  });

  it('list() builds the pageable envelope with defaults', () => {
    const page = { content: [] } as unknown as PagePartnershipOpportunityDtoOut;
    api.findPaginated7.mockReturnValue(of(page));

    service.list(0, 20).subscribe();

    expect(api.findPaginated7).toHaveBeenCalledTimes(1);
    expect(api.findPaginated7).toHaveBeenCalledWith({
      pageable: { page: 0, size: 20, sort: ['createdTime,desc'] },
      filters: {},
    });
  });

  it('list() accepts custom filters + sort and forwards them', () => {
    api.findPaginated7.mockReturnValue(
      of({ content: [] } as unknown as PagePartnershipOpportunityDtoOut),
    );

    service
      .list(2, 50, { category: 'BEAUTY', status: 'ACTIVE' }, ['title,asc', 'createdTime,desc'])
      .subscribe();

    expect(api.findPaginated7).toHaveBeenCalledWith({
      pageable: { page: 2, size: 50, sort: ['title,asc', 'createdTime,desc'] },
      filters: { category: 'BEAUTY', status: 'ACTIVE' },
    });
  });

  it('list() clones the sort array (defensive — callers may mutate after call)', () => {
    api.findPaginated7.mockReturnValue(
      of({ content: [] } as unknown as PagePartnershipOpportunityDtoOut),
    );

    const sort = ['title,asc'];
    service.list(0, 20, {}, sort).subscribe();

    const passedSort = api.findPaginated7.mock.calls[0]?.[0]?.pageable?.sort;
    expect(passedSort).toEqual(sort);
    expect(passedSort).not.toBe(sort); // different reference (cloned)
  });

  it('getById(id) builds {id} envelope', () => {
    const detail = { id: 7 } as unknown as PartnershipOpportunityDtoOut;
    api.getById7.mockReturnValue(of(detail));

    let received: PartnershipOpportunityDtoOut | undefined;
    service.getById(7).subscribe((r) => (received = r));

    expect(api.getById7).toHaveBeenCalledWith({ id: 7 });
    expect(received).toBe(detail);
  });

  it('create(dto) wraps in partnershipOpportunityDtoIn envelope', () => {
    const dto = { name: 'Campaign' } as unknown as PartnershipOpportunityDtoIn;
    api.create7.mockReturnValue(of({} as PartnershipOpportunityDtoOut));

    service.create(dto).subscribe();

    expect(api.create7).toHaveBeenCalledWith({ partnershipOpportunityDtoIn: dto });
    expect(api.create7.mock.calls[0]?.[0]?.partnershipOpportunityDtoIn).toBe(dto);
  });

  it('patch(id, dto) wraps in {id, partnershipOpportunityDtoIn} envelope', () => {
    const dto = { name: 'Updated' } as unknown as PartnershipOpportunityDtoIn;
    api.patch7.mockReturnValue(of({} as PartnershipOpportunityDtoOut));

    service.patch(11, dto).subscribe();

    // Greenfield-branch spec types the PATCH body as an untyped map
    // (BaseController Map<String,Object>) — the wrapper passes the DTO
    // through as `requestBody`.
    expect(api.patch7).toHaveBeenCalledWith({ id: 11, requestBody: dto });
    expect(api.patch7.mock.calls[0]?.[0]?.requestBody).toBe(dto);
  });
});
