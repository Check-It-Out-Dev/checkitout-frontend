import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityStatusHistoryDtoOut } from '../../api/model/applied-opportunity-status-history-dto-out';
import { OpportunityStatus } from '../../api/model/opportunity-status';
import type { PaymentContactDto } from '../../api/model/payment-contact-dto';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { AppliedOpportunityDetailComponent } from './applied-opportunity-detail.component';

const APP: AppliedOpportunityDtoOut = {
  id: 42,
  createdTime: '2026-04-12T10:00:00Z',
  opportunityStatus: { value: OpportunityStatus.CONTENT_SEND_TO_ACCEPT, label: '...' } as never,
  partnershipOpportunity: { id: 99, title: 'Spring promo' } as never,
  note: 'I love spring shoots!',
};

const HISTORY: AppliedOpportunityStatusHistoryDtoOut[] = [
  {
    id: 1,
    appliedOpportunityId: 42,
    newStatus: OpportunityStatus.APPLIED,
    changedAt: '2026-04-12T10:00:00Z',
    changedByUserName: 'Anna Nowak',
  },
  {
    id: 2,
    appliedOpportunityId: 42,
    previousStatus: OpportunityStatus.APPLIED,
    newStatus: OpportunityStatus.CONTENT_SEND_TO_ACCEPT,
    changedAt: '2026-04-15T14:30:00Z',
    changedByUserName: 'Anna Nowak',
    changeReason: 'Submitted draft posts',
  },
];

const PAYMENT_CONTACT: PaymentContactDto = {
  name: 'Acme Sp. z o.o.',
  email: 'billing@acme.example',
  phone: '+48 123 456 789',
};

class FakeApi {
  rateCalls: { id: number; rating: string }[] = [];
  paymentContactCalls: number[] = [];
  statusCalls: { id: number; accept: boolean }[] = [];
  historyCalls = 0;
  getByIdFn: () => Observable<AppliedOpportunityDtoOut> = () => of(APP);
  rateCompanyFn: () => Observable<AppliedOpportunityDtoOut> = () =>
    of({ ...APP, rateStatus: { value: 'POSITIVE', label: 'Positive' } as never });
  paymentContactFn: () => Observable<PaymentContactDto> = () => of(PAYMENT_CONTACT);
  updateOpportunityStatusFn: (accept: boolean) => Observable<AppliedOpportunityDtoOut> = (accept) =>
    of({
      ...APP,
      opportunityStatus: {
        value: accept
          ? OpportunityStatus.ACCEPTED_BY_INFLUENCER
          : OpportunityStatus.REJECTED_BY_INFLUENCER,
        label: '...',
      } as never,
    });
  getById = (_id: number) => this.getByIdFn();
  getStatusHistory = (_id: number): Observable<AppliedOpportunityStatusHistoryDtoOut[]> => {
    this.historyCalls++;
    return of(HISTORY);
  };
  rateCompany = (id: number, rating: string) => {
    this.rateCalls.push({ id, rating });
    return this.rateCompanyFn();
  };
  getPaymentContact = (id: number) => {
    this.paymentContactCalls.push(id);
    return this.paymentContactFn();
  };
  updateOpportunityStatus = (id: number, accept: boolean) => {
    this.statusCalls.push({ id, accept });
    return this.updateOpportunityStatusFn(accept);
  };
}

