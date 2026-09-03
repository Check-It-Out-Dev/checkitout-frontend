import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  Optional,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import {
  DowngradeRequestDtoInTargetPlanEnum,
  SubscriptionWriteApi,
} from '../../core/subscription/subscription.service';

export interface DowngradeConfirmDialogData {
  readonly targetPlan: DowngradeRequestDtoInTargetPlanEnum;
  readonly currentPlanName: string;
  readonly billingPeriodEnd?: string;
  /**
   * When true this is an immediate trial cancellation (TRIAL_ENTERPRISE → FREE:
   * no Stripe, drops to Free now), not a scheduled end-of-period downgrade. Only
   * the copy changes — the BE `requestDowngrade(FREE)` call is the same.
   */
  readonly isTrialCancel?: boolean;
}

export type DowngradeConfirmResult = 'confirmed' | null;

type Phase = 'idle' | 'submitting' | 'error';

/**
 * Confirms a scheduled downgrade. POST /subscription/downgrade marks the
 * subscription with `targetPlan`; the BE keeps current benefits until
 * `billingPeriodEnd`. The user can later cancel via /downgrade/cancel.
 *
 * No Stripe redirect (no checkout — payment continues current plan until
 * the period ends, then drops). No consent capture (no terms change for a
 * downgrade).
 */
@Component({
    selector: 'app-downgrade-confirm-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        MatButtonModule,
        MatDialogModule,
        MatProgressSpinnerModule,
        TranslocoModule,
    ],
    templateUrl: './downgrade-confirm-dialog.component.html'
})
export class DowngradeConfirmDialogComponent {
  private readonly write = inject(SubscriptionWriteApi);

  readonly phase = signal<Phase>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly data: DowngradeConfirmDialogData;

  constructor(
    @Optional()
    private readonly dialogRef?: MatDialogRef<
      DowngradeConfirmDialogComponent,
      DowngradeConfirmResult
    >,
    @Optional() @Inject(MAT_DIALOG_DATA) data?: DowngradeConfirmDialogData,
  ) {
    this.data = data ?? {
      targetPlan: DowngradeRequestDtoInTargetPlanEnum.FREE,
      currentPlanName: '',
    };
  }

  cancel(): void {
    this.dialogRef?.close(null);
  }

  async confirm(): Promise<void> {
    if (this.phase() !== 'idle') return;
    this.phase.set('submitting');
    this.errorKey.set(null);

    try {
      await firstValueFrom(this.write.requestDowngrade(this.data.targetPlan));
      this.dialogRef?.close('confirmed');
    } catch (err: unknown) {
      this.phase.set('error');
      this.errorKey.set(this.classifyError(err));
    }
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'plan_billing.downgrade.errors.invalid_input';
      if (err.status === 409) return 'plan_billing.downgrade.errors.conflict';
      if (err.status === 429) return 'plan_billing.downgrade.errors.rate_limited';
    }
    return 'plan_billing.downgrade.errors.failed';
  }
}
