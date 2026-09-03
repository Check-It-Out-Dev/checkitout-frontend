import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityStatisticsDto } from '../../api/model/applied-opportunity-statistics-dto';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { SessionStateService } from '../../core/auth/session-state.service';
import { CollaborationDashboardComponent } from './collaboration-dashboard.component';

function row(
  id: number,
  status: OpportunityStatus,
  extra: Partial<AppliedOpportunityDtoOut> = {},
): AppliedOpportunityDtoOut {
  return {
    id,
    createdTime: '2026-06-01T10:00:00Z',
    opportunityStatus: { value: status, label: status } as never,
    influencer: { id: 7, name: 'Marta Vlogs' } as never,
    partnershipOpportunity: {
      id: 70 + id,
      title: `Campaign ${id}`,
      company: { id: 3, name: 'Bistro Widok' },
    } as never,
    ...extra,
  };
}

class FakeApi {
  next: () => Observable<PageAppliedOpportunityDtoOut> = () =>
    of({
      content: [row(1, OpportunityStatus.CONTENT_SEND_TO_ACCEPT)],
      totalElements: 1,
      number: 0,
      size: 6,
    });
  stats: AppliedOpportunityStatisticsDto = {
    inProgress: 4,
    newOpportunities: 2,
    done: 3,
    total: 9,
  };
  lastFilters: Record<string, string> | undefined;
  lastPage = -1;

  list(
    page: number,
    _size: number,
    filters?: Record<string, string>,
  ): Observable<PageAppliedOpportunityDtoOut> {
    this.lastPage = page;
    this.lastFilters = filters;
    return this.next();
  }
  getStatistics(): Observable<AppliedOpportunityStatisticsDto> {
    return of(this.stats);
  }
}

function sessionAs(role: 'COMPANY' | 'INFLUENCER'): Partial<SessionStateService> {
  return {
    user: signal({ id: 1, userType: { value: role } } as never).asReadonly(),
  } as Partial<SessionStateService>;
}

function create(
  api: FakeApi,
  role: 'COMPANY' | 'INFLUENCER',
  tab: 'in-progress' | 'finished' = 'in-progress',
): ComponentFixture<CollaborationDashboardComponent> {
  TestBed.configureTestingModule({
    imports: [
      CollaborationDashboardComponent,
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
      { provide: ActivatedRoute, useValue: { data: of({ collabTab: tab }) } },
      { provide: SessionStateService, useValue: sessionAs(role) },
    ],
  });
  const fixture = TestBed.createComponent(CollaborationDashboardComponent);
  fixture.detectChanges();
  return fixture;
}

