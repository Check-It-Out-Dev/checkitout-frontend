/**
 * L0 contract: SubscriptionApiService + SubscriptionWriteApi ↔ generated
 * models. Compile-time only; see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type {
  SubscriptionApiService,
  SubscriptionWriteApi,
} from '../../app/core/subscription/subscription.service';
import type { CheckoutSessionDtoOut } from '../../app/core/api-frozen/hidden-models';
import type { ConsentProofPayload } from '../../app/core/api-frozen/hidden-models';
import type { InvoiceRecordDtoOut } from '../../app/core/api-frozen/hidden-models';
import type { SubscriptionStatusDtoOut } from '../../app/core/api-frozen/hidden-models';
import type { DowngradeRequestDtoInTargetPlanEnum } from '../../app/core/api-frozen/hidden-models';
import type { UpgradeRequestDtoInTargetPlanEnum } from '../../app/core/api-frozen/hidden-models';
import type { Equal, Expect } from '../type-assert';

type _getStatus = Expect<
  Equal<SubscriptionApiService['getStatus'], () => Observable<SubscriptionStatusDtoOut>>
>;

type _getInvoices = Expect<
  Equal<SubscriptionApiService['getInvoices'], () => Observable<InvoiceRecordDtoOut[]>>
>;

type _recordConsent = Expect<
  Equal<SubscriptionWriteApi['recordConsent'], (proof: ConsentProofPayload) => Observable<unknown>>
>;

type _initiateUpgrade = Expect<
  Equal<
    SubscriptionWriteApi['initiateUpgrade'],
    (targetPlan: UpgradeRequestDtoInTargetPlanEnum) => Observable<CheckoutSessionDtoOut>
  >
>;

type _requestDowngrade = Expect<
  Equal<
    SubscriptionWriteApi['requestDowngrade'],
    (targetPlan: DowngradeRequestDtoInTargetPlanEnum) => Observable<unknown>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type SubscriptionContract = [
  _getStatus,
  _getInvoices,
  _recordConsent,
  _initiateUpgrade,
  _requestDowngrade,
];
