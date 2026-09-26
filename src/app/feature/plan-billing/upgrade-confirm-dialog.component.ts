import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  Optional,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import type { ConsentProofPayload } from '../../core/api-frozen/hidden-models';
import {
  SubscriptionWriteApi,
  UpgradeRequestDtoInTargetPlanEnum,
} from '../../core/subscription/subscription.service';
import { DialogHeaderComponent } from '../../shared/components/dialog-header/dialog-header.component';

export interface UpgradeConfirmDialogData {
  readonly targetPlan: UpgradeRequestDtoInTargetPlanEnum;
  readonly priceDisplay: string;
  /** Canonical name of the legal document — recorded with the consent, never localised. */
  readonly documentName: string;
  /** What the checkbox shows for it in the visitor's language (falls back to the name). */
  readonly documentLabel?: string;
  /** SHA-256 of the legal document the user saw. Server compares for tamper-evidence. */
  readonly documentHash: string;
}

export type UpgradeConfirmResult = { sessionUrl: string } | null;

type Phase = 'idle' | 'submitting' | 'error';

/**
 * Combined consent + upgrade dialog. The BE requires `/subscription/consent`
 * to be called before `/subscription/upgrade`, so this dialog runs them
 * back-to-back. On success the caller receives the Stripe Checkout
 * sessionUrl and is responsible for the redirect (we keep that side-effect
 * out of the dialog so it remains testable).
 *
 * Captures GDPR proof bundle on click — timestamp, click coordinates,
 * browser-trust flag, document hash, user-agent, language. Matches what
 * the BE expects in `ConsentProofPayload` JSONB.
 */
@Component({
  selector: 'app-upgrade-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogHeaderComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './upgrade-confirm-dialog.component.html',
})
export class UpgradeConfirmDialogComponent {
  private readonly write = inject(SubscriptionWriteApi);

  readonly phase = signal<Phase>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly accepted = new FormControl<boolean>(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue],
  });

  readonly data: UpgradeConfirmDialogData;

  constructor(
    @Optional()
    private readonly dialogRef?: MatDialogRef<UpgradeConfirmDialogComponent, UpgradeConfirmResult>,
    @Optional() @Inject(MAT_DIALOG_DATA) data?: UpgradeConfirmDialogData,
  ) {
    this.data = data ?? {
      targetPlan: UpgradeRequestDtoInTargetPlanEnum.BUSINESS,
      priceDisplay: '',
      documentName: 'Subscription Terms',
      documentHash: '',
    };
  }

  cancel(): void {
    this.dialogRef?.close(null);
  }

  async confirm(event: MouseEvent): Promise<void> {
    if (this.accepted.invalid || this.phase() !== 'idle') {
      this.accepted.markAsTouched();
      return;
    }

    this.phase.set('submitting');
    this.errorKey.set(null);

    const proof = this.buildProof(event);

    try {
      await firstValueFrom(this.write.recordConsent(proof));
      const session = await firstValueFrom(this.write.initiateUpgrade(this.data.targetPlan));
      if (!session?.sessionUrl) {
        this.phase.set('error');
        this.errorKey.set('plan_billing.upgrade.errors.no_session');
        return;
      }
      this.dialogRef?.close({ sessionUrl: session.sessionUrl });
    } catch (err: unknown) {
      this.phase.set('error');
      this.errorKey.set(this.classifyError(err));
    }
  }

  private buildProof(event: MouseEvent): ConsentProofPayload {
    return {
      timestamp: new Date().toISOString(),
      isTrusted: event.isTrusted,
      documentHash: this.data.documentHash,
      documentName: this.data.documentName,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
      screenX: event.clientX,
      screenY: event.clientY,
      checkboxId: 'upgrade-consent-checkbox',
      categories: { subscription_terms: true },
    };
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'plan_billing.upgrade.errors.invalid_input';
      if (err.status === 409) return 'plan_billing.upgrade.errors.conflict';
      if (err.status === 429) return 'plan_billing.upgrade.errors.rate_limited';
    }
    return 'plan_billing.upgrade.errors.failed';
  }
}
