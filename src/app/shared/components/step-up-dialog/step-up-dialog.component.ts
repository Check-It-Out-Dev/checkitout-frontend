import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  Optional,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import {
  StepUpActionType,
  StepUpChallengeType,
  StepUpService,
} from '../../../core/step-up/step-up.service';

/**
 * Per-action input. The dialog opens, kicks off `/step-up/request` (which
 * either sends an email code for INFLUENCER/COMPANY or returns immediately
 * for ADMIN/TOTP), then waits for the user to enter the 6-digit code. On
 * verify success the dialog closes with the single-use X-Step-Up-Token.
 */
export interface StepUpDialogData {
  readonly action: StepUpActionType;
  /** Email shown in the EMAIL_CODE instruction line. Optional (UX nicety). */
  readonly email?: string;
}

/**
 * Result handed back to the caller via `MatDialogRef.afterClosed()`.
 *
 *   `null`   — user cancelled (or the BE said step-up is not required).
 *   `string` — the X-Step-Up-Token to attach to the next critical write.
 */
export type StepUpDialogResult = string | null;

type Phase = 'requesting' | 'awaiting_code' | 'verifying' | 'error';

const CODE_PATTERN = /^\d{6}$/;

@Component({
  selector: 'app-step-up-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './step-up-dialog.component.html',
})
export class StepUpDialogComponent implements OnInit {
  private readonly stepUp = inject(StepUpService);

  readonly phase = signal<Phase>('requesting');
  readonly errorKey = signal<string | null>(null);
  readonly challengeType = signal<StepUpChallengeType>(StepUpChallengeType.EMAIL_CODE);

  readonly codeControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(CODE_PATTERN)],
  });

  /** Holds the data ref for template binding (email, action). */
  readonly data: StepUpDialogData;

  constructor(
    @Optional()
    private readonly dialogRef?: MatDialogRef<StepUpDialogComponent, StepUpDialogResult>,
    @Optional() @Inject(MAT_DIALOG_DATA) data?: StepUpDialogData,
  ) {
    this.data = data ?? { action: StepUpActionType.EMAIL_CHANGE };
  }

  ngOnInit(): void {
    this.requestCode();
  }

  requestCode(): void {
    this.phase.set('requesting');
    this.errorKey.set(null);

    this.stepUp.request(this.data.action).subscribe({
      next: (res) => {
        // Server says step-up not actually required (e.g. setup incomplete) —
        // close with `null` and let the caller proceed without a token.
        if (res.required === false) {
          this.dialogRef?.close(null);
          return;
        }
        if (res.challengeType) {
          this.challengeType.set(res.challengeType);
        }
        this.phase.set('awaiting_code');
      },
      error: (err: unknown) => this.handleError(err, 'send_failed'),
    });
  }

  verify(): void {
    if (this.codeControl.invalid) {
      this.codeControl.markAsTouched();
      return;
    }

    this.phase.set('verifying');
    this.errorKey.set(null);
    const code = this.codeControl.value.trim();

    this.stepUp.verify(this.data.action, code).subscribe({
      next: (res) => {
        if (res.success && res.token) {
          this.dialogRef?.close(res.token);
          return;
        }
        // BE returned 200 but no token — treat as invalid code.
        this.phase.set('awaiting_code');
        this.errorKey.set('step_up.dialog.errors.invalid_code');
        this.codeControl.reset('');
      },
      error: (err: unknown) => this.handleError(err, 'invalid_code'),
    });
  }

  cancel(): void {
    this.dialogRef?.close(null);
  }

  private handleError(err: unknown, fallback: 'send_failed' | 'invalid_code'): void {
    this.phase.set('awaiting_code');
    this.codeControl.reset('');
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        this.errorKey.set('step_up.dialog.errors.invalid_code');
        return;
      }
      if (err.status === 429) {
        this.errorKey.set('step_up.dialog.errors.rate_limited');
        return;
      }
      if (err.status === 423) {
        this.errorKey.set('step_up.dialog.errors.locked_out');
        return;
      }
    }
    this.errorKey.set(`step_up.dialog.errors.${fallback}`);
  }
}
