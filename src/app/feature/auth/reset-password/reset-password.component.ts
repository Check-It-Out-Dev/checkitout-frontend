import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { AuthApiService } from '../../../core/auth/auth-api.service';

interface ResetForm {
  password: FormControl<string>;
  confirmPassword: FormControl<string>;
}

/**
 * Confirms a password-reset link from email. Reads `oobCode` from query
 * params, asks BE to verify it (so we can show the email + catch expired
 * codes early), then accepts a new password and POSTs to confirm.
 *
 * On success we redirect to /auth/sign-in with a banner cue so the user
 * gets feedback even though we can't auto-login (the password just
 * changed; they need to re-enter it).
 */
@Component({
  selector: 'app-reset-password',
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
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly auth = inject(AuthApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly verifying = signal(true);
  readonly oobCodeValid = signal(false);
  readonly verifiedEmail = signal<string | null>(null);
  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly form = new FormGroup<ResetForm>(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: matchingPasswords },
  );

  private oobCode: string | null = null;

  ngOnInit(): void {
    this.oobCode = this.route.snapshot.queryParamMap.get('oobCode');
    if (!this.oobCode) {
      this.verifying.set(false);
      this.errorKey.set('auth.reset_password.error_invalid_code');
      return;
    }

    this.auth.verifyResetCode(this.oobCode).subscribe({
      next: (res) => {
        this.verifying.set(false);
        this.oobCodeValid.set(true);
        // BE may return the email in `message` or a typed field — best-effort.
        const email = (res as { email?: string }).email;
        if (email) this.verifiedEmail.set(email);
      },
      error: () => {
        this.verifying.set(false);
        this.errorKey.set('auth.reset_password.error_invalid_code');
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.loading() || !this.oobCode) return;

    this.loading.set(true);
    this.errorKey.set(null);
    this.form.disable();

    const { password } = this.form.getRawValue();
    this.auth.confirmPasswordReset(this.oobCode, password).subscribe({
      next: () => {
        void this.router.navigate(['/auth/sign-in'], {
          queryParams: { passwordReset: 'success' },
        });
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
      if (err.status === 400) return 'auth.reset_password.error_invalid_code';
    }
    return 'auth.reset_password.error_generic';
  }
}

const matchingPasswords: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
};
