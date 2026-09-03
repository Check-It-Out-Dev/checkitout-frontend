import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppliedOpportunityContentControllerService as GeneratedContentApi } from '../../api/api/applied-opportunity-content-controller.api';
import { ContentTypeControllerService as GeneratedContentTypeApi } from '../../api/api/content-type-controller.api';
import type { AppliedOpportunityContentDtoIn } from '../../api/model/applied-opportunity-content-dto-in';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { ContentApprovalStatus } from '../../api/model/content-approval-status';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';

/**
 * Wrapper around the generated `AppliedOpportunityContentService` plus a
 * thin convenience for the `ContentType` dictionary the form needs.
 *
 * E7b uses `submit` + `listForAppliedOpportunity` + `listContentTypes`;
 * E7c will add `approve` + `reject`. `update` and `delete` round out
 * the surface for editing/withdrawing a submission.
 */
@Injectable({ providedIn: 'root' })
export class AppliedOpportunityContentApiService {
  private readonly api = inject(GeneratedContentApi);
  private readonly contentTypeApi = inject(GeneratedContentTypeApi);

  submit(dto: AppliedOpportunityContentDtoIn): Observable<AppliedOpportunityContentDtoOut> {
    return this.api.submitContent({ appliedOpportunityContentDtoIn: dto });
  }

  listForAppliedOpportunity(
    appliedOpportunityId: number,
    contentStatus?: ContentApprovalStatus,
  ): Observable<Array<AppliedOpportunityContentDtoOut>> {
    return this.api.getContentByAppliedOpportunity({
      appliedOpportunityId,
      ...(contentStatus ? { contentStatus } : {}),
    });
  }

  /** Loads the first page (50 items) of the ContentType dictionary —
   * enough for the dropdown. The dictionary has a fixed small cardinality
   * (post / story / reel / IGTV / etc.). */
  listContentTypes(): Observable<Array<ContentTypeDtoOut>> {
    return new Observable((subscriber) => {
      this.contentTypeApi
        .findPaginated9({ pageable: { page: 0, size: 50 }, filters: {} })
        .subscribe({
          next: (page) => {
            subscriber.next(page.content ?? []);
            subscriber.complete();
          },
          error: (err) => subscriber.error(err),
        });
    });
  }

  /**
   * Reports post-publication engagement numbers for a submission
   * (`PATCH /content/{id}/engagement`). Content-owner only, BE-enforced —
   * the influencer who submitted the content updates its metrics; the
   * company sees them read-only on the review page. Omitted fields are
   * left unchanged server-side.
   */
  updateEngagement(
    contentId: number,
    metrics: { likes?: number; comments?: number; views?: number; shares?: number },
  ): Observable<unknown> {
    return this.api.updateEngagementMetrics({ contentId, ...metrics });
  }

  approve(contentId: number): Observable<unknown> {
    return this.api.approveContent({ contentId });
  }

  reject(contentId: number, approvalNotes?: string): Observable<unknown> {
    // `approvalNotes` becomes the influencer-visible revision reason
    // (legacy card caps input at 500 chars; BE accepts it optionally).
    return this.api.rejectContent({
      contentId,
      ...(approvalNotes?.trim() ? { approvalNotes: approvalNotes.trim() } : {}),
    });
  }
}
