import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppliedOpportunityContentControllerService as GeneratedContentApi } from '../../api/api/applied-opportunity-content-controller.api';
import { ContentTypeControllerService as GeneratedContentTypeApi } from '../../api/api/content-type-controller.api';
import type { AppliedOpportunityContentDtoIn } from '../../api/model/applied-opportunity-content-dto-in';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import { ContentApprovalStatus } from '../../api/model/content-approval-status';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import { AppliedOpportunityContentApiService } from './applied-opportunity-content.service';

describe('AppliedOpportunityContentApiService', () => {
  let service: AppliedOpportunityContentApiService;
  let api: {
    submitContent: jest.Mock;
    getContentByAppliedOpportunity: jest.Mock;
    approveContent: jest.Mock;
    rejectContent: jest.Mock;
  };
  let contentTypeApi: { findPaginated9: jest.Mock };

  beforeEach(() => {
    api = {
      submitContent: jest.fn(),
      getContentByAppliedOpportunity: jest.fn(),
      approveContent: jest.fn(),
      rejectContent: jest.fn(),
    };
    contentTypeApi = { findPaginated9: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        AppliedOpportunityContentApiService,
        { provide: GeneratedContentApi, useValue: api },
        { provide: GeneratedContentTypeApi, useValue: contentTypeApi },
      ],
    });
    service = TestBed.inject(AppliedOpportunityContentApiService);
  });

  it('submit(dto) wraps in appliedOpportunityContentDtoIn envelope', () => {
    const dto = { description: 'Reel' } as unknown as AppliedOpportunityContentDtoIn;
    api.submitContent.mockReturnValue(of({} as AppliedOpportunityContentDtoOut));

    service.submit(dto).subscribe();

    expect(api.submitContent).toHaveBeenCalledWith({
      appliedOpportunityContentDtoIn: dto,
    });
    expect(api.submitContent.mock.calls[0]?.[0]?.appliedOpportunityContentDtoIn).toBe(dto);
  });

  it('listForAppliedOpportunity(id) sends only the id when no status filter', () => {
    api.getContentByAppliedOpportunity.mockReturnValue(of([]));

    service.listForAppliedOpportunity(7).subscribe();

    const arg = api.getContentByAppliedOpportunity.mock.calls[0]?.[0];
    expect(arg).toEqual({ appliedOpportunityId: 7 });
    // Crucial: contentStatus is OMITTED, not included as undefined.
    expect('contentStatus' in arg).toBe(false);
  });

  it('listForAppliedOpportunity(id, status) includes contentStatus when truthy', () => {
    api.getContentByAppliedOpportunity.mockReturnValue(of([]));

    service.listForAppliedOpportunity(7, ContentApprovalStatus.PENDING).subscribe();

    expect(api.getContentByAppliedOpportunity).toHaveBeenCalledWith({
      appliedOpportunityId: 7,
      contentStatus: ContentApprovalStatus.PENDING,
    });
  });

  it('listContentTypes() requests page 0 / size 50 + maps page.content', () => {
    const items = [
      { id: 1, name: 'POST' },
      { id: 2, name: 'REEL' },
    ] as unknown as ContentTypeDtoOut[];
    contentTypeApi.findPaginated9.mockReturnValue(of({ content: items }));

    let received: ContentTypeDtoOut[] | undefined;
    service.listContentTypes().subscribe((r) => (received = r));

    expect(contentTypeApi.findPaginated9).toHaveBeenCalledWith({
      pageable: { page: 0, size: 50 },
      filters: {},
    });
    expect(received).toBe(items);
  });

  it('listContentTypes() yields [] when page.content is null/undefined', () => {
    contentTypeApi.findPaginated9.mockReturnValue(of({} as never));

    let received: ContentTypeDtoOut[] | undefined;
    service.listContentTypes().subscribe((r) => (received = r));

    expect(received).toEqual([]);
  });

  it('listContentTypes() forwards upstream errors instead of swallowing them', (done) => {
    contentTypeApi.findPaginated9.mockReturnValue(throwError(() => new Error('BE down')));

    service.listContentTypes().subscribe({
      next: () => done.fail('should not emit on error'),
      error: (err: Error) => {
        expect(err.message).toBe('BE down');
        done();
      },
    });
  });

  it('approve(contentId) builds {contentId} envelope', () => {
    api.approveContent.mockReturnValue(of({}));
    service.approve(7).subscribe();
    expect(api.approveContent).toHaveBeenCalledWith({ contentId: 7 });
  });

  it('reject(contentId) builds {contentId} envelope', () => {
    api.rejectContent.mockReturnValue(of({}));
    service.reject(7).subscribe();
    expect(api.rejectContent).toHaveBeenCalledWith({ contentId: 7 });
  });
});
