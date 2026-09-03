/**
 * L0 contract: OpportunityApiService ↔ generated models. Pure types —
 * this file failing to compile IS the test (see type-assert.ts). If
 * `npm run openapi:gen` moves a DTO or someone widens a wrapper
 * signature (an `any` leak, a loosened param), `npm run typecheck`
 * breaks here, naming the exact method.
 */
import type { Observable } from 'rxjs';
import type { OpportunityApiService } from '../../app/core/opportunities/opportunity.service';
import type { PagePartnershipOpportunityDtoOut } from '../../app/api/model/page-partnership-opportunity-dto-out';
import type { PartnershipOpportunityDtoIn } from '../../app/api/model/partnership-opportunity-dto-in';
import type { PartnershipOpportunityDtoOut } from '../../app/api/model/partnership-opportunity-dto-out';
import type { Equal, Expect } from '../type-assert';

type _list = Expect<
  Equal<ReturnType<OpportunityApiService['list']>, Observable<PagePartnershipOpportunityDtoOut>>
>;

type _getById = Expect<
  Equal<OpportunityApiService['getById'], (id: number) => Observable<PartnershipOpportunityDtoOut>>
>;

type _create = Expect<
  Equal<
    OpportunityApiService['create'],
    (dto: PartnershipOpportunityDtoIn) => Observable<PartnershipOpportunityDtoOut>
  >
>;

type _patch = Expect<
  Equal<
    OpportunityApiService['patch'],
    (id: number, dto: PartnershipOpportunityDtoIn) => Observable<PartnershipOpportunityDtoOut>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type OpportunitiesContract = [_list, _getById, _create, _patch];
