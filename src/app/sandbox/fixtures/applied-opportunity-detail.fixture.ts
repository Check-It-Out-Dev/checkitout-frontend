import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityStatusHistoryDtoOut } from '../../api/model/applied-opportunity-status-history-dto-out';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { AppliedOpportunityDetailComponent } from '../../feature/applied-opportunities/applied-opportunity-detail.component';
import type { SandboxFixture } from '../sandbox-registry';

const AWAITING_DECISION: AppliedOpportunityDtoOut = {
  id: 77,
  createdTime: '2026-04-08T14:30:00Z',
  note: 'I run a coffee-focused reel series — this fits my audience perfectly.',
  opportunityStatus: { value: 'ACCEPTED_BY_COMPANY', label: 'Accepted by company' } as never,
  partnershipOpportunity: {
    id: 2,
    title: 'Coffee shop opening — barter pack',
  } as never,
};

const HISTORY: AppliedOpportunityStatusHistoryDtoOut[] = [
  {
    id: 1,
    appliedOpportunityId: 77,
    newStatus: OpportunityStatus.APPLIED,
    changedAt: '2026-04-08T14:30:00Z',
    changedByUserName: 'Anna Nowak',
  },
  {
    id: 2,
    appliedOpportunityId: 77,
    previousStatus: OpportunityStatus.APPLIED,
    newStatus: OpportunityStatus.ACCEPTED_BY_COMPANY,
    changedAt: '2026-04-10T09:00:00Z',
    changedByUserName: 'Coffee Corner Sp. z o.o.',
    changeReason: 'Great niche fit',
  },
];

/** Status stays ACCEPTED_BY_COMPANY so the decision panel renders in its
 * armed-and-waiting state; the transition itself is exercised by unit tests,
 * not the visual snapshot. */
class StubAwaitingDecision {
  getById(): Observable<AppliedOpportunityDtoOut> {
    return of(AWAITING_DECISION);
  }
  getStatusHistory(): Observable<AppliedOpportunityStatusHistoryDtoOut[]> {
    return of(HISTORY);
  }
  updateOpportunityStatus(_id: number, accept: boolean): Observable<AppliedOpportunityDtoOut> {
    return of({
      ...AWAITING_DECISION,
      opportunityStatus: {
        value: accept ? 'ACCEPTED_BY_INFLUENCER' : 'REJECTED_BY_INFLUENCER',
        label: accept ? 'Accepted by influencer' : 'Rejected by influencer',
      } as never,
    });
  }
}

const AWAITING_POSTED: AppliedOpportunityDtoOut = {
  id: 78,
  createdTime: '2026-04-08T14:30:00Z',
  note: 'Reel is edited and scheduled — ready to go live.',
  opportunityStatus: { value: 'CONTENT_APPROVED', label: 'Content approved' } as never,
  partnershipOpportunity: {
    id: 2,
    title: 'Coffee shop opening — barter pack',
  } as never,
};

/** Status CONTENT_APPROVED renders the mark-as-posted panel in its
 * armed-and-waiting state (J4). The influencer confirms the content is live
 * on Instagram; the PATCH advances CONTENT_APPROVED → CONTENT_POSTED. The
 * snapshot captures the resting card. */
class StubAwaitingPosted {
  getById(): Observable<AppliedOpportunityDtoOut> {
    return of(AWAITING_POSTED);
  }
  getStatusHistory(): Observable<AppliedOpportunityStatusHistoryDtoOut[]> {
    return of(HISTORY);
  }
  updateOpportunityStatus(): Observable<AppliedOpportunityDtoOut> {
    return of({
      ...AWAITING_POSTED,
      opportunityStatus: { value: 'CONTENT_POSTED', label: 'Content posted' } as never,
    });
  }
}

const ACTIVATED_ROUTE_77 = {
  snapshot: { paramMap: { get: (k: string) => (k === 'id' ? '77' : null) } },
} as unknown as ActivatedRoute;

const AWAITING_POSTED_REJECTED: AppliedOpportunityDtoOut = {
  ...AWAITING_POSTED,
  id: 79,
  note: 'Company flagged the posted reel — reshooting the CTA overlay.',
  opportunityStatus: {
    value: 'CONTENT_POSTED_REJECTED',
    label: 'Content posted rejected',
  } as never,
};

/** Status CONTENT_POSTED_REJECTED — the company rejected the already-posted
 * content. The mark-posted card renders its rejection-aware variant; accept
 * re-confirms back to CONTENT_POSTED (J4 micro-gap). */
class StubPostedRejected {
  getById(): Observable<AppliedOpportunityDtoOut> {
    return of(AWAITING_POSTED_REJECTED);
  }
  getStatusHistory(): Observable<AppliedOpportunityStatusHistoryDtoOut[]> {
    return of(HISTORY);
  }
  updateOpportunityStatus(): Observable<AppliedOpportunityDtoOut> {
    return of({
      ...AWAITING_POSTED_REJECTED,
      opportunityStatus: { value: 'CONTENT_POSTED', label: 'Content posted' } as never,
    });
  }
}

const ACTIVATED_ROUTE_78 = {
  snapshot: { paramMap: { get: (k: string) => (k === 'id' ? '78' : null) } },
} as unknown as ActivatedRoute;

const ACTIVATED_ROUTE_79 = {
  snapshot: { paramMap: { get: (k: string) => (k === 'id' ? '79' : null) } },
} as unknown as ActivatedRoute;

export const APPLIED_OPPORTUNITY_DETAIL_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'applied-opportunity-detail-decision',
    label: 'Application detail · influencer accept/decline at ACCEPTED_BY_COMPANY (iter-49 P0 #5)',
    component: AppliedOpportunityDetailComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubAwaitingDecision },
      { provide: ActivatedRoute, useValue: ACTIVATED_ROUTE_77 },
    ],
  },
  {
    id: 'applied-opportunity-detail-posted',
    label: 'Application detail · influencer mark-as-posted at CONTENT_APPROVED (J4)',
    component: AppliedOpportunityDetailComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubAwaitingPosted },
      { provide: ActivatedRoute, useValue: ACTIVATED_ROUTE_78 },
    ],
  },
  {
    id: 'applied-opportunity-detail-posted-rejected',
    label: 'Application detail · influencer re-confirm at CONTENT_POSTED_REJECTED (J4)',
    component: AppliedOpportunityDetailComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubPostedRejected },
      { provide: ActivatedRoute, useValue: ACTIVATED_ROUTE_79 },
    ],
  },
];
