import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppliedOpportunityControllerService as GeneratedAppliedOpportunityApi } from '../../api/api/applied-opportunity-controller.api';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { RateStatus } from '../../api/model/rate-status';
import { AppliedOpportunityApiService } from './applied-opportunity.service';

describe('AppliedOpportunityApiService', () => {
  let service: AppliedOpportunityApiService;
  let api: {
    create11: jest.Mock;
    getById11: jest.Mock;
    findPaginated11: jest.Mock;
    getStatusHistory: jest.Mock;
    updateOpportunityStatus: jest.Mock;
    updateInfluencerRating: jest.Mock;
    updateCompanyRating: jest.Mock;
  };

  beforeEach(() => {
    api = {
      create11: jest.fn(),
      getById11: jest.fn(),
      findPaginated11: jest.fn(),
      getStatusHistory: jest.fn(),
      updateOpportunityStatus: jest.fn(),
      updateInfluencerRating: jest.fn(),
      updateCompanyRating: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        AppliedOpportunityApiService,
        { provide: GeneratedAppliedOpportunityApi, useValue: api },
      ],
    });
    service = TestBed.inject(AppliedOpportunityApiService);
  });

  it('apply(id) builds dto with ONLY partnershipOpportunity when no note', () => {
    api.create11.mockReturnValue(of({} as AppliedOpportunityDtoOut));

    service.apply(42).subscribe();

    expect(api.create11).toHaveBeenCalledTimes(1);
    const payload = api.create11.mock.calls[0]?.[0]?.appliedOpportunityDtoIn;
    expect(payload).toEqual({ partnershipOpportunity: 42 });
    // Crucial: 'note' key is OMITTED, not included with undefined value.
    // BE @Pattern validators reject empty-string OR null, so a stray
    // `note: undefined` could pass JSON-serialise as absent but still
    // breaks the per-field contract on some serializers.
    expect('note' in payload).toBe(false);
  });

  it('apply(id, note) includes note in the dto when truthy', () => {
    api.create11.mockReturnValue(of({} as AppliedOpportunityDtoOut));

    service.apply(42, 'Love your brand!').subscribe();

    const payload = api.create11.mock.calls[0]?.[0]?.appliedOpportunityDtoIn;
    expect(payload).toEqual({
      partnershipOpportunity: 42,
      note: 'Love your brand!',
    });
  });

  it('apply(id, "") treats empty-string note as falsy → omits the key', () => {
    // Caller passing '' (e.g. from a cleared textarea) should not
    // leak an empty 'note' field — the BE @Size(min=1) validator
    // would 400 it. Locks in the truthy-check semantics.
    api.create11.mockReturnValue(of({} as AppliedOpportunityDtoOut));

    service.apply(42, '').subscribe();

    const payload = api.create11.mock.calls[0]?.[0]?.appliedOpportunityDtoIn;
    expect('note' in payload).toBe(false);
  });

  it('getById(id) builds {id} envelope', () => {
    api.getById11.mockReturnValue(of({} as AppliedOpportunityDtoOut));
    service.getById(7).subscribe();
    expect(api.getById11).toHaveBeenCalledWith({ id: 7 });
  });

  it('list() builds pageable + filters envelope with defaults', () => {
    api.findPaginated11.mockReturnValue(of({ content: [] } as any));

    service.list(0, 20).subscribe();

    expect(api.findPaginated11).toHaveBeenCalledWith({
      pageable: { page: 0, size: 20, sort: ['createdTime,desc'] },
      filters: {},
    });
  });

  it('list() clones the sort array (caller mutation does not corrupt request)', () => {
    api.findPaginated11.mockReturnValue(of({ content: [] } as any));
    const sort = ['title,asc'];
    service.list(0, 20, {}, sort).subscribe();

    const passedSort = api.findPaginated11.mock.calls[0]?.[0]?.pageable?.sort;
    expect(passedSort).toEqual(sort);
    expect(passedSort).not.toBe(sort);
  });

  it('getStatusHistory(id) uses appliedOpportunityId, not id (codegen quirk)', () => {
    api.getStatusHistory.mockReturnValue(of([]));
    service.getStatusHistory(7).subscribe();
    // The codegen uses `appliedOpportunityId` as the param name on this
    // endpoint (unlike the other applied-opportunity methods that use
    // `id`). Easy regression spot if anyone tries to "tidy up" the
    // wrapper.
    expect(api.getStatusHistory).toHaveBeenCalledWith({ appliedOpportunityId: 7 });
  });

  it('updateOpportunityStatus(id, accept) builds the right envelope', () => {
    api.updateOpportunityStatus.mockReturnValue(of({} as AppliedOpportunityDtoOut));

    service.updateOpportunityStatus(7, true).subscribe();
    expect(api.updateOpportunityStatus).toHaveBeenCalledWith({
      appliedOpportunityId: 7,
      accept: true,
    });

    service.updateOpportunityStatus(7, false).subscribe();
    expect(api.updateOpportunityStatus).toHaveBeenLastCalledWith({
      appliedOpportunityId: 7,
      accept: false,
    });
  });

  it('rateCompany(id, rating) calls updateInfluencerRating (the influencer rates the company)', () => {
    api.updateInfluencerRating.mockReturnValue(of({} as AppliedOpportunityDtoOut));
    service.rateCompany(7, RateStatus.POSITIVE).subscribe();
    expect(api.updateInfluencerRating).toHaveBeenCalledWith({
      id: 7,
      rating: RateStatus.POSITIVE,
    });
  });

  it('rateInfluencer(id, rating) calls updateCompanyRating (the company rates the influencer)', () => {
    api.updateCompanyRating.mockReturnValue(of({} as AppliedOpportunityDtoOut));
    service.rateInfluencer(7, RateStatus.NEGATIVE).subscribe();
    expect(api.updateCompanyRating).toHaveBeenCalledWith({
      id: 7,
      rating: RateStatus.NEGATIVE,
    });
  });
});
