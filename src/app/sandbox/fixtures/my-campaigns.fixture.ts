import { Observable, of } from 'rxjs';
import type { PagePartnershipOpportunityDtoOut } from '../../api/model/page-partnership-opportunity-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { MyCampaignsComponent } from '../../feature/opportunities/my-campaigns.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Company campaign dashboard (`/collaborations/dashboard`) fixtures. One
 * company's own campaigns — mixed active/inactive so the status badges and
 * the quieter inactive treatment are both visible in one baseline.
 */

const SAMPLE: PartnershipOpportunityDtoOut[] = [
  {
    id: 1,
    title: 'Spring sneaker drop — long-form review',
    active: true,
    createdTime: '2026-03-02T09:00:00Z',
    compensationAmountMin: 1500,
    compensationAmountMax: 3000,
  },
  {
    id: 4,
    title: 'Marathon week stories',
    active: true,
    createdTime: '2026-02-14T12:00:00Z',
    compensationAmountMin: 500,
    compensationAmountMax: 900,
  },
  {
    id: 5,
    title: 'Winter clearance haul',
    active: false,
    createdTime: '2025-12-01T08:30:00Z',
  },
];

class StubLoaded {
  list(): Observable<PagePartnershipOpportunityDtoOut> {
    return of({ content: SAMPLE, totalElements: SAMPLE.length, number: 0, size: 20 });
  }
}

class StubEmpty {
  list(): Observable<PagePartnershipOpportunityDtoOut> {
    return of({ content: [], totalElements: 0, number: 0, size: 20 });
  }
}

class StubLoading {
  list(): Observable<PagePartnershipOpportunityDtoOut> {
    return new Observable<PagePartnershipOpportunityDtoOut>(() => undefined);
  }
}

class StubError {
  list(): Observable<PagePartnershipOpportunityDtoOut> {
    return new Observable<PagePartnershipOpportunityDtoOut>((sub) => sub.error({ status: 500 }));
  }
}

export const MY_CAMPAIGNS_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'my-campaigns-loaded',
    label: 'My campaigns · 2 active + 1 inactive',
    component: MyCampaignsComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubLoaded }],
  },
  {
    id: 'my-campaigns-empty',
    label: 'My campaigns · empty state (create CTA)',
    component: MyCampaignsComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubEmpty }],
  },
  {
    id: 'my-campaigns-loading',
    label: 'My campaigns · loading',
    component: MyCampaignsComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubLoading }],
  },
  {
    id: 'my-campaigns-error',
    label: 'My campaigns · error + retry',
    component: MyCampaignsComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubError }],
  },
];