describe('CollaborationDashboardComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the in-progress bucket with the server-side status filter', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'COMPANY');
    tick();

    expect(api.lastPage).toBe(0);
    expect(api.lastFilters?.['opportunityStatus']).toBe(
      [
        OpportunityStatus.ACCEPTED_BY_INFLUENCER,
        OpportunityStatus.CONTENT_SEND_TO_ACCEPT,
        OpportunityStatus.CONTENT_APPROVED,
        OpportunityStatus.CONTENT_REJECTED,
        OpportunityStatus.CONTENT_POSTED,
        OpportunityStatus.CONTENT_POSTED_REJECTED,
        OpportunityStatus.TO_BE_PAID,
      ].join(','),
    );
    expect(fixture.componentInstance.state()).toBe('loaded');
  }));

  it('loads the finished bucket when the route says so', fakeAsync(() => {
    const api = new FakeApi();
    create(api, 'INFLUENCER', 'finished');
    tick();

    expect(api.lastFilters?.['opportunityStatus']).toBe(
      [
        OpportunityStatus.DONE,
        OpportunityStatus.REJECTED_BY_COMPANY,
        OpportunityStatus.REJECTED_BY_INFLUENCER,
      ].join(','),
    );
  }));

  it('exposes the statistics counters on the tab labels', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'COMPANY');
    tick();

    expect(fixture.componentInstance.inProgressCount()).toBe(4);
    expect(fixture.componentInstance.registrationsCount()).toBe(2);
    expect(fixture.componentInstance.finishedCount()).toBe(3);
  }));

  it('gives the company an amber review CTA at CONTENT_SEND_TO_ACCEPT', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'COMPANY');
    tick();

    const cta = fixture.componentInstance.cta(row(1, OpportunityStatus.CONTENT_SEND_TO_ACCEPT));
    expect(cta.tone).toBe('act');
    expect(cta.labelKey).toBe('review_content');
    expect(cta.link).toEqual(['/collaborations', 'applications', 1, 'review']);
  }));

  it('gives the influencer an amber submit CTA at CONTENT_REJECTED and publish at CONTENT_APPROVED', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'INFLUENCER');
    tick();

    const resubmit = fixture.componentInstance.cta(row(2, OpportunityStatus.CONTENT_REJECTED));
    expect(resubmit.tone).toBe('act');
    expect(resubmit.labelKey).toBe('submit_content');
    expect(resubmit.link).toEqual(['/collaborations', 'registrations', 2, 'content']);

    const publish = fixture.componentInstance.cta(row(3, OpportunityStatus.CONTENT_APPROVED));
    expect(publish.tone).toBe('act');
    expect(publish.labelKey).toBe('publish_content');
  }));

  it('asks for a rating on DONE only while the own-side rating is DEFAULT', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'INFLUENCER', 'finished');
    tick();

    const unrated = fixture.componentInstance.cta(
      row(4, OpportunityStatus.DONE, { rateStatus: { value: 'DEFAULT' } as never }),
    );
    expect(unrated.labelKey).toBe('rate');
    expect(unrated.tone).toBe('act');

    const rated = fixture.componentInstance.cta(
      row(5, OpportunityStatus.DONE, { rateStatus: { value: 'POSITIVE' } as never }),
    );
    expect(rated.labelKey).toBe('view');
    expect(rated.tone).toBe('view');
  }));

  it('maps statuses onto the 8-step workflow (rejections pin to their phase)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'COMPANY');
    tick();
    const c = fixture.componentInstance;

    expect(c.step(OpportunityStatus.ACCEPTED_BY_INFLUENCER)).toBe(3);
    expect(c.step(OpportunityStatus.CONTENT_REJECTED)).toBe(4);
    expect(c.step(OpportunityStatus.CONTENT_POSTED_REJECTED)).toBe(6);
    expect(c.step(OpportunityStatus.DONE)).toBe(8);
    expect(c.progressPercent(OpportunityStatus.TO_BE_PAID)).toBe(88);
  }));

  it('shows the counterparty per role', fakeAsync(() => {
    const api = new FakeApi();
    const company = create(api, 'COMPANY');
    tick();
    expect(company.componentInstance.counterpartyName(row(1, OpportunityStatus.DONE))).toBe(
      'Marta Vlogs',
    );
    TestBed.resetTestingModule();

    const influencer = create(new FakeApi(), 'INFLUENCER');
    tick();
    expect(influencer.componentInstance.counterpartyName(row(1, OpportunityStatus.DONE))).toBe(
      'Bistro Widok',
    );
  }));

  it('lands in empty state and surfaces load errors', fakeAsync(() => {
    const api = new FakeApi();
    api.next = () => of({ content: [], totalElements: 0, number: 0, size: 6 });
    const fixture = create(api, 'COMPANY');
    tick();
    expect(fixture.componentInstance.state()).toBe('empty');
    TestBed.resetTestingModule();

    const failing = new FakeApi();
    failing.next = () => throwError(() => ({ status: 500 }));
    const errored = create(failing, 'COMPANY');
    tick();
    expect(errored.componentInstance.state()).toBe('error');
  }));

  it('navigates between tab routes on tab change (registrations goes to the ported list)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'COMPANY');
    tick();
    const router = TestBed.inject(Router);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.onTabIndexChange(1);
    expect(navigate).toHaveBeenCalledWith(['/collaborations', 'registrations']);
    fixture.componentInstance.onTabIndexChange(2);
    expect(navigate).toHaveBeenCalledWith(['/collaborations', 'finished']);
  }));
});
