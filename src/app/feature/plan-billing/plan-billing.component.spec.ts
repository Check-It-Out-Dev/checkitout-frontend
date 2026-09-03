import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { InvoiceRecordDtoOut } from '../../core/api-frozen/hidden-models';
import { InvoiceStatus } from '../../core/api-frozen/hidden-models';
import { SubscriptionStatus } from '../../core/api-frozen/hidden-models';
import type { SubscriptionStatusDtoOut } from '../../core/api-frozen/hidden-models';
import {
  DowngradeRequestDtoInTargetPlanEnum,
  SubscriptionApiService,
  SubscriptionWriteApi,
  UpgradeRequestDtoInTargetPlanEnum,
} from '../../core/subscription/subscription.service';
import { PlanBillingComponent } from './plan-billing.component';
import { PublicConfigApiService } from '../../core/config/public-config.service';

const STATUS_BUSINESS: SubscriptionStatusDtoOut = {
  currentPlanName: 'Business',
  currentPlanPrice: 29,
  campaignLimit: 5,
  campaignsUsedThisPeriod: 3,
  status: SubscriptionStatus.BUSINESS_ACTIVE,
  trialEligible: false,
  trialUsed: true,
  hasStripeSubscription: true,
};

class FakeApi {
  statusNext: () => Observable<SubscriptionStatusDtoOut> = () => of(STATUS_BUSINESS);
  invoicesNext: () => Observable<InvoiceRecordDtoOut[]> = () => of([]);
  statusCalls = 0;
  getStatus(): Observable<SubscriptionStatusDtoOut> {
    this.statusCalls += 1;
    return this.statusNext();
  }
  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return this.invoicesNext();
  }
}

class FakeWriteApi {
  next: () => Observable<unknown> = () => of(undefined);
  calls = 0;
  cancelDowngradeNext: () => Observable<unknown> = () => of(undefined);
  cancelDowngradeCalls = 0;
  portalNext: () => Observable<{ [key: string]: string }> = () =>
    of({ url: 'https://billing.stripe.com/test' });
  portalCalls = 0;
  activateTrial(): Observable<unknown> {
    this.calls += 1;
    return this.next();
  }
  recordConsent(): Observable<unknown> {
    return of(undefined);
  }
  initiateUpgrade(): Observable<{ sessionUrl: string }> {
    return of({ sessionUrl: 'https://stripe.example/cs_test' });
  }
  requestDowngrade(): Observable<unknown> {
    return of(undefined);
  }
  cancelDowngrade(): Observable<unknown> {
    this.cancelDowngradeCalls += 1;
    return this.cancelDowngradeNext();
  }
  createPortalSession(): Observable<{ [key: string]: string }> {
    this.portalCalls += 1;
    return this.portalNext();
  }
}

class FakeConfig {
  enabled = true;
  paymentsEnabled(): Observable<boolean> {
    return of(this.enabled);
  }
}

function create(
  api: FakeApi,
  write: FakeWriteApi = new FakeWriteApi(),
  config: FakeConfig = new FakeConfig(),
): ComponentFixture<PlanBillingComponent> {
  TestBed.configureTestingModule({
    imports: [
      PlanBillingComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: SubscriptionApiService, useValue: api },
      { provide: SubscriptionWriteApi, useValue: write },
      { provide: PublicConfigApiService, useValue: config },
    ],
  });
  const fixture = TestBed.createComponent(PlanBillingComponent);
  fixture.detectChanges();
  return fixture;
}

