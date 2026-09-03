import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { TwoFactorService } from '../../../core/two-factor/two-factor.service';

/**
 * Login-time TOTP challenge dialog.
 *
 * Opened by SignInComponent when /auth/firebase/login returns
 * `requires2FA=true` (existing ADMIN). Greenfield is in the
 * partialSession state at this point — `/twofactor/verify` is the only
 * BE endpoint reachable until the user passes the challenge.
 *
 * On success: closes with `{ verified: true }` so SignInComponent can
 * re-call `/auth/exchange-token` for the full session.
 * On cancel: closes with `{ verified: false }` — caller should sign out
 * to drop the partial-session cookie.
 *
 * 6-digit numeric input. Shows rate-limit + invalid-code errors. No
 * backup-code path here (that's a separate dialog if/when needed).
 */
@Component({
  selector: 'app-two-factor-verify-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  template: `
    <h2 mat-dialog-title data-testid="two-factor-verify-title">
      {{ 'auth.two_factor_verify.title' | transloco }}
    </h2>
    <mat-dialog-content>
      <p class="mb-4 text-sm text-slate2">
        {{ 'auth.two_factor_verify.description' | transloco }}
      </p>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>{{ 'auth.two_factor_verify.code_label' | transloco }}</mat-label>
        <input
          matInput
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          [formControl]="code"
          data-testid="two-factor-verify-code"
          (keyup.enter)="verify()"
        />
      </mat-form-field>
      @if (errorKey(); as key) {
        <div
          role="alert"
          data-testid="two-factor-verify-error"
          class="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ key | transloco }}
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button
        mat-button
        type="button"
        [disabled]="verifying()"
        (click)="cancel()"
        data-testid="two-factor-verify-cancel"
      >
        {{ 'auth.two_factor_verify.cancel' | transloco }}
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="verifying() || code.invalid"
        (click)="verify()"
        data-testid="two-factor-verify-submit"
      >
        @if (verifying()) {
          <mat-spinner diameter="20" class="mx-auto"></mat-spinner>
        } @else {
          {{ 'auth.two_factor_verify.submit' | transloco }}
        }
      </button>
    </mat-dialog-actions>
  `,
})
export class TwoFactorVerifyDialogComponent {
  private readonly twoFactor = inject(TwoFactorService);
  private readonly dialogRef =
    inject<MatDialogRef<TwoFactorVerifyDialogComponent, { verified: boolean }>>(MatDialogRef);

  readonly verifying = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
  });

  verify(): void {
    if (this.code.invalid || this.verifying()) return;
    this.verifying.set(true);
    this.errorKey.set(null);
    this.code.disable();

    this.twoFactor.verify(this.code.value).subscribe({
      next: (response) => {
        this.verifying.set(false);
        this.code.enable();
        if (response.success) {
          this.dialogRef.close({ verified: true });
          return;
        }
        this.errorKey.set('auth.two_factor_verify.invalid_code');
      },
      error: (err: unknown) => {
        this.verifying.set(false);
        this.code.enable();
        this.errorKey.set(this.classifyError(err));
      },
    });
  }

  cancel(): void {
    if (this.verifying()) return;
    this.dialogRef.close({ verified: false });
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return 'auth.two_factor_verify.invalid_code';
      if (err.status === 429) return 'auth.two_factor_verify.rate_limited';
      if (err.status === 0) return 'auth.two_factor_verify.service_unavailable';
    }
    return 'auth.two_factor_verify.failed';
  }
}
