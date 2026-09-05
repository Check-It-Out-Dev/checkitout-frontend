import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { TwoFactorService } from '../../../core/two-factor/two-factor.service';
import { DialogHeaderComponent } from '../dialog-header/dialog-header.component';

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
    DialogHeaderComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  template: `
    <app-dialog-header
      icon="lock"
      tone="navy"
      [eyebrow]="'auth.two_factor_verify.eyebrow' | transloco"
      titleTestId="two-factor-verify-title"
    >
      {{ 'auth.two_factor_verify.title' | transloco }}
    </app-dialog-header>
    <mat-dialog-content class="!pt-4">
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
          #codeInput
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

  @ViewChild('codeInput') private readonly codeInput?: ElementRef<HTMLInputElement>;

  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
  });

  constructor() {
    // A refusal is about the code that was sent, not about the one being typed
    // now. It used to be cleared only on the next submit, so the dialog kept
    // saying the code did not match while the visitor was part-way through a
    // different one — and in the demo it was still saying it over a code that
    // was about to be accepted.
    this.code.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.errorKey.set(null));
  }

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
        // The server says why, and it is the difference the tour is teaching:
        // a code that is wrong and a code that is merely late are not the same
        // refusal. Saying "does not match" over a code the visitor has just
        // watched appear made the dialog argue with the narration explaining
        // that the window is seconds.
        const expired = response.message === 'expired';
        this.errorKey.set(
          expired ? 'auth.two_factor_verify.expired_code' : 'auth.two_factor_verify.invalid_code',
        );
        this.retype(expired);
      },
      error: (err: unknown) => {
        this.verifying.set(false);
        this.code.enable();
        this.errorKey.set(this.classifyError(err));
        this.retype();
      },
    });
  }

  /**
   * A refused code puts the caret back in the field, with the old digits
   * selected so the next keystroke replaces them — unless it expired, in which
   * case the digits go.
   *
   * The difference is whether the value is worth anything. A code that does not
   * match may be a typo, and selecting it lets the visitor correct one digit or
   * type over the lot. A code that has expired is worth nothing at all: nothing
   * you can do to it makes it work, and it has to be replaced from the
   * authenticator. Leaving it in the field made the demo point its ring at a
   * field holding exactly the code it had just called dead, under a red banner
   * saying so, while the narration said "this one is current, send it" — two
   * reviewers found that on the same tour, one on each path. It also left a
   * browser-blue selection block sitting on the digits across three steps, the
   * only cold colour on the screen.
   *
   * The value is cleared without an event so that the banner explaining WHY it
   * was refused survives; the field's own valueChanges is what clears that.
   *
   * Verifying disables the control, which makes the browser blur the input;
   * enabling it again does not give the focus back. Measured on the live demo
   * (2026-09-05): after a rejection the focus sat on the submit button, the
   * refused code stayed in the field, and typing did nothing at all until the
   * visitor clicked back into it. The timeout waits for Angular to take the
   * `disabled` attribute off — a disabled input cannot be focused.
   */
  private retype(expired = false): void {
    if (expired) this.code.setValue('', { emitEvent: false });
    setTimeout(() => {
      const el = this.codeInput?.nativeElement;
      if (!el) return;
      el.focus();
      if (!expired) el.select();
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
