import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { AppliedOpportunityContentApiService } from '../../core/applied-opportunities/applied-opportunity-content.service';
import { ContentReviewComponent } from './content-review.component';

const APPLICATION: AppliedOpportunityDtoOut = {
  id: 42,
  partnershipOpportunity: { id: 7, title: 'Spring promo' } as never,
};
const APPLICATION_RATED: AppliedOpportunityDtoOut = {
  ...APPLICATION,
  companyRateStatus: { value: 'POSITIVE', label: 'Positive' } as never,
};

const PENDING: AppliedOpportunityContentDtoOut = {
  id: 11,
  contentTypeId: 1,
  contentTypeName: 'Post',
  socialMediaLink: 'https://instagram.com/p/abc',
  approvalStatus: 'PENDING' as never,
};
const APPROVED: AppliedOpportunityContentDtoOut = {
  id: 12,
  contentTypeId: 2,
  contentTypeName: 'Reel',
  approvalStatus: 'APPROVED' as never,
};

class FakeApi {
  approveCalls: number[] = [];
  rejectCalls: number[] = [];
  rejectNotes: (string | undefined)[] = [];
  listFn: () => Observable<AppliedOpportunityContentDtoOut[]> = () => of([PENDING, APPROVED]);
  approveFn: (id: number) => Observable<unknown> = () => of(undefined);
  rejectFn: (id: number) => Observable<unknown> = () => of(undefined);
  listForAppliedOpportunity = (_id: number) => this.listFn();
  approve = (id: number) => {
    this.approveCalls.push(id);
    return this.approveFn(id);
  };
  reject = (id: number, approvalNotes?: string) => {
    this.rejectCalls.push(id);
    this.rejectNotes.push(approvalNotes);
    return this.rejectFn(id);
  };
}

class FakeAppliedApi {
  rateCalls: { id: number; rating: string }[] = [];
  getByIdFn: () => Observable<AppliedOpportunityDtoOut> = () => of(APPLICATION);
  rateInfluencerFn: (id: number, rating: string) => Observable<AppliedOpportunityDtoOut> = (
    _id,
    _rating,
  ) => of(APPLICATION_RATED);
  getById = (_id: number) => this.getByIdFn();
  rateInfluencer = (id: number, rating: string) => {
    this.rateCalls.push({ id, rating });
    return this.rateInfluencerFn(id, rating);
  };
}

