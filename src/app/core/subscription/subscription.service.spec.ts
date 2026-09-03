import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SubscriptionService as GeneratedSubscriptionService } from '../api-frozen/subscription.client';
import { SubscriptionPaidService as GeneratedSubscriptionPaidService } from '../api-frozen/subscription.client';
import { DowngradeRequestDtoInTargetPlanEnum } from '../api-frozen/hidden-models';
import { UpgradeRequestDtoInTargetPlanEnum } from '../api-frozen/hidden-models';
import { SubscriptionApiService, SubscriptionWriteApi } from './subscription.service';

describe('SubscriptionApiService (read-side wrapper)', () => {
  let service: SubscriptionApiService;
  let api: { getStatus: jest.Mock; getInvoices: jest.Mock };

  beforeEach(() => {
    api = { getStatus: jest.fn(), getInvoices: jest.fn() };
    TestBed.configureTestingModule({
      providers: [SubscriptionApiService, { provide: GeneratedSubscriptionService, useValue: api }],
    });
    service = TestBed.inject(SubscriptionApiService);
  });

  it('getStatus() delegates with no params', () => {
    const status = { currentPlanName: 'FREE' };
    api.getStatus.mockReturnValue(of(status));
    let received: unknown;
    service.getStatus().subscribe((r) => (received = r));
    expect(api.getStatus).toHaveBeenCalledTimes(1);
    expect(api.getStatus).toHaveBeenCalledWith();
    expect(received).toBe(status);
  });

  it('getInvoices() delegates with no params', () => {
    const invoices = [{ id: 1 }, { id: 2 }];
    api.getInvoices.mockReturnValue(of(invoices));
    let received: unknown;
    service.getInvoices().subscribe((r) => (received = r));
    expect(api.getInvoices).toHaveBeenCalledTimes(1);
    expect(api.getInvoices).toHaveBeenCalledWith();
    expect(received).toBe(invoices);
  });
});

describe('SubscriptionWriteApi (paid-side wrapper)', () => {
  let service: SubscriptionWriteApi;
  let paid: {
    activateTrial: jest.Mock;
    recordConsent: jest.Mock;
    initiateUpgrade: jest.Mock;
    requestDowngrade: jest.Mock;
    cancelDowngrade: jest.Mock;
    createPortalSession: jest.Mock;
  };

  beforeEach(() => {
    paid = {
      activateTrial: jest.fn().mockReturnValue(of({})),
      recordConsent: jest.fn().mockReturnValue(of({})),
      initiateUpgrade: jest.fn().mockReturnValue(of({})),
      requestDowngrade: jest.fn().mockReturnValue(of({})),
      cancelDowngrade: jest.fn().mockReturnValue(of({})),
      createPortalSession: jest.fn().mockReturnValue(of({})),
    };
    TestBed.configureTestingModule({
      providers: [
        SubscriptionWriteApi,
        { provide: GeneratedSubscriptionPaidService, useValue: paid },
      ],
    });
    service = TestBed.inject(SubscriptionWriteApi);
  });

  it('activateTrial() delegates with no params', () => {
    service.activateTrial().subscribe();
    expect(paid.activateTrial).toHaveBeenCalledTimes(1);
    expect(paid.activateTrial).toHaveBeenCalledWith();
  });

  it('cancelDowngrade() delegates with no params', () => {
    service.cancelDowngrade().subscribe();
    expect(paid.cancelDowngrade).toHaveBeenCalledTimes(1);
    expect(paid.cancelDowngrade).toHaveBeenCalledWith();
  });

  it('createPortalSession() delegates with no params', () => {
    service.createPortalSession().subscribe();
    expect(paid.createPortalSession).toHaveBeenCalledTimes(1);
    expect(paid.createPortalSession).toHaveBeenCalledWith();
  });

  it('recordConsent() wraps proof in consentProofPayload envelope', () => {
    const proof = {
      consentVersion: 'terms-v3',
      acceptedAt: '2026-05-12T10:00:00Z',
    } as unknown as Parameters<SubscriptionWriteApi['recordConsent']>[0];
    service.recordConsent(proof).subscribe();
    expect(paid.recordConsent).toHaveBeenCalledTimes(1);
    expect(paid.recordConsent).toHaveBeenCalledWith({ consentProofPayload: proof });
  });

  it('initiateUpgrade() wraps targetPlan in upgradeRequestDtoIn envelope', () => {
    service.initiateUpgrade(UpgradeRequestDtoInTargetPlanEnum.BUSINESS).subscribe();
    expect(paid.initiateUpgrade).toHaveBeenCalledTimes(1);
    expect(paid.initiateUpgrade).toHaveBeenCalledWith({
      upgradeRequestDtoIn: { targetPlan: UpgradeRequestDtoInTargetPlanEnum.BUSINESS },
    });
  });

  it('requestDowngrade() wraps targetPlan in downgradeRequestDtoIn envelope', () => {
    service.requestDowngrade(DowngradeRequestDtoInTargetPlanEnum.FREE).subscribe();
    expect(paid.requestDowngrade).toHaveBeenCalledTimes(1);
    expect(paid.requestDowngrade).toHaveBeenCalledWith({
      downgradeRequestDtoIn: { targetPlan: DowngradeRequestDtoInTargetPlanEnum.FREE },
    });
  });
});
