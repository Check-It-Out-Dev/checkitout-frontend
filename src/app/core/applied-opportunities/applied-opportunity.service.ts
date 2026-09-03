import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppliedOpportunityControllerService as GeneratedAppliedOpportunityApi } from '../../api/api/applied-opportunity-controller.api';
import type { AppliedOpportunityDtoIn } from '../../api/model/applied-opportunity-dto-in';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityStatisticsDto } from '../../api/model/applied-opportunity-statistics-dto';
import type { AppliedOpportunityStatusHistoryDtoOut } from '../../api/model/applied-opportunity-status-history-dto-out';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import type { PaymentContactDto } from '../../api/model/payment-contact-dto';
import { RateStatus } from '../../api/model/rate-status';

/**
 * Wrapper around the generated `AppliedOpportunityAPIService`. Hides codegen
 * names (`create11` / `getById11` / `findPaginated11` / `patch11` /
 * `update11` / `delete11`) and the `requestParameters` envelope.
 *
 * `apply()` is the influencer-side action; the BE auto-resolves the
 * influencer ID from session, so we only need to pass the target opportunity
 * + optional note.
 */
@Injectable({ providedIn: 'root' })
export class AppliedOpportunityApiService {
  private readonly api = inject(GeneratedAppliedOpportunityApi);

  apply(partnershipOpportunityId: number, note?: string): Observable<AppliedOpportunityDtoOut> {
    const dto: AppliedOpportunityDtoIn = {
      partnershipOpportunity: partnershipOpportunityId,
      ...(note ? { note } : {}),
    };
    return this.api.create11({ appliedOpportunityDtoIn: dto });
  }

  getById(id: number): Observable<AppliedOpportunityDtoOut> {
    return this.api.getById11({ id });
  }

  list(
    page: number,
    size: number,
    filters: Record<string, string> = {},
    sort: ReadonlyArray<string> = ['createdTime,desc'],
  ): Observable<PageAppliedOpportunityDtoOut> {
    return this.api.findPaginated11({
      pageable: { page, size, sort: [...sort] },
      filters,
    });
  }

  getStatusHistory(id: number): Observable<Array<AppliedOpportunityStatusHistoryDtoOut>> {
    return this.api.getStatusHistory({ appliedOpportunityId: id });
  }

  /**
   * Per-user cooperation counters for the collaboration-dashboard tabs
   * (`GET /applied-opportunity/statistics`). BE scopes to the authenticated
   * user (company: cooperations on their campaigns; influencer: their own).
   * Legacy tab-label mapping: registrations = `newOpportunities`,
   * finished = `done`.
   */
  getStatistics(): Observable<AppliedOpportunityStatisticsDto> {
    return this.api.getStatistics();
  }

  /**
   * Company-side accept/reject of an applicant (E7a). The BE drives the
   * state machine: APPLIED → ACCEPTED_BY_COMPANY (accept=true) or
   * REJECTED_BY_COMPANY (accept=false).
   */
  updateOpportunityStatus(
    appliedOpportunityId: number,
    accept: boolean,
  ): Observable<AppliedOpportunityDtoOut> {
    return this.api.updateOpportunityStatus({ appliedOpportunityId, accept });
  }

  /**
   * E7d — influencer rates the company on a finished cooperation.
   * Sets `rateStatus` (the influencer's view of the company).
   */
  rateCompany(id: number, rating: RateStatus): Observable<AppliedOpportunityDtoOut> {
    return this.api.updateInfluencerRating({ id, rating });
  }

  /**
   * E7d — company rates the influencer on a finished cooperation.
   * Sets `companyRateStatus` (the company's view of the influencer).
   */
  rateInfluencer(id: number, rating: RateStatus): Observable<AppliedOpportunityDtoOut> {
    return this.api.updateCompanyRating({ id, rating });
  }

  /**
   * Reveal payment-contact details (name, email, optional phone, optional
   * avatar) of the OTHER side at `TO_BE_PAID` / `DONE` states. BE returns
   * the influencer's payment contact when the company asks, and the
   * company's when the influencer asks. Iter-48 P0 #3 fix per
   * `docs/parity-review/audit-2026-05-13-10-agent-fleet.md` — without
   * this call, payouts cannot be coordinated.
   *
   * BE-side: only the two parties on the applied-opportunity see the
   * contact; admins see both; everyone else gets 403.
   */
  getPaymentContact(appliedOpportunityId: number): Observable<PaymentContactDto> {
    return this.api.getPaymentContact({ id: appliedOpportunityId });
  }
}
