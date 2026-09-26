import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import {
  DowngradeRequestDtoInTargetPlanEnum,
  SubscriptionWriteApi,
} from '../../core/subscription/subscription.service';
import {
  DowngradeConfirmDialogComponent,
  type DowngradeConfirmDialogData,
  type DowngradeConfirmResult,
} from '../../feature/plan-billing/downgrade-confirm-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

const DIALOG_REF_STUB = { close: () => undefined } as unknown as MatDialogRef<
  DowngradeConfirmDialogComponent,
  DowngradeConfirmResult
>;

class StubWriteOk {
  requestDowngrade(): Observable<unknown> {
    return of(undefined);
  }
}

const DATA: DowngradeConfirmDialogData = {
  targetPlan: DowngradeRequestDtoInTargetPlanEnum.FREE,
  currentPlanName: 'Business',
  billingPeriodEnd: '2026-06-01T00:00:00Z',
};

export const DOWNGRADE_CONFIRM_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'downgrade-confirm-business-to-free',
    label: 'Downgrade confirm · Business → Free',
    component: DowngradeConfirmDialogComponent,
    frame: 'dialog',
    viewport: { width: 480, height: 280 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
      { provide: SubscriptionWriteApi, useClass: StubWriteOk },
    ],
  },
];