function create(
  api: FakeApi,
  paramId: string | null = '42',
  appliedApi: FakeAppliedApi = new FakeAppliedApi(),
): ComponentFixture<ContentReviewComponent> {
  const fakeRoute = {
    snapshot: { paramMap: convertToParamMap(paramId === null ? {} : { id: paramId }) },
  } as unknown as ActivatedRoute;
  TestBed.configureTestingModule({
    imports: [
      ContentReviewComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: AppliedOpportunityContentApiService, useValue: api },
      { provide: AppliedOpportunityApiService, useValue: appliedApi },
      { provide: ActivatedRoute, useValue: fakeRoute },
    ],
  });
  const fixture = TestBed.createComponent(ContentReviewComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ContentReviewComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders influencer-reported engagement metrics read-only (audit P1)', fakeAsync(() => {
    const api = new FakeApi();
    api.listFn = () =>
      of([{ ...APPROVED, likesCount: 1500, commentsCount: 250, viewsCount: 10000 }]);
    const fixture = create(api);
    tick();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const metrics = host.querySelector('[data-testid="review-metrics-12"]');
    expect(metrics).not.toBeNull();
    expect(metrics?.textContent).toContain('1500');
    expect(metrics?.textContent).toContain('10000');
    // No metrics reported → the block is absent entirely.
    api.listFn = () => of([APPROVED]);
    fixture.componentInstance.load(42);
    tick();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="review-metrics-12"]')).toBeNull();
  }));

  it('loads content rows for the applied opportunity', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.items().length).toBe(2);
    expect(fixture.componentInstance.appliedOpportunityId()).toBe(42);
  }));

  it('marks not-found when the route id is missing or non-numeric', () => {
    const api = new FakeApi();
    const fixture = create(api, 'abc');
    expect(fixture.componentInstance.state()).toBe('not-found');
  });

  it('shows empty state when no content has been submitted', fakeAsync(() => {
    const api = new FakeApi();
    api.listFn = () => of([]);
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('empty');
  }));

  it('flags only PENDING (or unset) rows as awaiting', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(fixture.componentInstance.isAwaiting(PENDING)).toBe(true);
    expect(fixture.componentInstance.isAwaiting(APPROVED)).toBe(false);
  });

  it('approves a row and patches its status in place', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.approve(11);
    tick();
    expect(api.approveCalls).toEqual([11]);
    const row = fixture.componentInstance.items().find((r) => r.id === 11);
    expect(row?.approvalStatus).toBe('APPROVED');
    expect(fixture.componentInstance.pendingDecisions().has(11)).toBe(false);
  }));

  it('two-step reject: arm → confirm sends trimmed notes and patches row + note', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    const c = fixture.componentInstance;

    c.armReject(11);
    expect(c.rejectArmedId()).toBe(11);
    c.rejectNotes.setValue('  Logo obscured in frames 2–3.  ');
    c.confirmReject(11);
    tick();

    expect(api.rejectCalls).toEqual([11]);
    expect(api.rejectNotes).toEqual(['  Logo obscured in frames 2–3.  ']); // wrapper trims
    const row = c.items().find((r) => r.id === 11);
    expect(row?.approvalStatus).toBe('REJECTED');
    expect(row?.approvalNotes).toBe('Logo obscured in frames 2–3.');
    expect(c.rejectArmedId()).toBeNull();
    expect(c.rejectNotes.value).toBe('');
  }));

  it('cancelReject disarms without calling the BE; re-arming another row clears the draft', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    const c = fixture.componentInstance;

    c.armReject(11);
    c.rejectNotes.setValue('draft');
    c.cancelReject();
    expect(c.rejectArmedId()).toBeNull();
    expect(api.rejectCalls).toHaveLength(0);

    c.armReject(11);
    c.rejectNotes.setValue('first draft');
    c.armReject(12);
    expect(c.rejectNotes.value).toBe('');
    expect(c.rejectArmedId()).toBe(12);
  }));

  it('confirmReject refuses when notes exceed 500 chars', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    const c = fixture.componentInstance;
    c.armReject(11);
    c.rejectNotes.setValue('a'.repeat(501));
    c.confirmReject(11);
    expect(api.rejectCalls).toHaveLength(0);
  }));

  it('skips a duplicate decide call while one is in flight', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.pendingDecisions.update((s) => new Set([...s, 11]));
    fixture.componentInstance.approve(11);
    expect(api.approveCalls.length).toBe(0);
  }));

  it('clears pending flag if the API errors', fakeAsync(() => {
    const api = new FakeApi();
    api.approveFn = () => throwError(() => ({ status: 500 }));
    const fixture = create(api);
    tick();
    fixture.componentInstance.approve(11);
    tick();
    expect(fixture.componentInstance.pendingDecisions().has(11)).toBe(false);
  }));

  it('returns the right badge class per status', () => {
    const api = new FakeApi();
    const fixture = create(api);
    expect(fixture.componentInstance.badgeClass('APPROVED')).toContain('emerald');
    expect(fixture.componentInstance.badgeClass('REJECTED')).toContain('red');
    expect(fixture.componentInstance.badgeClass('PENDING')).toContain('slate');
    expect(fixture.componentInstance.badgeClass(undefined)).toContain('slate');
  });

  it('shows rate-influencer panel only when at least one content row is APPROVED', fakeAsync(() => {
    const api = new FakeApi();
    const appliedApi = new FakeAppliedApi();
    const fixture = create(api, '42', appliedApi);
    tick();
    // PENDING + APPROVED → at least one approved → can rate
    expect(fixture.componentInstance.canRateInfluencer()).toBe(true);
    expect(fixture.componentInstance.hasRatedInfluencer()).toBe(false);
  }));

  it('hides rate-influencer panel when no content has been approved', fakeAsync(() => {
    const api = new FakeApi();
    api.listFn = () => of([PENDING]);
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.canRateInfluencer()).toBe(false);
  }));

  it('rates the influencer positively + updates application in place', fakeAsync(() => {
    const api = new FakeApi();
    const appliedApi = new FakeAppliedApi();
    const fixture = create(api, '42', appliedApi);
    tick();
    fixture.componentInstance.rateInfluencer('POSITIVE');
    tick();
    expect(appliedApi.rateCalls).toEqual([{ id: 42, rating: 'POSITIVE' }]);
    expect(fixture.componentInstance.influencerRatingFromCompany()).toBe('POSITIVE');
    expect(fixture.componentInstance.hasRatedInfluencer()).toBe(true);
  }));

  it('maps 403 to forbidden error key', fakeAsync(() => {
    const api = new FakeApi();
    const appliedApi = new FakeAppliedApi();
    appliedApi.rateInfluencerFn = () => throwError(() => ({ status: 403 }));
    const fixture = create(api, '42', appliedApi);
    tick();
    fixture.componentInstance.rateInfluencer('POSITIVE');
    tick();
    expect(fixture.componentInstance.ratingErrorKey()).toBe(
      'applied_opportunities.rating_company.error.forbidden',
    );
  }));
});
