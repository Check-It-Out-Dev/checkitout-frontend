import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { SessionStateService } from '../../core/auth/session-state.service';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { OpportunityDetailComponent } from '../../feature/opportunities/opportunity-detail.component';
import type { SandboxFixture } from '../sandbox-registry';

const SAMPLE: PartnershipOpportunityDtoOut = {
  id: 42,
  title: 'Spring sneaker drop — long-form review',
  name: 'sneaker-drop-2026',
  city: 'Warszawa',
  details:
    'A 15-minute long-form video reviewing the new sneaker drop. Walk through fit, comfort on a 5km run, and stylistic comparisons to last season.',
  requirements:
    'Minimum 50k followers in sports or streetwear niches. Video must include unboxing + at-foot shots.',
  followersMin: 50000,
  followersMax: 500000,
  startDate: '2026-06-01T00:00:00Z',
  endDate: '2026-09-01T00:00:00Z',
  compensationType: {
    value: 'CASH',
    label: 'Cash',
  } as PartnershipOpportunityDtoOut['compensationType'],
  compensationAmountMin: 1500,
  compensationAmountMax: 3000,
  currency: { isoCode: 'PLN', name: 'Polish Złoty' } as PartnershipOpportunityDtoOut['currency'],
  contentTypes: [
    { id: 1, name: 'Video', originalName: 'video' },
    { id: 2, name: 'Reel', originalName: 'reel' },
  ] as unknown as PartnershipOpportunityDtoOut['contentTypes'],
  company: {
    name: 'Acme Athletic',
  } as PartnershipOpportunityDtoOut['company'],
};

class StubOpp {
  getById(): Observable<PartnershipOpportunityDtoOut> {
    return of(SAMPLE);
  }
}

class StubOppNotFound {
  getById(): Observable<PartnershipOpportunityDtoOut> {
    return throwError(() => new HttpErrorResponse({ status: 404 }));
  }
}

class StubApplyOk {
  apply(): Observable<AppliedOpportunityDtoOut> {
    return of({ id: 9001 } as AppliedOpportunityDtoOut);
  }
  /** Apply-guard #2 pre-check — "not applied yet" keeps the form visible. */
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of({ content: [], totalElements: 0 } as PageAppliedOpportunityDtoOut);
  }
}

/** The apply-guards read the session role — pin it per fixture. */
const asRole = (role: 'INFLUENCER' | 'COMPANY') => ({
  provide: SessionStateService,
  useValue: { user: signal({ userType: { value: role } }) },
});

const ACTIVATED_ROUTE_42 = {
  snapshot: { paramMap: { get: (k: string) => (k === 'id' ? '42' : null) } },
} as unknown as ActivatedRoute;

const ACTIVATED_ROUTE_BAD = {
  snapshot: { paramMap: { get: () => 'not-a-number' } },
} as unknown as ActivatedRoute;

export const OPPORTUNITY_DETAIL_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'opportunity-detail-loaded',
    label: 'Opportunity detail · loaded (influencer view, apply form)',
    component: OpportunityDetailComponent,
    providers: [
      { provide: ActivatedRoute, useValue: ACTIVATED_ROUTE_42 },
      { provide: OpportunityApiService, useClass: StubOpp },
      { provide: AppliedOpportunityApiService, useClass: StubApplyOk },
      asRole('INFLUENCER'),
    ],
  },
  {
    id: 'opportunity-detail-company-view',
    label: 'Opportunity detail · company view (apply-guard note)',
    component: OpportunityDetailComponent,
    providers: [
      { provide: ActivatedRoute, useValue: ACTIVATED_ROUTE_42 },
      { provide: OpportunityApiService, useClass: StubOpp },
      { provide: AppliedOpportunityApiService, useClass: StubApplyOk },
      asRole('COMPANY'),
    ],
  },
  {
    id: 'opportunity-detail-not-found',
    label: 'Opportunity detail · not found',
    component: OpportunityDetailComponent,
    providers: [
      { provide: ActivatedRoute, useValue: ACTIVATED_ROUTE_BAD },
      { provide: OpportunityApiService, useClass: StubOppNotFound },
      { provide: AppliedOpportunityApiService, useClass: StubApplyOk },
    ],
  },
];
