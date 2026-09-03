import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { CampaignApplicantsComponent } from '../../feature/opportunities/campaign-applicants.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Company applicants-triage view (`/collaborations/:id/applicants`)
 * fixtures. Loaded state mixes one still-APPLIED row (Accept/Reject pair
 * visible) with already-decided rows so all three badge treatments land
 * in a single baseline.
 */

function routeWithId(id: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: convertToParamMap(id ? { id } : {}) },
  } as unknown as ActivatedRoute;
}

const APPLICANTS: AppliedOpportunityDtoOut[] = [
  {
    id: 201,
    createdTime: '2026-04-12T10:00:00Z',
    note: 'Excited to participate — I have a strong sneaker-niche audience.',
    opportunityStatus: { value: 'APPLIED', label: 'Applied' } as never,
    influencer: { firstName: 'Anna', lastName: 'Kowalska' } as never,
    partnershipOpportunity: { id: 1, title: 'Spring sneaker drop — long-form review' } as never,
  },
  {
    id: 202,
    createdTime: '2026-04-10T09:30:00Z',
    opportunityStatus: { value: 'ACCEPTED_BY_COMPANY', label: 'Accepted' } as never,
    influencer: { firstName: 'Piotr', lastName: 'Nowak' } as never,
    partnershipOpportunity: { id: 1, title: 'Spring sneaker drop — long-form review' } as never,
  },
  {
    id: 203,
    createdTime: '2026-04-08T16:45:00Z',
    opportunityStatus: { value: 'REJECTED_BY_COMPANY', label: 'Rejected' } as never,
    influencer: { firstName: 'Marta', lastName: 'Wiśniewska' } as never,
    partnershipOpportunity: { id: 1, title: 'Spring sneaker drop — long-form review' } as never,
  },
];

class StubLoaded {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of({ content: APPLICANTS, totalElements: APPLICANTS.length, number: 0, size: 100 });
  }
}

class StubEmpty {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of({ content: [], totalElements: 0, number: 0, size: 100 });
  }
}

class StubError {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return new Observable<PageAppliedOpportunityDtoOut>((sub) => sub.error({ status: 500 }));
  }
}

export const CAMPAIGN_APPLICANTS_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'campaign-applicants-loaded',
    label: 'Campaign applicants · APPLIED (decision pair) + accepted + rejected',
    component: CampaignApplicantsComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('1') },
      { provide: AppliedOpportunityApiService, useClass: StubLoaded },
    ],
  },
  {
    id: 'campaign-applicants-empty',
    label: 'Campaign applicants · no applicants yet',
    component: CampaignApplicantsComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('1') },
      { provide: AppliedOpportunityApiService, useClass: StubEmpty },
    ],
  },
  {
    id: 'campaign-applicants-error',
    label: 'Campaign applicants · load error',
    component: CampaignApplicantsComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('1') },
      { provide: AppliedOpportunityApiService, useClass: StubError },
    ],
  },
  {
    id: 'campaign-applicants-not-found',
    label: 'Campaign applicants · bad :id param',
    component: CampaignApplicantsComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId(null) },
      { provide: AppliedOpportunityApiService, useClass: StubEmpty },
    ],
  },
];
