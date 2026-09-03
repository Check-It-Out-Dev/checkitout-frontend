import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { SessionStateService } from '../../core/auth/session-state.service';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { OpportunityDetailComponent } from './opportunity-detail.component';

const OPP: PartnershipOpportunityDtoOut = {
  id: 7,
  title: 'Test campaign',
  details: 'Body copy',
};

class FakeOppApi {
  next: () => Observable<PartnershipOpportunityDtoOut> = () => of(OPP);
  getById(): Observable<PartnershipOpportunityDtoOut> {
    return this.next();
  }
}

class FakeApplyApi {
  next: () => Observable<AppliedOpportunityDtoOut> = () =>
    of({ id: 1 } as AppliedOpportunityDtoOut);
  /** Apply-guard #2 pre-check source — defaults to "not applied yet". */
  listNext: () => Observable<PageAppliedOpportunityDtoOut> = () =>
    of({ content: [], totalElements: 0 } as PageAppliedOpportunityDtoOut);
  lastNote?: string;
  lastOppId?: number;
  apply(oppId: number, note?: string): Observable<AppliedOpportunityDtoOut> {
    this.lastOppId = oppId;
    this.lastNote = note;
    return this.next();
  }
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return this.listNext();
  }
}

/** Session stub — role drives the apply-guards; default INFLUENCER. */
function sessionStub(userType: string | null = 'INFLUENCER') {
  return { user: signal(userType ? { userType: { value: userType } } : null) };
}

function routeStub(idValue: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: { get: (k: string) => (k === 'id' ? idValue : null) } },
  } as unknown as ActivatedRoute;
}

function create(
  oppApi: FakeOppApi,
  applyApi: FakeApplyApi,
  idValue: string | null = '7',
  userType: string | null = 'INFLUENCER',
): ComponentFixture<OpportunityDetailComponent> {
  TestBed.configureTestingModule({
    imports: [
      OpportunityDetailComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: routeStub(idValue) },
      { provide: OpportunityApiService, useValue: oppApi },
      { provide: AppliedOpportunityApiService, useValue: applyApi },
      { provide: SessionStateService, useValue: sessionStub(userType) },
    ],
  });
  const fixture = TestBed.createComponent(OpportunityDetailComponent);
  fixture.detectChanges();
  return fixture;
}

describe('OpportunityDetailComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lands in not_found when route param is missing', () => {
    const fixture = create(new FakeOppApi(), new FakeApplyApi(), null);
    expect(fixture.componentInstance.state()).toBe('not_found');
  });

  it('lands in not_found when route param is non-numeric', () => {
    const fixture = create(new FakeOppApi(), new FakeApplyApi(), 'abc');
    expect(fixture.componentInstance.state()).toBe('not_found');
  });

  it('loads the opportunity on init', fakeAsync(() => {
    const fixture = create(new FakeOppApi(), new FakeApplyApi());
    tick();

    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.opp()?.id).toBe(7);
  }));

  it('lands in not_found on a 404 from getById', fakeAsync(() => {
    const oppApi = new FakeOppApi();
    oppApi.next = () => throwError(() => new HttpErrorResponse({ status: 404 }));
    const fixture = create(oppApi, new FakeApplyApi());
    tick();

    expect(fixture.componentInstance.state()).toBe('not_found');
  }));

  it('lands in error on a non-404 failure', fakeAsync(() => {
    const oppApi = new FakeOppApi();
    oppApi.next = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = create(oppApi, new FakeApplyApi());
    tick();

    expect(fixture.componentInstance.state()).toBe('error');
  }));

  // Apply-guard #1 — role: a company account gets the informational note,
  // never a form that would only hit the BE's 403.
  it('hides the apply form and shows the company note for COMPANY accounts', fakeAsync(() => {
    const fixture = create(new FakeOppApi(), new FakeApplyApi(), '7', 'COMPANY');
    tick();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="opportunity-detail-company-note"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="opportunity-detail-apply-button"]')).toBeNull();
  }));

  it('admins see neither the apply form nor the company note', fakeAsync(() => {
    const fixture = create(new FakeOppApi(), new FakeApplyApi(), '7', 'ADMIN');
    tick();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="opportunity-detail-company-note"]')).toBeNull();
    expect(el.querySelector('[data-testid="opportunity-detail-apply-button"]')).toBeNull();
  }));

  // Apply-guard #2 — pre-check: a revisit renders "applied" up front instead
  // of letting the user click into the BE's 409.
  it('pre-marks applied when my applications already contain this opportunity', fakeAsync(() => {
    const applyApi = new FakeApplyApi();
    applyApi.listNext = () =>
      of({
        content: [{ id: 99, partnershipOpportunity: { id: 7 } } as AppliedOpportunityDtoOut],
        totalElements: 1,
      } as PageAppliedOpportunityDtoOut);
    const fixture = create(new FakeOppApi(), applyApi);
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.applyState()).toBe('applied');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="opportunity-detail-applied"]')).not.toBeNull();
  }));

  it('a failed pre-check degrades gracefully — the form stays usable', fakeAsync(() => {
    const applyApi = new FakeApplyApi();
    applyApi.listNext = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = create(new FakeOppApi(), applyApi);
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.applyState()).toBe('idle');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="opportunity-detail-apply-button"]')).not.toBeNull();
  }));

  it('apply success transitions to applied state with submitted note', fakeAsync(() => {
    const applyApi = new FakeApplyApi();
    const fixture = create(new FakeOppApi(), applyApi);
    tick();

    fixture.componentInstance.noteControl.setValue('Excited to participate!');
    fixture.componentInstance.apply();
    tick();

    expect(applyApi.lastOppId).toBe(7);
    expect(applyApi.lastNote).toBe('Excited to participate!');
    expect(fixture.componentInstance.applyState()).toBe('applied');
  }));

  it('apply with empty note sends undefined (not empty string)', fakeAsync(() => {
    const applyApi = new FakeApplyApi();
    const fixture = create(new FakeOppApi(), applyApi);
    tick();

    fixture.componentInstance.apply();
    tick();

    expect(applyApi.lastNote).toBeUndefined();
  }));

  it('classifies HTTP 409 as already_applied', fakeAsync(() => {
    const applyApi = new FakeApplyApi();
    applyApi.next = () => throwError(() => new HttpErrorResponse({ status: 409 }));
    const fixture = create(new FakeOppApi(), applyApi);
    tick();

    fixture.componentInstance.apply();
    tick();

    expect(fixture.componentInstance.applyState()).toBe('error');
    expect(fixture.componentInstance.applyErrorKey()).toBe(
      'opportunities.detail.apply.errors.already_applied',
    );
  }));

  it('does not double-submit while applying', fakeAsync(() => {
    const applyApi = new FakeApplyApi();
    let calls = 0;
    applyApi.next = () => {
      calls += 1;
      return new Observable<AppliedOpportunityDtoOut>(() => undefined);
    };
    const fixture = create(new FakeOppApi(), applyApi);
    tick();

    fixture.componentInstance.apply();
    fixture.componentInstance.apply();
    tick();

    expect(calls).toBe(1);
  }));

  it('does not call BE when note exceeds maxLength', fakeAsync(() => {
    const applyApi = new FakeApplyApi();
    const spy = jest.spyOn(applyApi, 'apply');
    const fixture = create(new FakeOppApi(), applyApi);
    tick();

    fixture.componentInstance.noteControl.setValue('x'.repeat(501));
    fixture.componentInstance.apply();
    tick();

    expect(spy).not.toHaveBeenCalled();
  }));
});
