import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { AuthApiService } from '../../../core/auth/auth-api.service';

interface ForgotForm {
  email: FormControl<string>;
}

/**
 * Forgot-password — sends a reset link to whatever email the user types.
 *
 * The BE deliberately returns an identical 2xx envelope whether the email
 * exists or not (anti-enumeration). So the FE just flips to a "check your
 * inbox" success state on any non-error response and never differentiates
 * between "valid email" and "unknown email" client-side.
 */
@Component({
  selector: 'app-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthApiService);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly form = new FormGroup<ForgotForm>({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
  });

  submit(): void {
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.errorKey.set(null);
    this.form.disable();

    const { email } = this.form.getRawValue();
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.loading.set(false);
        this.submitted.set(true);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.form.enable();
        this.errorKey.set(this.classifyError(err));
      },
    });
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 429) return 'auth.forgot_password.rate_limited';
      // No service-unavailable key in legacy — fall back to the generic error.
    }
    return 'auth.forgot_password.error';
  }
}
