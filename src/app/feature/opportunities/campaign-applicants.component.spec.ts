import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { CampaignApplicantsComponent } from './campaign-applicants.component';

const APPLIED: AppliedOpportunityDtoOut = {
  id: 101,
  createdTime: '2026-04-12T10:00:00Z',
  opportunityStatus: { value: OpportunityStatus.APPLIED, label: 'Applied' } as never,
  partnershipOpportunity: { id: 7, title: 'Spring Promo' } as never,
  influencer: { firstName: 'Anna', lastName: 'Nowak' } as never,
  note: 'Excited!',
};
const ACCEPTED: AppliedOpportunityDtoOut = {
  ...APPLIED,
  id: 102,
  opportunityStatus: { value: OpportunityStatus.ACCEPTED_BY_COMPANY, label: 'Accepted' } as never,
};

class FakeApi {
  listFilters: Record<string, string> | null = null;
  decisions: { id: number; accept: boolean }[] = [];
  listFn: () => Observable<PageAppliedOpportunityDtoOut> = () =>
    of({ content: [APPLIED, ACCEPTED], totalElements: 2, number: 0, size: 100 });
  list(
    _page: number,
    _size: number,
    filters: Record<string, string> = {},
  ): Observable<PageAppliedOpportunityDtoOut> {
    this.listFilters = filters;
    return this.listFn();
  }
  updateOpportunityStatus(id: number, accept: boolean): Observable<AppliedOpportunityDtoOut> {
    this.decisions.push({ id, accept });
    return of({
      ...APPLIED,
      id,
      opportunityStatus: {
        value: accept
          ? OpportunityStatus.ACCEPTED_BY_COMPANY
          : OpportunityStatus.REJECTED_BY_COMPANY,
        label: '',
      } as never,
    });
  }
}

function create(
  api: FakeApi,
  paramId: string | null = '7',
): ComponentFixture<CampaignApplicantsComponent> {
  const fakeRoute = {
    snapshot: { paramMap: convertToParamMap(paramId === null ? {} : { id: paramId }) },
  } as unknown as ActivatedRoute;
  TestBed.configureTestingModule({
    imports: [
      CampaignApplicantsComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: AppliedOpportunityApiService, useValue: api },
      { provide: ActivatedRoute, useValue: fakeRoute },
    ],
  });
  const fixture = TestBed.createComponent(CampaignApplicantsComponent);
  fixture.detectChanges();
  return fixture;
}

describe('CampaignApplicantsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists applicants for the campaign filtered by partnership id', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, '7');
    tick();
    fixture.detectChanges();
    expect(api.listFilters).toEqual({ 'partnershipOpportunity.id': '7' });
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.items().length).toBe(2);
  }));

  it('marks not-found when the route id is missing or non-numeric', () => {
    const api = new FakeApi();
    const fixture = create(api, 'abc');
    expect(fixture.componentInstance.state()).toBe('not-found');
  });

  it('shows empty state when no applicants', fakeAsync(() => {
    const api = new FakeApi();
    api.listFn = () => of({ content: [], totalElements: 0, number: 0, size: 100 });
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('empty');
  }));

  it('flags only APPLIED rows as awaiting decision', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(fixture.componentInstance.isAwaitingDecision(APPLIED)).toBe(true);
    expect(fixture.componentInstance.isAwaitingDecision(ACCEPTED)).toBe(false);
  });

  it('accepts an applicant and updates the row in place', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.decide(101, true);
    tick();
    expect(api.decisions).toEqual([{ id: 101, accept: true }]);
    const row = fixture.componentInstance.items().find((r) => r.id === 101);
    expect(row?.opportunityStatus?.value).toBe(OpportunityStatus.ACCEPTED_BY_COMPANY);
    expect(fixture.componentInstance.pendingDecisions().has(101)).toBe(false);
  }));

  it('rejects an applicant', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.decide(101, false);
    tick();
    expect(api.decisions).toEqual([{ id: 101, accept: false }]);
    const row = fixture.componentInstance.items().find((r) => r.id === 101);
    expect(row?.opportunityStatus?.value).toBe(OpportunityStatus.REJECTED_BY_COMPANY);
  }));

  it('skips a duplicate decide call while one is in flight', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    // Stub the second decide before the first responds to verify guarding
    fixture.componentInstance.pendingDecisions.update((s) => new Set([...s, 101]));
    fixture.componentInstance.decide(101, true);
    expect(api.decisions.length).toBe(0);
  }));

  it('clears pending flag if the API errors', fakeAsync(() => {
    const api = new FakeApi();
    api.updateOpportunityStatus = () => throwError(() => ({ status: 500 }));
    const fixture = create(api);
    tick();
    fixture.componentInstance.decide(101, true);
    tick();
    expect(fixture.componentInstance.pendingDecisions().has(101)).toBe(false);
  }));
});
