import { Observable, of } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { AppliedOpportunitiesListComponent } from '../../feature/applied-opportunities/applied-opportunities-list.component';
import type { SandboxFixture } from '../sandbox-registry';

const SAMPLE: AppliedOpportunityDtoOut[] = [
  {
    id: 101,
    createdTime: '2026-04-12T10:00:00Z',
    note: 'Excited to participate — I have a strong sneaker-niche audience.',
    opportunityStatus: { value: 'APPLIED', label: 'Applied' } as never,
    partnershipOpportunity: {
      id: 1,
      title: 'Spring sneaker drop — long-form review',
    } as never,
  },
  {
    id: 102,
    createdTime: '2026-04-08T14:30:00Z',
    executionDate: '2026-05-20T00:00:00Z',
    opportunityStatus: {
      value: 'ACCEPTED_BY_COMPANY',
      label: 'Accepted',
    } as never,
    partnershipOpportunity: {
      id: 2,
      title: 'Coffee shop opening — barter pack',
    } as never,
  },
  {
    id: 103,
    createdTime: '2026-03-25T09:15:00Z',
    opportunityStatus: {
      value: 'CONTENT_SEND_TO_ACCEPT',
      label: 'Content under review',
    } as never,
    partnershipOpportunity: {
      id: 3,
      title: 'Skincare line launch',
    } as never,
  },
  {
    id: 104,
    createdTime: '2026-02-10T11:00:00Z',
    opportunityStatus: {
      value: 'REJECTED_BY_COMPANY',
      label: 'Rejected',
    } as never,
    partnershipOpportunity: { id: 4, title: 'Vintage watch unboxing' } as never,
  },
  {
    id: 105,
    createdTime: '2026-01-05T08:00:00Z',
    opportunityStatus: { value: 'DONE', label: 'Done' } as never,
    partnershipOpportunity: { id: 5, title: 'Headphones launch tour' } as never,
  },
];

class StubLoaded {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of({ content: SAMPLE, totalElements: SAMPLE.length, number: 0, size: 20 });
  }
}

class StubEmpty {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of({ content: [], totalElements: 0, number: 0, size: 20 });
  }
}

class StubError {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return new Observable<PageAppliedOpportunityDtoOut>((sub) => sub.error({ status: 500 }));
  }
}

export const APPLIED_OPPORTUNITIES_LIST_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'applied-opportunities-list-loaded',
    label: 'My applications · 5 sample applications across statuses',
    component: AppliedOpportunitiesListComponent,
    providers: [{ provide: AppliedOpportunityApiService, useClass: StubLoaded }],
  },
  {
    id: 'applied-opportunities-list-empty',
    label: 'My applications · empty state',
    component: AppliedOpportunitiesListComponent,
    providers: [{ provide: AppliedOpportunityApiService, useClass: StubEmpty }],
  },
  {
    id: 'applied-opportunities-list-error',
    label: 'My applications · error state',
    component: AppliedOpportunitiesListComponent,
    providers: [{ provide: AppliedOpportunityApiService, useClass: StubError }],
  },
];
