import { Observable, of } from 'rxjs';
import type { PagePartnershipOpportunityDtoOut } from '../../api/model/page-partnership-opportunity-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { OpportunitiesListComponent } from '../../feature/opportunities/opportunities-list.component';
import type { SandboxFixture } from '../sandbox-registry';

const SAMPLE: PartnershipOpportunityDtoOut[] = [
  {
    id: 1,
    title: 'Spring sneaker drop — long-form review',
    name: 'sneaker-drop-2026',
    city: 'Warszawa',
    details: 'A 15-minute long-form video reviewing the new sneaker drop.',
    requirements: 'Minimum 50k followers, sports or streetwear niche.',
    followersMin: 50000,
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
  },
  {
    id: 2,
    title: 'Coffee shop opening — barter pack',
    name: 'cafe-opening',
    city: 'Wrocław',
    compensationType: {
      value: 'BARTER',
      label: 'Barter',
    } as PartnershipOpportunityDtoOut['compensationType'],
    compensationDescription: 'Two-month coffee subscription + branded merch (~600 PLN value).',
    contentTypes: [
      { id: 3, name: 'Story', originalName: 'story' },
    ] as unknown as PartnershipOpportunityDtoOut['contentTypes'],
    company: {
      name: 'Brew & Co',
    } as PartnershipOpportunityDtoOut['company'],
  },
  {
    id: 3,
    title: 'Skincare line launch',
    name: 'skincare-launch',
    city: 'Kraków',
    compensationType: {
      value: 'CASH',
      label: 'Cash',
    } as PartnershipOpportunityDtoOut['compensationType'],
    compensationAmountMin: 800,
    compensationAmountMax: 800,
    currency: { isoCode: 'PLN', name: 'Polish Złoty' } as PartnershipOpportunityDtoOut['currency'],
    contentTypes: [
      { id: 4, name: 'Post', originalName: 'post' },
    ] as unknown as PartnershipOpportunityDtoOut['contentTypes'],
    company: {
      name: 'Lumi Skincare',
    } as PartnershipOpportunityDtoOut['company'],
  },
];

class StubLoaded {
  list(): Observable<PagePartnershipOpportunityDtoOut> {
    return of({ content: SAMPLE, totalElements: SAMPLE.length, number: 0, size: 12 });
  }
}

class StubEmpty {
  list(): Observable<PagePartnershipOpportunityDtoOut> {
    return of({ content: [], totalElements: 0, number: 0, size: 12 });
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

export const OPPORTUNITIES_LIST_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'opportunities-list-loaded',
    label: 'Opportunities list · 3 sample campaigns',
    component: OpportunitiesListComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubLoaded }],
  },
  {
    id: 'opportunities-list-empty',
    label: 'Opportunities list · empty state',
    component: OpportunitiesListComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubEmpty }],
  },
  {
    id: 'opportunities-list-loading',
    label: 'Opportunities list · loading',
    component: OpportunitiesListComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubLoading }],
  },
  {
    id: 'opportunities-list-error',
    label: 'Opportunities list · error',
    component: OpportunitiesListComponent,
    providers: [{ provide: OpportunityApiService, useClass: StubError }],
  },
];
