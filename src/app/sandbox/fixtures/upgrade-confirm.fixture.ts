import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import {
  SubscriptionWriteApi,
  UpgradeRequestDtoInTargetPlanEnum,
} from '../../core/subscription/subscription.service';
import {
  UpgradeConfirmDialogComponent,
  type UpgradeConfirmDialogData,
  type UpgradeConfirmResult,
} from '../../feature/plan-billing/upgrade-confirm-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

const DIALOG_REF_STUB = { close: () => undefined } as unknown as MatDialogRef<
  UpgradeConfirmDialogComponent,
  UpgradeConfirmResult
>;

class StubWriteOk {
  recordConsent(): Observable<unknown> {
    return of(undefined);
  }
  initiateUpgrade(): Observable<{ sessionUrl: string }> {
    return of({ sessionUrl: 'https://checkout.stripe.com/c/pay/cs_fixture' });
  }
}

const DATA: UpgradeConfirmDialogData = {
  targetPlan: UpgradeRequestDtoInTargetPlanEnum.BUSINESS,
  priceDisplay: '29 PLN / mo',
  documentName: 'Subscription Terms v1',
  documentHash: 'fixture-hash',
};

const ENTERPRISE_DATA: UpgradeConfirmDialogData = {
  ...DATA,
  targetPlan: UpgradeRequestDtoInTargetPlanEnum.ENTERPRISE,
  priceDisplay: '99 PLN / mo',
};

export const UPGRADE_CONFIRM_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'upgrade-confirm-business',
    label: 'Upgrade confirm · Business',
    component: UpgradeConfirmDialogComponent,
    viewport: { width: 520, height: 480 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
    ],
  },
  {
    id: 'upgrade-confirm-enterprise',
    label: 'Upgrade confirm · Enterprise',
    component: UpgradeConfirmDialogComponent,
    viewport: { width: 520, height: 480 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: ENTERPRISE_DATA },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
    ],
  },
];
