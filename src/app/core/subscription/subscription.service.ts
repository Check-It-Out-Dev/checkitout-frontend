import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SubscriptionService as GeneratedSubscriptionService } from '../api-frozen/subscription.client';
import { SubscriptionPaidService as GeneratedSubscriptionPaidService } from '../api-frozen/subscription.client';
import type { CheckoutSessionDtoOut } from '../api-frozen/hidden-models';
import type { ConsentProofPayload } from '../api-frozen/hidden-models';
import type { InvoiceRecordDtoOut } from '../api-frozen/hidden-models';
import type { SubscriptionStatusDtoOut } from '../api-frozen/hidden-models';
import { DowngradeRequestDtoInTargetPlanEnum } from '../api-frozen/hidden-models';
import { UpgradeRequestDtoInTargetPlanEnum } from '../api-frozen/hidden-models';

/**
 * Read-side wrapper around the generated `SubscriptionService`. The two
 * always-on read endpoints used everywhere on the plan/billing page.
 *
 * Write-side calls (upgrade / downgrade / portal / consent / trial) live in
 * `SubscriptionWriteApi` so the service surface mirrors how the BE splits
 * `SubscriptionController` (always-on) from `SubscriptionPaidController`
 * (gated behind `app.payments.enabled`).
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionApiService {
  private readonly api = inject(GeneratedSubscriptionService);

  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return this.api.getStatus();
  }

  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return this.api.getInvoices();
  }
}

/**
 * Write-side wrapper around the generated `SubscriptionPaidService`.
 * Endpoints under `/subscription/*` that mutate subscription state (gated
 * behind `app.payments.enabled` server-side; FE assumes enabled at runtime).
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionWriteApi {
  private readonly paid = inject(GeneratedSubscriptionPaidService);

  activateTrial(): Observable<unknown> {
    return this.paid.activateTrial();
  }

  recordConsent(proof: ConsentProofPayload): Observable<unknown> {
    return this.paid.recordConsent({ consentProofPayload: proof });
  }

  initiateUpgrade(
    targetPlan: UpgradeRequestDtoInTargetPlanEnum,
  ): Observable<CheckoutSessionDtoOut> {
    return this.paid.initiateUpgrade({ upgradeRequestDtoIn: { targetPlan } });
  }

  requestDowngrade(targetPlan: DowngradeRequestDtoInTargetPlanEnum): Observable<unknown> {
    return this.paid.requestDowngrade({ downgradeRequestDtoIn: { targetPlan } });
  }

  cancelDowngrade(): Observable<unknown> {
    return this.paid.cancelDowngrade();
  }

  createPortalSession(): Observable<{ [key: string]: string }> {
    return this.paid.createPortalSession();
  }
}

export { DowngradeRequestDtoInTargetPlanEnum } from '../api-frozen/hidden-models';
export { UpgradeRequestDtoInTargetPlanEnum } from '../api-frozen/hidden-models';
