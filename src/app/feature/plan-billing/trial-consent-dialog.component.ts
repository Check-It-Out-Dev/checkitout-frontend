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
import { SubscriptionWriteApi } from '../../core/subscription/subscription.service';
import { DialogHeaderComponent } from '../../shared/components/dialog-header/dialog-header.component';

export interface TrialConsentDialogData {
  /** Canonical name of the legal document — recorded with the consent, never localised. */
  readonly documentName: string;
  /** What the checkbox shows for it in the visitor's language (falls back to the name). */
  readonly documentLabel?: string;
  /** SHA-256 of the legal document the user saw. Server compares for tamper-evidence. */
  readonly documentHash: string;
}

export type TrialConsentResult = { accepted: true } | null;

type Phase = 'idle' | 'submitting' | 'error';

/**
 * Consent capture for trial activation (iter-50, audit P0 #3 — GDPR /
 * Directive 2011/83/EU Art 16(m)). Legacy gated `activateTrial()` behind
 * `SubscriptionConsentDialogComponent`; the greenfield port had dropped it
 * and fired the trial POST directly.
 *
 * The BE keeps consent and trial as two independent endpoints and does NOT
 * enforce ordering, so the FE must: `POST /subscription/consent` (with the
 * GDPR proof bundle) must succeed BEFORE the dialog closes accepted; only
 * then does the caller fire `POST /subscription/trial/activate`. Mirrors
 * the upgrade-confirm dialog, which runs the same consent-first sequence.
 * BE resolves the terms version server-side (`LegalDocumentType.
 * SUBSCRIPTION_ACTIVATION_CONSENT`, locale-based) — the payload carries no
 * version field.
 */
@Component({
  selector: 'app-trial-consent-dialog',
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
  templateUrl: './trial-consent-dialog.component.html',
})
export class TrialConsentDialogComponent {
  private readonly write = inject(SubscriptionWriteApi);

  readonly phase = signal<Phase>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly accepted = new FormControl<boolean>(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue],
  });

  readonly data: TrialConsentDialogData;

  constructor(
    @Optional()
    private readonly dialogRef?: MatDialogRef<TrialConsentDialogComponent, TrialConsentResult>,
    @Optional() @Inject(MAT_DIALOG_DATA) data?: TrialConsentDialogData,
  ) {
    this.data = data ?? {
      documentName: 'Subscription Activation Consent',
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

    try {
      await firstValueFrom(this.write.recordConsent(this.buildProof(event)));
      this.dialogRef?.close({ accepted: true });
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
      checkboxId: 'trial-consent-checkbox',
      categories: { subscription_activation: true },
    };
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'plan_billing.trial.consent.errors.invalid_input';
      if (err.status === 429) return 'plan_billing.trial.consent.errors.rate_limited';
    }
    return 'plan_billing.trial.consent.errors.failed';
  }
}
