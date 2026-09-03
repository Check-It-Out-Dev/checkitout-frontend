import { Observable, of } from 'rxjs';
import type { InvoiceRecordDtoOut } from '../../core/api-frozen/hidden-models';
import { InvoiceStatus } from '../../core/api-frozen/hidden-models';
import { SubscriptionStatus } from '../../core/api-frozen/hidden-models';
import type { SubscriptionStatusDtoOut } from '../../core/api-frozen/hidden-models';
import {
  SubscriptionApiService,
  SubscriptionWriteApi,
} from '../../core/subscription/subscription.service';
import { PlanBillingComponent } from '../../feature/plan-billing/plan-billing.component';
import { PublicConfigApiService } from '../../core/config/public-config.service';
import type { SandboxFixture } from '../sandbox-registry';

const STATUS_FREE: SubscriptionStatusDtoOut = {
  currentPlanName: 'Free',
  currentPlanPrice: 0,
  campaignLimit: 5,
  campaignsUsedThisPeriod: 2,
  status: SubscriptionStatus.FREE_ACTIVE,
  billingPeriodStart: '2026-05-01T00:00:00Z',
  billingPeriodEnd: '2026-06-01T00:00:00Z',
  trialEligible: true,
  trialUsed: false,
  hasStripeSubscription: false,
};

const STATUS_BUSINESS: SubscriptionStatusDtoOut = {
  currentPlanName: 'Business',
  currentPlanPrice: 29,
  campaignLimit: 5,
  campaignsUsedThisPeriod: 3,
  status: SubscriptionStatus.BUSINESS_ACTIVE,
  billingPeriodStart: '2026-05-01T00:00:00Z',
  billingPeriodEnd: '2026-06-01T00:00:00Z',
  trialEligible: false,
  trialUsed: true,
  hasStripeSubscription: true,
};

const STATUS_DOWNGRADE: SubscriptionStatusDtoOut = {
  ...STATUS_BUSINESS,
  status: SubscriptionStatus.DOWNGRADE_PENDING,
  targetPlanName: 'Free',
};

const STATUS_PAYMENT_FAILED: SubscriptionStatusDtoOut = {
  ...STATUS_BUSINESS,
  status: SubscriptionStatus.PAYMENT_FAILED,
};

const STATUS_TRIAL: SubscriptionStatusDtoOut = {
  currentPlanName: 'Enterprise',
  currentPlanPrice: 99,
  campaignLimit: 10,
  campaignsUsedThisPeriod: 1,
  status: SubscriptionStatus.TRIAL_ENTERPRISE,
  trialEndDate: '2026-09-03T00:00:00Z',
  billingPeriodStart: '2026-09-02T00:00:00Z',
  billingPeriodEnd: '2026-09-03T00:00:00Z',
  trialEligible: false,
  trialUsed: true,
  hasStripeSubscription: false,
};

const SAMPLE_INVOICES: InvoiceRecordDtoOut[] = [
  {
    id: 1,
    invoiceType: 'REGULAR',
    amountPln: 29,
    status: InvoiceStatus.SENT,
    retryCount: 0,
    maxRetries: 3,
    createdTime: '2026-04-01T08:00:00Z',
    lastAttemptAt: '2026-04-01T08:00:05Z',
  },
  {
    id: 2,
    invoiceType: 'REGULAR',
    amountPln: 29,
    status: InvoiceStatus.PENDING,
    retryCount: 1,
    maxRetries: 3,
    errorMessage: 'Fakturownia rate limit, retrying.',
    createdTime: '2026-05-01T08:00:00Z',
    lastAttemptAt: '2026-05-01T08:00:05Z',
  },
];

class StubFree {
  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return of(STATUS_FREE);
  }
  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return of([]);
  }
}

class StubBusiness {
  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return of(STATUS_BUSINESS);
  }
  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return of(SAMPLE_INVOICES);
  }
}

class StubDowngrade {
  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return of(STATUS_DOWNGRADE);
  }
  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return of(SAMPLE_INVOICES);
  }
}

class StubPaymentFailed {
  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return of(STATUS_PAYMENT_FAILED);
  }
  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return of(SAMPLE_INVOICES);
  }
}

class StubTrial {
  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return of(STATUS_TRIAL);
  }
  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return of([]);
  }
}

class StubError {
  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return new Observable((sub) => sub.error({ status: 500 }));
  }
  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return of([]);
  }
}

class StubWriteOk {
  activateTrial(): Observable<unknown> {
    return of(undefined);
  }
  recordConsent(): Observable<unknown> {
    return of(undefined);
  }
  initiateUpgrade(): Observable<{ sessionUrl: string }> {
    return of({ sessionUrl: 'https://checkout.stripe.com/c/pay/cs_fixture' });
  }
  requestDowngrade(): Observable<unknown> {
    return of(undefined);
  }
  cancelDowngrade(): Observable<unknown> {
    return of(undefined);
  }
  createPortalSession(): Observable<{ [key: string]: string }> {
    return of({ url: 'https://billing.stripe.com/p/login/test_fixture' });
  }
}

class StubConfigEnabled {
  paymentsEnabled(): Observable<boolean> {
    return of(true);
  }
}

class StubConfigDisabled {
  paymentsEnabled(): Observable<boolean> {
    return of(false);
  }
}

export const PLAN_BILLING_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'plan-billing-free-trial-eligible',
    label: 'Plan/billing · Free, trial eligible',
    component: PlanBillingComponent,
    providers: [
      { provide: SubscriptionApiService, useClass: StubFree },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
      { provide: PublicConfigApiService, useClass: StubConfigEnabled },
    ],
  },
  {
    id: 'plan-billing-business',
    label: 'Plan/billing · Business with invoices',
    component: PlanBillingComponent,
    providers: [
      { provide: SubscriptionApiService, useClass: StubBusiness },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
      { provide: PublicConfigApiService, useClass: StubConfigEnabled },
    ],
  },
  {
    id: 'plan-billing-downgrade-pending',
    label: 'Plan/billing · Downgrade pending banner',
    component: PlanBillingComponent,
    providers: [
      { provide: SubscriptionApiService, useClass: StubDowngrade },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
      { provide: PublicConfigApiService, useClass: StubConfigEnabled },
    ],
  },
  {
    id: 'plan-billing-payment-failed',
    label: 'Plan/billing · payment failed — update-payment CTA',
    component: PlanBillingComponent,
    providers: [
      { provide: SubscriptionApiService, useClass: StubPaymentFailed },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
      { provide: PublicConfigApiService, useClass: StubConfigEnabled },
    ],
  },
  {
    id: 'plan-billing-error',
    label: 'Plan/billing · error state',
    component: PlanBillingComponent,
    providers: [
      { provide: SubscriptionApiService, useClass: StubError },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
      { provide: PublicConfigApiService, useClass: StubConfigEnabled },
    ],
  },
  {
    id: 'plan-billing-payments-disabled',
    label: 'Plan/billing · payments disabled (free-only deploy)',
    component: PlanBillingComponent,
    providers: [
      { provide: SubscriptionApiService, useClass: StubFree },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
      { provide: PublicConfigApiService, useClass: StubConfigDisabled },
    ],
  },
  {
    id: 'plan-billing-trial-enterprise',
    label: 'Plan/billing · Enterprise trial (cancel trial)',
    component: PlanBillingComponent,
    providers: [
      { provide: SubscriptionApiService, useClass: StubTrial },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
      { provide: PublicConfigApiService, useClass: StubConfigEnabled },
    ],
  },
];
