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
import { AppliedOpportunitiesListComponent } from './applied-opportunities-list.component';

const SAMPLE: AppliedOpportunityDtoOut = {
  id: 1,
  createdTime: '2026-04-12T10:00:00Z',
  opportunityStatus: { value: OpportunityStatus.APPLIED, label: 'Applied' } as never,
  partnershipOpportunity: { id: 11, title: 'Test campaign' } as never,
};

class FakeApi {
  next: () => Observable<PageAppliedOpportunityDtoOut> = () =>
    of({ content: [SAMPLE], totalElements: 1, number: 0, size: 20 });
  lastPage = -1;
  lastSize = -1;
  list(page: number, size: number): Observable<PageAppliedOpportunityDtoOut> {
    this.lastPage = page;
    this.lastSize = size;
    return this.next();
  }
}

function create(api: FakeApi): ComponentFixture<AppliedOpportunitiesListComponent> {
  TestBed.configureTestingModule({
    imports: [
      AppliedOpportunitiesListComponent,
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
    ],
  });
  const fixture = TestBed.createComponent(AppliedOpportunitiesListComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AppliedOpportunitiesListComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads first page on init', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();

    expect(api.lastPage).toBe(0);
    expect(api.lastSize).toBe(50);
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.items()).toHaveLength(1);
    expect(fixture.componentInstance.totalElements()).toBe(1);
  }));

  it('lands in empty state when content is empty', fakeAsync(() => {
    const api = new FakeApi();
    api.next = () => of({ content: [], totalElements: 0, number: 0, size: 20 });
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('empty');
  }));

  it('lands in error state when list throws', fakeAsync(() => {
    const api = new FakeApi();
    api.next = () => throwError(() => new Error('boom'));
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('error');
  }));

  it('reloads with new page from paginator', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();

    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 50, length: 75 });
    tick();

    expect(api.lastPage).toBe(1);
    expect(api.lastSize).toBe(50);
    expect(fixture.componentInstance.pageIndex()).toBe(1);
  }));

  it('classifies APPLIED as slate', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(fixture.componentInstance.statusBadgeClass(OpportunityStatus.APPLIED)).toContain(
      'bg-slate-100',
    );
  });

  it('classifies ACCEPTED_BY_COMPANY as emerald', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(
      fixture.componentInstance.statusBadgeClass(OpportunityStatus.ACCEPTED_BY_COMPANY),
    ).toContain('bg-emerald-100');
  });

  it('classifies REJECTED_BY_COMPANY as red', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(
      fixture.componentInstance.statusBadgeClass(OpportunityStatus.REJECTED_BY_COMPANY),
    ).toContain('bg-red-100');
  });

  it('classifies CONTENT_SEND_TO_ACCEPT as blue', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(
      fixture.componentInstance.statusBadgeClass(OpportunityStatus.CONTENT_SEND_TO_ACCEPT),
    ).toContain('bg-blue-100');
  });

  it('classifies TO_BE_PAID as amber', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(fixture.componentInstance.statusBadgeClass(OpportunityStatus.TO_BE_PAID)).toContain(
      'bg-amber-100',
    );
  });

  it('falls back to slate for unknown status', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(fixture.componentInstance.statusBadgeClass('GIBBERISH')).toContain('bg-slate-100');
  });

  it('buckets items into in-progress / applications / completed', fakeAsync(() => {
    const mk = (id: number, v: OpportunityStatus): AppliedOpportunityDtoOut => ({
      id,
      createdTime: '2026-04-12T10:00:00Z',
      opportunityStatus: { value: v, label: '' } as never,
      partnershipOpportunity: { id: 1, title: 'X' } as never,
    });
    const api = new FakeApi();
    api.next = () =>
      of({
        content: [
          mk(1, OpportunityStatus.APPLIED),
          mk(2, OpportunityStatus.APPLIED),
          mk(3, OpportunityStatus.ACCEPTED_BY_COMPANY),
          mk(4, OpportunityStatus.CONTENT_POSTED),
          mk(5, OpportunityStatus.DONE),
          mk(6, OpportunityStatus.REJECTED_BY_COMPANY),
        ],
        totalElements: 6,
        number: 0,
        size: 50,
      });
    const fixture = create(api);
    tick();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.applicationsCount()).toBe(2);
    expect(c.inProgressCount()).toBe(2);
    expect(c.completedCount()).toBe(2);
  }));

  it('switches tab and filters visible items', fakeAsync(() => {
    const mk = (id: number, v: OpportunityStatus): AppliedOpportunityDtoOut => ({
      id,
      createdTime: '2026-04-12T10:00:00Z',
      opportunityStatus: { value: v, label: '' } as never,
      partnershipOpportunity: { id: 1, title: 'X' } as never,
    });
    const api = new FakeApi();
    api.next = () =>
      of({
        content: [
          mk(1, OpportunityStatus.APPLIED),
          mk(2, OpportunityStatus.ACCEPTED_BY_COMPANY),
          mk(3, OpportunityStatus.DONE),
        ],
        totalElements: 3,
        number: 0,
        size: 50,
      });
    const fixture = create(api);
    tick();
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // default = applications
    expect(c.activeTab()).toBe('applications');
    expect(c.visibleItems().map((r) => r.id)).toEqual([1]);

    c.setTabFromIndex(0);
    tick();
    expect(c.activeTab()).toBe('in-progress');
    expect(c.visibleItems().map((r) => r.id)).toEqual([2]);

    c.setTabFromIndex(2);
    tick();
    expect(c.activeTab()).toBe('completed');
    expect(c.visibleItems().map((r) => r.id)).toEqual([3]);
  }));

  it('selects the bucket from the ?tab deep link', fakeAsync(() => {
    const api = new FakeApi();
    TestBed.configureTestingModule({
      imports: [
        AppliedOpportunitiesListComponent,
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
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ tab: 'in-progress' })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(AppliedOpportunitiesListComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.activeTab()).toBe('in-progress');
    expect(fixture.componentInstance.activeTabIndex()).toBe(0);
  }));

  it('ignores an invalid ?tab value and keeps the default bucket', fakeAsync(() => {
    const api = new FakeApi();
    TestBed.configureTestingModule({
      imports: [
        AppliedOpportunitiesListComponent,
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
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ tab: 'gibberish' })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(AppliedOpportunitiesListComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.activeTab()).toBe('applications');
  }));
});