describe('PlanBillingComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('hides paid CTAs and shows the note when payments are disabled', fakeAsync(() => {
    const config = new FakeConfig();
    config.enabled = false;
    const fixture = create(new FakeApi(), new FakeWriteApi(), config);
    tick();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="plan-billing-payments-disabled"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="plan-billing-upgrade"]')).toBeNull();
    expect(host.querySelector('[data-testid="plan-billing-downgrade"]')).toBeNull();
    expect(host.querySelector('[data-testid="plan-billing-portal"]')).toBeNull();
  }));

  it('renders status and invoices on success', fakeAsync(() => {
    const api = new FakeApi();
    api.invoicesNext = () =>
      of([
        {
          id: 11,
          invoiceType: 'REGULAR',
          amountPln: 29,
          status: InvoiceStatus.SENT,
          createdTime: '2026-05-01T00:00:00Z',
        },
      ]);
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.status()?.currentPlanName).toBe('Business');
    expect(fixture.componentInstance.invoices()).toHaveLength(1);
  }));

  // audit-2026-05-13 P1 — PAYMENT_FAILED previously only styled the badge red
  // with no way to recover. It now shows an alert whose CTA opens the Stripe
  // Customer Portal (payment-method update).
  it('surfaces a payment-failed recovery CTA that opens the customer portal', fakeAsync(() => {
    const api = new FakeApi();
    api.statusNext = () => of({ ...STATUS_BUSINESS, status: SubscriptionStatus.PAYMENT_FAILED });
    const write = new FakeWriteApi();
    const fixture = create(api, write);
    tick();
    jest
      .spyOn(
        fixture.componentInstance as unknown as { redirectTo: (u: string) => void },
        'redirectTo',
      )
      .mockImplementation(() => {});
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="plan-billing-payment-failed"]')).not.toBeNull();

    const cta = host.querySelector<HTMLButtonElement>(
      '[data-testid="plan-billing-payment-failed-cta"]',
    );
    expect(cta).not.toBeNull();
    cta!.click();
    expect(write.portalCalls).toBe(1);
  }));

  it('does not show the payment-failed CTA in a healthy state', fakeAsync(() => {
    const fixture = create(new FakeApi()); // STATUS_BUSINESS / BUSINESS_ACTIVE
    tick();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="plan-billing-payment-failed"]',
      ),
    ).toBeNull();
  }));

  it('lands in error state when getStatus fails', fakeAsync(() => {
    const api = new FakeApi();
    api.statusNext = () => throwError(() => new Error('boom'));
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('error');
  }));

  it('lands in not-applicable state when getStatus returns 403 (influencer)', fakeAsync(() => {
    const api = new FakeApi();
    api.statusNext = () =>
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }));
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('not-applicable');
  }));

  it('lands in not-applicable state when getStatus returns 404', fakeAsync(() => {
    const api = new FakeApi();
    api.statusNext = () =>
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' }));
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('not-applicable');
  }));

  it('reloads on retry', fakeAsync(() => {
    const api = new FakeApi();
    let calls = 0;
    api.statusNext = () => {
      calls += 1;
      if (calls === 1) return throwError(() => new Error('boom'));
      return of(STATUS_BUSINESS);
    };
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('error');

    fixture.componentInstance.load();
    tick();
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(calls).toBe(2);
  }));

  it('caps usagePercent at 100%', fakeAsync(() => {
    const api = new FakeApi();
    api.statusNext = () =>
      of({ ...STATUS_BUSINESS, campaignLimit: 10, campaignsUsedThisPeriod: 30 });
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.usagePercent()).toBe(100);
  }));

  it('returns 0 usagePercent when limit is missing', fakeAsync(() => {
    const api = new FakeApi();
    api.statusNext = () => of({ ...STATUS_BUSINESS, campaignLimit: undefined });
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.usagePercent()).toBe(0);
  }));

  it('exposes the lower-snake-case status badge key', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.statusBadgeKey()).toBe('plan_billing.status.business_active');
  }));

  describe('trial activation', () => {
    const STATUS_TRIAL_ELIGIBLE: SubscriptionStatusDtoOut = {
      ...STATUS_BUSINESS,
      currentPlanName: 'Free',
      currentPlanPrice: 0,
      status: SubscriptionStatus.FREE_ACTIVE,
      trialEligible: true,
      trialUsed: false,
      hasStripeSubscription: false,
    };

    it('canActivateTrial true when eligible + not used', fakeAsync(() => {
      const api = new FakeApi();
      api.statusNext = () => of(STATUS_TRIAL_ELIGIBLE);
      const fixture = create(api);
      tick();

      expect(fixture.componentInstance.canActivateTrial()).toBe(true);
    }));

    it('canActivateTrial false when trialUsed', fakeAsync(() => {
      const api = new FakeApi();
      api.statusNext = () => of({ ...STATUS_TRIAL_ELIGIBLE, trialUsed: true });
      const fixture = create(api);
      tick();

      expect(fixture.componentInstance.canActivateTrial()).toBe(false);
    }));

    /** iter-50 P0 #3 — trial activation is consent-gated: the dialog must
     * record /subscription/consent and close accepted before the trial POST
     * fires. Tests stub the MatDialog handle the same way the upgrade-flow
     * suite does. */
    function stubTrialDialog(
      fixture: ComponentFixture<PlanBillingComponent>,
      result: Observable<{ accepted: true } | null>,
    ): () => number {
      let opened = 0;
      Object.defineProperty(fixture.componentInstance, 'dialog', {
        value: {
          open: () => {
            opened += 1;
            return { afterClosed: () => result };
          },
        },
      });
      return () => opened;
    }

    it('activates and refreshes status on success after consent accepted', async () => {
      const api = new FakeApi();
      const status$ = jest.fn();
      status$.mockReturnValueOnce(of(STATUS_TRIAL_ELIGIBLE));
      status$.mockReturnValueOnce(
        of({
          ...STATUS_TRIAL_ELIGIBLE,
          status: SubscriptionStatus.TRIAL_ENTERPRISE,
          trialUsed: true,
          trialEligible: false,
        }),
      );
      api.statusNext = () => status$();
      const write = new FakeWriteApi();
      const fixture = create(api, write);

      const opened = stubTrialDialog(fixture, of({ accepted: true as const }));
      await fixture.componentInstance.activateTrial();

      expect(opened()).toBe(1);
      expect(write.calls).toBe(1);
      expect(fixture.componentInstance.trialState()).toBe('activated');
      expect(fixture.componentInstance.status()?.status).toBe(SubscriptionStatus.TRIAL_ENTERPRISE);
    });

    it('never fires the trial POST when the consent dialog is cancelled', async () => {
      const api = new FakeApi();
      api.statusNext = () => of(STATUS_TRIAL_ELIGIBLE);
      const write = new FakeWriteApi();
      const fixture = create(api, write);

      const opened = stubTrialDialog(fixture, of(null));
      await fixture.componentInstance.activateTrial();

      expect(opened()).toBe(1);
      expect(write.calls).toBe(0);
      expect(fixture.componentInstance.trialState()).toBe('idle');
    });

    it('lands in error state on a 409 conflict (trial already used)', async () => {
      const api = new FakeApi();
      api.statusNext = () => of(STATUS_TRIAL_ELIGIBLE);
      const write = new FakeWriteApi();
      write.next = () => throwError(() => new HttpErrorResponse({ status: 409 }));
      const fixture = create(api, write);

      stubTrialDialog(fixture, of({ accepted: true as const }));
      await fixture.componentInstance.activateTrial();

      expect(fixture.componentInstance.trialState()).toBe('error');
      expect(fixture.componentInstance.trialErrorKey()).toBe(
        'plan_billing.trial.errors.already_used',
      );
    });

    it('does nothing when not eligible — dialog never opens', async () => {
      const api = new FakeApi();
      api.statusNext = () => of({ ...STATUS_TRIAL_ELIGIBLE, trialEligible: false });
      const write = new FakeWriteApi();
      const fixture = create(api, write);

      const opened = stubTrialDialog(fixture, of({ accepted: true as const }));
      await fixture.componentInstance.activateTrial();

      expect(opened()).toBe(0);
      expect(write.calls).toBe(0);
    });
  });

  describe('upgrade flow', () => {
    interface DialogStub {
      result: Observable<{ sessionUrl: string } | null>;
      opened: number;
    }

    function setupDialogSpy(
      fixture: ComponentFixture<PlanBillingComponent>,
      stub: DialogStub,
    ): void {
      const fake = {
        open: () => {
          stub.opened += 1;
          return { afterClosed: () => stub.result };
        },
      };
      Object.defineProperty(fixture.componentInstance, 'dialog', { value: fake });
    }

    function setupRedirectSpy(fixture: ComponentFixture<PlanBillingComponent>): {
      lastUrl?: string;
    } {
      const captured: { lastUrl?: string } = {};
      // @ts-expect-error — protected member, deliberate test override.
      fixture.componentInstance.redirectTo = (url: string) => {
        captured.lastUrl = url;
      };
      return captured;
    }

    it('opens the upgrade dialog and redirects on success', async () => {
      const api = new FakeApi();
      api.statusNext = () => of({ ...STATUS_BUSINESS, status: SubscriptionStatus.FREE_ACTIVE });
      const fixture = create(api);
      const stub: DialogStub = {
        result: of({ sessionUrl: 'https://stripe.example/cs_redirect' }),
        opened: 0,
      };
      setupDialogSpy(fixture, stub);
      const captured = setupRedirectSpy(fixture);

      await fixture.componentInstance.startUpgrade(UpgradeRequestDtoInTargetPlanEnum.BUSINESS);

      expect(stub.opened).toBe(1);
      expect(captured.lastUrl).toBe('https://stripe.example/cs_redirect');
      expect(fixture.componentInstance.upgrading()).toBeNull();
    });

    it('does not redirect when dialog is cancelled', async () => {
      const api = new FakeApi();
      const fixture = create(api);
      const stub: DialogStub = { result: of(null), opened: 0 };
      setupDialogSpy(fixture, stub);
      const captured = setupRedirectSpy(fixture);

      await fixture.componentInstance.startUpgrade(UpgradeRequestDtoInTargetPlanEnum.ENTERPRISE);

      expect(stub.opened).toBe(1);
      expect(captured.lastUrl).toBeUndefined();
    });

    it('does not open a second dialog while upgrading is in flight', async () => {
      const api = new FakeApi();
      const fixture = create(api);
      const stub: DialogStub = { result: of(null), opened: 0 };
      setupDialogSpy(fixture, stub);
      setupRedirectSpy(fixture);

      // Drive the first call to set the upgrading() signal but don't await.
      const first = fixture.componentInstance.startUpgrade(
        UpgradeRequestDtoInTargetPlanEnum.BUSINESS,
      );
      // Reentrant call should bail.
      await fixture.componentInstance.startUpgrade(UpgradeRequestDtoInTargetPlanEnum.BUSINESS);
      await first;

      expect(stub.opened).toBe(1);
    });
  });

  describe('downgrade flow', () => {
    interface DowngradeDialogStub {
      result: Observable<'confirmed' | null>;
      opened: number;
    }

    function setupDowngradeDialogSpy(
      fixture: ComponentFixture<PlanBillingComponent>,
      stub: DowngradeDialogStub,
    ): void {
      const fake = {
        open: () => {
          stub.opened += 1;
          return { afterClosed: () => stub.result };
        },
      };
      Object.defineProperty(fixture.componentInstance, 'dialog', { value: fake });
    }

    it('availableDowngrades = [BUSINESS, FREE] for ENTERPRISE_ACTIVE', fakeAsync(() => {
      const api = new FakeApi();
      api.statusNext = () =>
        of({ ...STATUS_BUSINESS, status: SubscriptionStatus.ENTERPRISE_ACTIVE });
      const fixture = create(api);
      tick();

      expect(fixture.componentInstance.availableDowngrades()).toEqual([
        DowngradeRequestDtoInTargetPlanEnum.BUSINESS,
        DowngradeRequestDtoInTargetPlanEnum.FREE,
      ]);
    }));

    it('availableDowngrades = [FREE] for BUSINESS_ACTIVE', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api);
      tick();

      expect(fixture.componentInstance.availableDowngrades()).toEqual([
        DowngradeRequestDtoInTargetPlanEnum.FREE,
      ]);
    }));

    it('availableDowngrades empty when downgrade already pending', fakeAsync(() => {
      const api = new FakeApi();
      api.statusNext = () => of({ ...STATUS_BUSINESS, targetPlanName: 'Free' });
      const fixture = create(api);
      tick();

      expect(fixture.componentInstance.availableDowngrades()).toEqual([]);
    }));

    it('refreshes status after a confirmed downgrade', async () => {
      const api = new FakeApi();
      const status$ = jest.fn();
      status$.mockReturnValueOnce(of(STATUS_BUSINESS));
      status$.mockReturnValueOnce(of({ ...STATUS_BUSINESS, targetPlanName: 'Free' }));
      api.statusNext = () => status$();
      const fixture = create(api);
      const stub: DowngradeDialogStub = { result: of('confirmed'), opened: 0 };
      setupDowngradeDialogSpy(fixture, stub);

      await fixture.componentInstance.startDowngrade(DowngradeRequestDtoInTargetPlanEnum.FREE);

      expect(stub.opened).toBe(1);
      expect(fixture.componentInstance.status()?.targetPlanName).toBe('Free');
    });

    it('does not refresh status when dialog cancelled', async () => {
      const api = new FakeApi();
      const fixture = create(api);
      const stub: DowngradeDialogStub = { result: of(null), opened: 0 };
      setupDowngradeDialogSpy(fixture, stub);
      const before = api.statusCalls;

      await fixture.componentInstance.startDowngrade(DowngradeRequestDtoInTargetPlanEnum.FREE);

      expect(api.statusCalls).toBe(before);
    });
  });

  describe('trial cancel', () => {
    interface TrialDialogStub {
      result: Observable<'confirmed' | null>;
      opened: number;
    }
    function setupTrialDialogSpy(
      fixture: ComponentFixture<PlanBillingComponent>,
      stub: TrialDialogStub,
    ): void {
      Object.defineProperty(fixture.componentInstance, 'dialog', {
        value: {
          open: () => {
            stub.opened += 1;
            return { afterClosed: () => stub.result };
          },
        },
      });
    }

    it('shows the cancel-trial affordance only for TRIAL_ENTERPRISE', fakeAsync(() => {
      const api = new FakeApi();
      api.statusNext = () =>
        of({ ...STATUS_BUSINESS, status: SubscriptionStatus.TRIAL_ENTERPRISE });
      const fixture = create(api);
      tick();
      fixture.detectChanges();

      expect(fixture.componentInstance.canCancelTrial()).toBe(true);
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('[data-testid="plan-billing-cancel-trial"]')).not.toBeNull();
    }));

    it('reloads status after a confirmed trial cancel', async () => {
      const api = new FakeApi();
      const status$ = jest.fn();
      status$.mockReturnValueOnce(
        of({ ...STATUS_BUSINESS, status: SubscriptionStatus.TRIAL_ENTERPRISE }),
      );
      status$.mockReturnValueOnce(
        of({ ...STATUS_BUSINESS, status: SubscriptionStatus.FREE_ACTIVE, currentPlanName: 'Free' }),
      );
      api.statusNext = () => status$();
      const fixture = create(api);
      const stub: TrialDialogStub = { result: of('confirmed'), opened: 0 };
      setupTrialDialogSpy(fixture, stub);

      await fixture.componentInstance.cancelTrial();

      expect(stub.opened).toBe(1);
      expect(fixture.componentInstance.status()?.status).toBe(SubscriptionStatus.FREE_ACTIVE);
    });

    it('does not reload when the trial-cancel dialog is dismissed', async () => {
      const api = new FakeApi();
      api.statusNext = () =>
        of({ ...STATUS_BUSINESS, status: SubscriptionStatus.TRIAL_ENTERPRISE });
      const fixture = create(api);
      const stub: TrialDialogStub = { result: of(null), opened: 0 };
      setupTrialDialogSpy(fixture, stub);
      const before = api.statusCalls;

      await fixture.componentInstance.cancelTrial();

      expect(api.statusCalls).toBe(before);
    });
  });

  describe('cancel pending downgrade', () => {
    it('calls BE and refreshes status on success', fakeAsync(() => {
      const api = new FakeApi();
      const status$ = jest.fn();
      status$.mockReturnValueOnce(of({ ...STATUS_BUSINESS, targetPlanName: 'Free' }));
      status$.mockReturnValueOnce(of(STATUS_BUSINESS));
      api.statusNext = () => status$();
      const write = new FakeWriteApi();
      const fixture = create(api, write);
      tick();

      fixture.componentInstance.cancelPendingDowngrade();
      tick();

      expect(write.cancelDowngradeCalls).toBe(1);
      expect(fixture.componentInstance.cancelDowngradeState()).toBe('idle');
      expect(fixture.componentInstance.status()?.targetPlanName).toBeUndefined();
    }));

    it('classifies HTTP 409 as no_pending', fakeAsync(() => {
      const api = new FakeApi();
      api.statusNext = () => of({ ...STATUS_BUSINESS, targetPlanName: 'Free' });
      const write = new FakeWriteApi();
      write.cancelDowngradeNext = () => throwError(() => new HttpErrorResponse({ status: 409 }));
      const fixture = create(api, write);
      tick();

      fixture.componentInstance.cancelPendingDowngrade();
      tick();

      expect(fixture.componentInstance.cancelDowngradeState()).toBe('error');
      expect(fixture.componentInstance.cancelDowngradeErrorKey()).toBe(
        'plan_billing.cancel_downgrade.errors.no_pending',
      );
    }));

    it('does not double-submit while cancelling', fakeAsync(() => {
      const api = new FakeApi();
      api.statusNext = () => of({ ...STATUS_BUSINESS, targetPlanName: 'Free' });
      const write = new FakeWriteApi();
      write.cancelDowngradeNext = () => new Observable(() => undefined);
      const fixture = create(api, write);
      tick();

      fixture.componentInstance.cancelPendingDowngrade();
      fixture.componentInstance.cancelPendingDowngrade();
      tick();

      expect(write.cancelDowngradeCalls).toBe(1);
    }));
  });

  describe('customer portal', () => {
    function setupRedirectSpy(fixture: ComponentFixture<PlanBillingComponent>): {
      lastUrl?: string;
    } {
      const captured: { lastUrl?: string } = {};
      // @ts-expect-error — protected member, deliberate test override.
      fixture.componentInstance.redirectTo = (url: string) => {
        captured.lastUrl = url;
      };
      return captured;
    }

    it('redirects to the portal URL on success', fakeAsync(() => {
      const api = new FakeApi();
      const write = new FakeWriteApi();
      write.portalNext = () => of({ url: 'https://billing.stripe.com/p/login/cs_X' });
      const fixture = create(api, write);
      tick();
      const captured = setupRedirectSpy(fixture);

      fixture.componentInstance.openCustomerPortal();
      tick();

      expect(write.portalCalls).toBe(1);
      expect(captured.lastUrl).toBe('https://billing.stripe.com/p/login/cs_X');
    }));

    it('shows no_url when BE returns 200 without url', fakeAsync(() => {
      const api = new FakeApi();
      const write = new FakeWriteApi();
      write.portalNext = () => of({});
      const fixture = create(api, write);
      tick();
      setupRedirectSpy(fixture);

      fixture.componentInstance.openCustomerPortal();
      tick();

      expect(fixture.componentInstance.portalState()).toBe('error');
      expect(fixture.componentInstance.portalErrorKey()).toBe('plan_billing.portal.errors.no_url');
    }));

    it('classifies HTTP 409 as no_customer', fakeAsync(() => {
      const api = new FakeApi();
      const write = new FakeWriteApi();
      write.portalNext = () => throwError(() => new HttpErrorResponse({ status: 409 }));
      const fixture = create(api, write);
      tick();
      setupRedirectSpy(fixture);

      fixture.componentInstance.openCustomerPortal();
      tick();

      expect(fixture.componentInstance.portalErrorKey()).toBe(
        'plan_billing.portal.errors.no_customer',
      );
    }));

    it('does not double-submit while opening', fakeAsync(() => {
      const api = new FakeApi();
      const write = new FakeWriteApi();
      // Never-completes observable to keep state in 'opening'
      write.portalNext = () => new Observable(() => undefined);
      const fixture = create(api, write);
      tick();
      setupRedirectSpy(fixture);

      fixture.componentInstance.openCustomerPortal();
      fixture.componentInstance.openCustomerPortal();
      tick();

      expect(write.portalCalls).toBe(1);
    }));
  });

  // bfcache (audit P2): the Back button from the Stripe portal restores the
  // page WITHOUT re-running ngOnInit — a persisted pageshow must reload.
  describe('bfcache restore', () => {
    it('reloads the subscription state on a persisted pageshow', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api, new FakeWriteApi());
      tick();
      const loadSpy = jest.spyOn(fixture.componentInstance, 'load');

      const restored = new Event('pageshow');
      Object.defineProperty(restored, 'persisted', { value: true });
      window.dispatchEvent(restored);
      tick();

      expect(loadSpy).toHaveBeenCalled();
    }));

    it('ignores a normal pageshow (fresh navigation already ran ngOnInit)', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api, new FakeWriteApi());
      tick();
      const loadSpy = jest.spyOn(fixture.componentInstance, 'load');

      window.dispatchEvent(new Event('pageshow'));
      tick();

      expect(loadSpy).not.toHaveBeenCalled();
    }));
  });
});