function create(
  api: FakeApi,
  paramId: string | null = '42',
): ComponentFixture<AppliedOpportunityDetailComponent> {
  const fakeRoute = {
    snapshot: { paramMap: convertToParamMap(paramId === null ? {} : { id: paramId }) },
  } as unknown as ActivatedRoute;
  TestBed.configureTestingModule({
    imports: [
      AppliedOpportunityDetailComponent,
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
  const fixture = TestBed.createComponent(AppliedOpportunityDetailComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AppliedOpportunityDetailComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads application + status history on init and renders both', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.application()?.id).toBe(42);
    expect(fixture.componentInstance.history().length).toBe(2);
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('Spring promo');
    expect(html).toContain('I love spring shoots!');
  }));

  it('sorts history newest-first', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.detectChanges();
    const ids = fixture.componentInstance.history().map((h) => h.id);
    expect(ids).toEqual([2, 1]);
  }));

  it('marks state not-found when id param is missing or non-numeric', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, 'abc');
    tick();
    expect(fixture.componentInstance.state()).toBe('not-found');
  }));

  it('marks state not-found on 404', fakeAsync(() => {
    const api = new FakeApi();
    api.getById = () => throwError(() => ({ status: 404 }));
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('not-found');
  }));

  it('marks state error on non-404 failure', fakeAsync(() => {
    const api = new FakeApi();
    api.getById = () => throwError(() => ({ status: 500 }));
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
  }));

  it('still loads when the secondary status-history call fails (parity sweep)', fakeAsync(() => {
    const api = new FakeApi();
    // Application loads fine; the history sub-call 500s — the page must
    // NOT go to the error state, it renders with an empty history strip.
    api.getStatusHistory = () => throwError(() => ({ status: 500 }));
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.history()).toEqual([]);
    expect(fixture.componentInstance.application()?.id).toBe(APP.id);
  }));

  it('hides rating panel until status >= CONTENT_POSTED', fakeAsync(() => {
    // APP has CONTENT_SEND_TO_ACCEPT — rating still locked
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.canRateCompany()).toBe(false);
  }));

  it('opens rating panel once status reaches CONTENT_POSTED', fakeAsync(() => {
    const posted: AppliedOpportunityDtoOut = {
      ...APP,
      opportunityStatus: { value: OpportunityStatus.CONTENT_POSTED, label: '...' } as never,
    };
    const api = new FakeApi();
    api.getByIdFn = () => of(posted);
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.canRateCompany()).toBe(true);
    expect(fixture.componentInstance.hasRatedCompany()).toBe(false);
  }));

  it('rates the company positively + updates application in place', fakeAsync(() => {
    const posted: AppliedOpportunityDtoOut = {
      ...APP,
      opportunityStatus: { value: OpportunityStatus.CONTENT_POSTED, label: '...' } as never,
    };
    const api = new FakeApi();
    api.getByIdFn = () => of(posted);
    const fixture = create(api);
    tick();
    fixture.componentInstance.rateCompany('POSITIVE');
    tick();
    expect(api.rateCalls).toEqual([{ id: 42, rating: 'POSITIVE' }]);
    expect(fixture.componentInstance.companyRatingFromInfluencer()).toBe('POSITIVE');
    expect(fixture.componentInstance.hasRatedCompany()).toBe(true);
  }));

  it('maps 403 to forbidden error key on rateCompany', fakeAsync(() => {
    const posted: AppliedOpportunityDtoOut = {
      ...APP,
      opportunityStatus: { value: OpportunityStatus.CONTENT_POSTED, label: '...' } as never,
    };
    const api = new FakeApi();
    api.getByIdFn = () => of(posted);
    api.rateCompanyFn = () => throwError(() => ({ status: 403 }));
    const fixture = create(api);
    tick();
    fixture.componentInstance.rateCompany('POSITIVE');
    tick();
    expect(fixture.componentInstance.ratingErrorKey()).toBe(
      'applied_opportunities.rating.error.forbidden',
    );
  }));

  // Iter-49 P0 #5 — influencer accept/decline of the company's offer.
  // ACCEPTED_BY_COMPANY parks the application until the influencer
  // counter-signs: PATCH ?accept=true|false moves it to
  // ACCEPTED_BY_INFLUENCER / REJECTED_BY_INFLUENCER. Legacy renders a
  // two-step confirmation ("Accept this offer?" → "cannot be undone"),
  // mirrored here as arm → confirm.
  describe('influencer accept/decline (iter-49 P0 #5)', () => {
    const awaiting: AppliedOpportunityDtoOut = {
      ...APP,
      opportunityStatus: { value: OpportunityStatus.ACCEPTED_BY_COMPANY, label: '...' } as never,
    };

    it('hides the decision panel outside ACCEPTED_BY_COMPANY', fakeAsync(() => {
      // APP defaults to CONTENT_SEND_TO_ACCEPT.
      const api = new FakeApi();
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      expect(fixture.componentInstance.canDecide()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-decision"]'),
      ).toBeNull();
    }));

    it('offers cancel-cooperation at CONTENT_REJECTED (decline-only, iter-102 row 157)', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () =>
        of({
          ...APP,
          opportunityStatus: { value: OpportunityStatus.CONTENT_REJECTED, label: '...' } as never,
        });
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      const c = fixture.componentInstance;
      expect(c.canCancelFromRejected()).toBe(true);
      expect(c.canDecide()).toBe(false); // the accept path must NOT surface here
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-cancel-rejected-arm"]'),
      ).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="appop-detail-accept"]')).toBeNull();
    }));

    it('shows accept + decline buttons at ACCEPTED_BY_COMPANY', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      expect(fixture.componentInstance.canDecide()).toBe(true);
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-accept"]'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-decline"]'),
      ).not.toBeNull();
    }));

    it('arming a decision swaps to the confirmation step without calling the API', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('accept');
      fixture.detectChanges();
      expect(api.statusCalls).toEqual([]);
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-decision-question"]'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-decision-confirm"]'),
      ).not.toBeNull();
    }));

    it('back cancels the armed decision without calling the API', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('decline');
      fixture.componentInstance.cancelDecision();
      fixture.detectChanges();
      expect(api.statusCalls).toEqual([]);
      expect(fixture.componentInstance.pendingDecision()).toBeNull();
    }));

    it('confirmed accept PATCHes accept=true, updates status in place and refreshes history', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      const fixture = create(api);
      tick();
      const historyCallsAfterLoad = api.historyCalls;
      fixture.componentInstance.armDecision('accept');
      fixture.componentInstance.confirmDecision();
      tick();
      expect(api.statusCalls).toEqual([{ id: 42, accept: true }]);
      expect(fixture.componentInstance.currentStatus()).toBe(
        OpportunityStatus.ACCEPTED_BY_INFLUENCER,
      );
      expect(fixture.componentInstance.pendingDecision()).toBeNull();
      expect(fixture.componentInstance.decisionSubmitting()).toBe(false);
      expect(api.historyCalls).toBe(historyCallsAfterLoad + 1);
      // Decision panel disappears — the application left ACCEPTED_BY_COMPANY.
      expect(fixture.componentInstance.canDecide()).toBe(false);
    }));

    it('confirmed decline PATCHes accept=false and lands on REJECTED_BY_INFLUENCER', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('decline');
      fixture.componentInstance.confirmDecision();
      tick();
      expect(api.statusCalls).toEqual([{ id: 42, accept: false }]);
      expect(fixture.componentInstance.currentStatus()).toBe(
        OpportunityStatus.REJECTED_BY_INFLUENCER,
      );
    }));

    it('confirmDecision without an armed decision is a no-op', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      const fixture = create(api);
      tick();
      fixture.componentInstance.confirmDecision();
      tick();
      expect(api.statusCalls).toEqual([]);
    }));

    it('maps 403 to the forbidden error key and stops submitting', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      api.updateOpportunityStatusFn = () => throwError(() => ({ status: 403 }));
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('accept');
      fixture.componentInstance.confirmDecision();
      tick();
      expect(fixture.componentInstance.decisionErrorKey()).toBe(
        'applied_opportunities.decision.error.forbidden',
      );
      expect(fixture.componentInstance.decisionSubmitting()).toBe(false);
    }));

    it('maps 409 to the bad_state error key', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      api.updateOpportunityStatusFn = () => throwError(() => ({ status: 409 }));
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('decline');
      fixture.componentInstance.confirmDecision();
      tick();
      expect(fixture.componentInstance.decisionErrorKey()).toBe(
        'applied_opportunities.decision.error.bad_state',
      );
    }));

    it('maps other failures to the generic error key and renders the alert', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(awaiting);
      api.updateOpportunityStatusFn = () => throwError(() => ({ status: 500 }));
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('accept');
      fixture.componentInstance.confirmDecision();
      tick();
      fixture.detectChanges();
      expect(fixture.componentInstance.decisionErrorKey()).toBe(
        'applied_opportunities.decision.error.failed',
      );
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-decision-error"]'),
      ).not.toBeNull();
    }));
  });

  // J4 residue — influencer marks approved content as posted, advancing
  // CONTENT_APPROVED → CONTENT_POSTED via the same generic status PATCH the
  // accept/decline flow uses (CONTENT_APPROVED is an INFLUENCER_DRIVABLE_STATE
  // on the BE, so accept=true yields CONTENT_POSTED through getNextStatus).
  describe('influencer mark-as-posted (J4)', () => {
    const approved: AppliedOpportunityDtoOut = {
      ...APP,
      opportunityStatus: { value: OpportunityStatus.CONTENT_APPROVED, label: '...' } as never,
    };

    it('hides the posted panel outside CONTENT_APPROVED', fakeAsync(() => {
      const api = new FakeApi(); // APP is CONTENT_SEND_TO_ACCEPT
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      expect(fixture.componentInstance.canMarkPosted()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="appop-detail-posted"]')).toBeNull();
    }));

    it('shows the mark-as-posted CTA at CONTENT_APPROVED', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(approved);
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      expect(fixture.componentInstance.canMarkPosted()).toBe(true);
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-posted-arm"]'),
      ).not.toBeNull();
    }));

    it('arming posted swaps to the confirmation step without calling the API', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(approved);
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('posted');
      fixture.detectChanges();
      expect(api.statusCalls).toEqual([]);
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-posted-confirm"]'),
      ).not.toBeNull();
    }));

    it('confirmed posted PATCHes accept=true and lands on CONTENT_POSTED', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(approved);
      api.updateOpportunityStatusFn = () =>
        of({
          ...approved,
          opportunityStatus: { value: OpportunityStatus.CONTENT_POSTED, label: '...' } as never,
        });
      const fixture = create(api);
      tick();
      const historyCallsAfterLoad = api.historyCalls;
      fixture.componentInstance.armDecision('posted');
      fixture.componentInstance.confirmDecision();
      tick();
      expect(api.statusCalls).toEqual([{ id: 42, accept: true }]);
      expect(fixture.componentInstance.currentStatus()).toBe(OpportunityStatus.CONTENT_POSTED);
      expect(fixture.componentInstance.pendingDecision()).toBeNull();
      // Panel disappears — the application left CONTENT_APPROVED.
      expect(fixture.componentInstance.canMarkPosted()).toBe(false);
      expect(api.historyCalls).toBe(historyCallsAfterLoad + 1);
    }));

    // CONTENT_POSTED_REJECTED — the company rejected the already-posted
    // content; it is an INFLUENCER_DRIVABLE_STATE that also advances to
    // CONTENT_POSTED via accept=true, so the same card handles it with a
    // rejection-aware copy variant.
    const postedRejected: AppliedOpportunityDtoOut = {
      ...APP,
      opportunityStatus: {
        value: OpportunityStatus.CONTENT_POSTED_REJECTED,
        label: '...',
      } as never,
    };

    it('offers the mark-posted card at CONTENT_POSTED_REJECTED with the rejected copy', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(postedRejected);
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      expect(fixture.componentInstance.canMarkPosted()).toBe(true);
      expect(fixture.componentInstance.postedFromRejected()).toBe(true);
      expect(fixture.componentInstance.postedKey()).toBe('applied_opportunities.posted.rejected');
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-detail-posted-arm"]'),
      ).not.toBeNull();
    }));

    it('re-confirms posted from CONTENT_POSTED_REJECTED (accept=true → CONTENT_POSTED)', fakeAsync(() => {
      const api = new FakeApi();
      api.getByIdFn = () => of(postedRejected);
      api.updateOpportunityStatusFn = () =>
        of({
          ...postedRejected,
          opportunityStatus: { value: OpportunityStatus.CONTENT_POSTED, label: '...' } as never,
        });
      const fixture = create(api);
      tick();
      fixture.componentInstance.armDecision('posted');
      fixture.componentInstance.confirmDecision();
      tick();
      expect(api.statusCalls).toEqual([{ id: 42, accept: true }]);
      expect(fixture.componentInstance.currentStatus()).toBe(OpportunityStatus.CONTENT_POSTED);
      expect(fixture.componentInstance.canMarkPosted()).toBe(false);
    }));
  });

  // Iter-48 P0 #3 — payment-contact reveal at TO_BE_PAID / DONE.
  // The BE returns the OTHER party's payment contact (name + email +
  // optional phone) only when the applied-opportunity is in a
  // payment-relevant state, and only to the two parties on the row
  // (others get 403/404). The FE asks eagerly after load() and tolerates
  // 4xx silently — paymentContact stays null + the template section
  // stays hidden.
  describe('payment-contact reveal (iter-48 P0 #3)', () => {
    it('does NOT fetch payment-contact when status is pre-payment', fakeAsync(() => {
      // APP defaults to CONTENT_SEND_TO_ACCEPT — not a payment state.
      const api = new FakeApi();
      const fixture = create(api);
      tick();
      expect(api.paymentContactCalls).toEqual([]);
      expect(fixture.componentInstance.canShowPaymentContact()).toBe(false);
    }));

    it('fetches payment-contact when status is TO_BE_PAID', fakeAsync(() => {
      const toBePaid: AppliedOpportunityDtoOut = {
        ...APP,
        opportunityStatus: { value: OpportunityStatus.TO_BE_PAID, label: '...' } as never,
      };
      const api = new FakeApi();
      api.getByIdFn = () => of(toBePaid);
      const fixture = create(api);
      tick();
      expect(api.paymentContactCalls).toEqual([42]);
      expect(fixture.componentInstance.canShowPaymentContact()).toBe(true);
      expect(fixture.componentInstance.paymentContact()).toEqual(PAYMENT_CONTACT);
      expect(fixture.componentInstance.paymentContactLoading()).toBe(false);
    }));

    it('fetches payment-contact when status is DONE', fakeAsync(() => {
      const done: AppliedOpportunityDtoOut = {
        ...APP,
        opportunityStatus: { value: OpportunityStatus.DONE, label: '...' } as never,
      };
      const api = new FakeApi();
      api.getByIdFn = () => of(done);
      const fixture = create(api);
      tick();
      expect(api.paymentContactCalls).toEqual([42]);
      expect(fixture.componentInstance.paymentContact()).toEqual(PAYMENT_CONTACT);
    }));

    it('silently swallows 403 and leaves paymentContact null', fakeAsync(() => {
      const toBePaid: AppliedOpportunityDtoOut = {
        ...APP,
        opportunityStatus: { value: OpportunityStatus.TO_BE_PAID, label: '...' } as never,
      };
      const api = new FakeApi();
      api.getByIdFn = () => of(toBePaid);
      api.paymentContactFn = () => throwError(() => ({ status: 403 }));
      const fixture = create(api);
      tick();
      expect(api.paymentContactCalls).toEqual([42]);
      expect(fixture.componentInstance.paymentContact()).toBeNull();
      expect(fixture.componentInstance.paymentContactLoading()).toBe(false);
      // Component state stays loaded — the rest of the page still works.
      expect(fixture.componentInstance.state()).toBe('loaded');
    }));

    it('silently swallows 404 and leaves paymentContact null', fakeAsync(() => {
      const done: AppliedOpportunityDtoOut = {
        ...APP,
        opportunityStatus: { value: OpportunityStatus.DONE, label: '...' } as never,
      };
      const api = new FakeApi();
      api.getByIdFn = () => of(done);
      api.paymentContactFn = () => throwError(() => ({ status: 404 }));
      const fixture = create(api);
      tick();
      expect(fixture.componentInstance.paymentContact()).toBeNull();
    }));

    it('renders the payment-contact testids when contact is loaded', fakeAsync(() => {
      const toBePaid: AppliedOpportunityDtoOut = {
        ...APP,
        opportunityStatus: { value: OpportunityStatus.TO_BE_PAID, label: '...' } as never,
      };
      const api = new FakeApi();
      api.getByIdFn = () => of(toBePaid);
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      const section = fixture.nativeElement.querySelector(
        '[data-testid="appop-detail-payment-contact"]',
      );
      expect(section).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-payment-name"]'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-payment-email"]'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-payment-phone"]'),
      ).not.toBeNull();
    }));

    it('omits optional rows when phone is missing', fakeAsync(() => {
      const toBePaid: AppliedOpportunityDtoOut = {
        ...APP,
        opportunityStatus: { value: OpportunityStatus.TO_BE_PAID, label: '...' } as never,
      };
      const api = new FakeApi();
      api.getByIdFn = () => of(toBePaid);
      api.paymentContactFn = () =>
        of({ name: 'Acme Sp. z o.o.', email: 'billing@acme.example' } as PaymentContactDto);
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-payment-name"]'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-payment-email"]'),
      ).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="appop-payment-phone"]')).toBeNull();
    }));

    it('shows unavailable fallback when 4xx and section is visible', fakeAsync(() => {
      const toBePaid: AppliedOpportunityDtoOut = {
        ...APP,
        opportunityStatus: { value: OpportunityStatus.TO_BE_PAID, label: '...' } as never,
      };
      const api = new FakeApi();
      api.getByIdFn = () => of(toBePaid);
      api.paymentContactFn = () => throwError(() => ({ status: 403 }));
      const fixture = create(api);
      tick();
      fixture.detectChanges();
      // section IS visible (canShowPaymentContact=true) but inner state
      // is "unavailable" — the user still gets feedback rather than a
      // missing block.
      expect(
        fixture.nativeElement.querySelector('[data-testid="appop-payment-unavailable"]'),
      ).not.toBeNull();
    }));
  });
});
