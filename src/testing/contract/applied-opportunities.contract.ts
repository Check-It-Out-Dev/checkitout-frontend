/**
 * L0 contract: AppliedOpportunityApiService (+ content sibling) ↔
 * generated models — the application lifecycle surface the collaboration
 * journeys ride. Compile-time only; see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { AppliedOpportunityApiService } from '../../app/core/applied-opportunities/applied-opportunity.service';
import type { AppliedOpportunityContentApiService } from '../../app/core/applied-opportunities/applied-opportunity-content.service';
import type { AppliedOpportunityDtoOut } from '../../app/api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityStatusHistoryDtoOut } from '../../app/api/model/applied-opportunity-status-history-dto-out';
import type { AppliedOpportunityContentDtoIn } from '../../app/api/model/applied-opportunity-content-dto-in';
import type { AppliedOpportunityContentDtoOut } from '../../app/api/model/applied-opportunity-content-dto-out';
import type { RateStatus } from '../../app/api/model/rate-status';
import type { Equal, Expect } from '../type-assert';

type _apply = Expect<
  Equal<
    AppliedOpportunityApiService['apply'],
    (partnershipOpportunityId: number, note?: string) => Observable<AppliedOpportunityDtoOut>
  >
>;

type _getById = Expect<
  Equal<
    AppliedOpportunityApiService['getById'],
    (id: number) => Observable<AppliedOpportunityDtoOut>
  >
>;

type _statusHistory = Expect<
  Equal<
    AppliedOpportunityApiService['getStatusHistory'],
    (id: number) => Observable<Array<AppliedOpportunityStatusHistoryDtoOut>>
  >
>;

type _decide = Expect<
  Equal<
    AppliedOpportunityApiService['updateOpportunityStatus'],
    (appliedOpportunityId: number, accept: boolean) => Observable<AppliedOpportunityDtoOut>
  >
>;

type _rateCompany = Expect<
  Equal<
    AppliedOpportunityApiService['rateCompany'],
    (id: number, rating: RateStatus) => Observable<AppliedOpportunityDtoOut>
  >
>;

type _rateInfluencer = Expect<
  Equal<
    AppliedOpportunityApiService['rateInfluencer'],
    (id: number, rating: RateStatus) => Observable<AppliedOpportunityDtoOut>
  >
>;

type _submitContent = Expect<
  Equal<
    AppliedOpportunityContentApiService['submit'],
    (dto: AppliedOpportunityContentDtoIn) => Observable<AppliedOpportunityContentDtoOut>
  >
>;

export type AppliedOpportunitiesContract = [
  _apply,
  _getById,
  _statusHistory,
  _decide,
  _rateCompany,
  _rateInfluencer,
  _submitContent,
];
