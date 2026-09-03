import { ApiHttp, type ApiResult } from './http-client';

import type { PartnershipOpportunityDtoIn } from '../../../src/app/api/model/partnership-opportunity-dto-in';
import type { PartnershipOpportunityDtoOut } from '../../../src/app/api/model/partnership-opportunity-dto-out';
import type { AppliedOpportunityDtoIn } from '../../../src/app/api/model/applied-opportunity-dto-in';
import type { AppliedOpportunityDtoOut } from '../../../src/app/api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityContentDtoIn } from '../../../src/app/api/model/applied-opportunity-content-dto-in';
import type { AppliedOpportunityContentDtoOut } from '../../../src/app/api/model/applied-opportunity-content-dto-out';
import type { RateStatus } from '../../../src/app/api/model/rate-status';

/**
 * Layer 1 — Partnership-opportunity domain service.
 *
 * Typed methods over the OpenAPI-generated DTOs; one method per endpoint of the
 * partnership state machine. This reads as the API's documentation (owner:
 * "BDD and service as documentation") and is the single place the endpoint
 * shapes live, so the BDD steps (L2) stay thin and a BE contract change breaks
 * here at compile time. Bound to one actor's transport (see TestSession) — the
 * caller picks the company or influencer service per step.
 *
 * Contract (verified vs PartnershipFlowSteps.java + the generated client):
 * accept (both sides), reject-post, verify, confirm-payment all share
 * `advanceStatus` (PATCH status/update?accept=); the Instagram post is a PUT of
 * the content record carrying a socialMediaLink.
 */
export class PartnershipApi {
  constructor(private readonly http: ApiHttp) {}

  createOpportunity(
    dto: PartnershipOpportunityDtoIn,
  ): Promise<ApiResult<PartnershipOpportunityDtoOut>> {
    return this.http.post<PartnershipOpportunityDtoOut>('/partnership-opportunity', dto);
  }

  apply(dto: AppliedOpportunityDtoIn): Promise<ApiResult<AppliedOpportunityDtoOut>> {
    return this.http.post<AppliedOpportunityDtoOut>('/applied-opportunity', dto);
  }

  getApplication(applicationId: number): Promise<ApiResult<AppliedOpportunityDtoOut>> {
    return this.http.get<AppliedOpportunityDtoOut>(`/applied-opportunity/${applicationId}`);
  }

  /** The shared state-machine transition: accept=true advances, accept=false rejects. */
  advanceStatus(
    applicationId: number,
    accept: boolean,
  ): Promise<ApiResult<AppliedOpportunityDtoOut>> {
    return this.http.patch<AppliedOpportunityDtoOut>(
      `/applied-opportunity/status/update/${applicationId}`,
      undefined,
      { accept },
    );
  }

  submitContent(
    dto: AppliedOpportunityContentDtoIn,
  ): Promise<ApiResult<AppliedOpportunityContentDtoOut>> {
    return this.http.post<AppliedOpportunityContentDtoOut>('/applied-opportunity/content', dto);
  }

  rejectContent(contentId: number, approvalNotes: string): Promise<ApiResult<void>> {
    return this.http.patch<void>(`/applied-opportunity/content/${contentId}/reject`, undefined, {
      approvalNotes,
    });
  }

  approveContent(contentId: number, approvalNotes: string): Promise<ApiResult<void>> {
    return this.http.patch<void>(`/applied-opportunity/content/${contentId}/approve`, undefined, {
      approvalNotes,
    });
  }

  /** Post the content to Instagram: PUT the content record with a socialMediaLink. */
  postToInstagram(
    contentId: number,
    dto: AppliedOpportunityContentDtoIn,
  ): Promise<ApiResult<AppliedOpportunityContentDtoOut>> {
    return this.http.put<AppliedOpportunityContentDtoOut>(
      `/applied-opportunity/content/${contentId}`,
      dto,
    );
  }

  rateInfluencer(
    applicationId: number,
    rating: RateStatus,
  ): Promise<ApiResult<AppliedOpportunityDtoOut>> {
    return this.http.put<AppliedOpportunityDtoOut>(
      `/applied-opportunity/${applicationId}/company-rating`,
      undefined,
      { rating: String(rating) },
    );
  }

  rateCompany(
    applicationId: number,
    rating: RateStatus,
  ): Promise<ApiResult<AppliedOpportunityDtoOut>> {
    return this.http.put<AppliedOpportunityDtoOut>(
      `/applied-opportunity/${applicationId}/influencer-rating`,
      undefined,
      { rating: String(rating) },
    );
  }
}
