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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { AuthApiService } from '../../../core/auth/auth-api.service';

type State =
  | 'verifying' // applyActionCode call in flight (COMPANY/ADMIN simple flow)
  | 'success' // verified — show "go to sign in" CTA
  | 'invalid' // missing/expired oobCode or BE error
  | 'password' // INFLUENCER atomic flow — show password form
  | 'completing'; // completeVerification call in flight (after password submit)

interface PasswordForm {
  password: FormControl<string>;
  confirmPassword: FormControl<string>;
}

const passwordMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  if (!password || !confirmPassword) return null;
  return password === confirmPassword ? null : { mismatch: true };
};

/**
 * Email verification handler — two flows under one route:
 *
 * **A. COMPANY / ADMIN (default).** Click verify-email link → land here →
 * POST `/auth/firebase/apply-action-code` → success/invalid.
 *
 * **B. INFLUENCER atomic verify+set-password (`?ut=I`).** An influencer who
 * came in via Instagram OAuth has no password yet. The verify-email link
 * carries `?ut=I&iac=0` markers (see legacy
 * `TestAuthController.java:1093-1094`). On `ut=I`: skip applyActionCode,
 * show a password form, then POST `/auth/firebase/complete-verification`
 * with `{oobCode, password}` — BE runs an atomic Firebase + PG mutation.
 *
 * 5 visible states: verifying → {success | invalid | password →
 * completing → {success | invalid}}.
 */
@Component({
  selector: 'app-verify-email',
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
  template: `
    <section class="flex min-h-[60vh] items-center justify-center p-4">
      <div
        class="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm"
      >
        @switch (state()) {
          @case ('verifying') {
            <mat-spinner diameter="40" data-testid="verify-email-verifying"></mat-spinner>
            <h1 class="text-lg font-semibold">
              {{ 'auth.verify_email.verifying_title' | transloco }}
            </h1>
          }
          @case ('completing') {
            <mat-spinner diameter="40" data-testid="verify-email-completing"></mat-spinner>
            <h1 class="text-lg font-semibold">
              {{ 'auth.verify_email.verifying_title' | transloco }}
            </h1>
          }
          @case ('password') {
            <mat-icon class="!h-12 !w-12 !text-5xl text-blue-500">vpn_key</mat-icon>
            <h1 class="text-lg font-semibold">
              {{ 'auth.verify_email.set_password_title' | transloco }}
            </h1>
            <p class="text-sm text-slate2">
              {{ 'auth.verify_email.set_password_subtitle' | transloco }}
            </p>
            <form
              [formGroup]="passwordForm"
              (ngSubmit)="submitPassword()"
              class="mt-2 flex w-full flex-col gap-2 text-left"
              novalidate
            >
              <mat-form-field appearance="outline">
                <mat-label>
                  {{ 'auth.verify_email.set_password_new_password' | transloco }}
                </mat-label>
                <input
                  matInput
                  type="password"
                  autocomplete="new-password"
                  formControlName="password"
                  data-testid="verify-email-password"
                />
                <mat-hint>{{ 'auth.verify_email.set_password_hint' | transloco }}</mat-hint>
                @if (
                  passwordForm.controls.password.touched &&
                  (passwordForm.controls.password.hasError('required') ||
                    passwordForm.controls.password.hasError('minlength'))
                ) {
                  <mat-error>
                    {{ 'auth.verify_email.set_password_hint' | transloco }}
                  </mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'auth.verify_email.set_password_confirm' | transloco }}</mat-label>
                <input
                  matInput
                  type="password"
                  autocomplete="new-password"
                  formControlName="confirmPassword"
                  data-testid="verify-email-confirm-password"
                />
                @if (
                  passwordForm.controls.confirmPassword.touched && passwordForm.hasError('mismatch')
                ) {
                  <mat-error>
                    {{ 'auth.verify_email.set_password_mismatch' | transloco }}
                  </mat-error>
                }
              </mat-form-field>
              @if (errorKey(); as key) {
                <div
                  role="alert"
                  data-testid="verify-email-password-error"
                  class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {{ key | transloco }}
                </div>
              }
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="passwordForm.invalid"
                data-testid="verify-email-submit"
                class="!mt-2"
              >
                {{ 'auth.verify_email.set_password_submit' | transloco }}
              </button>
            </form>
          }
          @case ('success') {
            <mat-icon class="!h-12 !w-12 !text-5xl text-emerald-500">check_circle</mat-icon>
            @if (isInfluencerFlow()) {
              <h1 data-testid="verify-email-success" class="text-lg font-semibold">
                {{ 'auth.verify_email.success_with_password_title' | transloco }}
              </h1>
              <p class="text-sm text-slate2">
                {{ 'auth.verify_email.success_with_password_message' | transloco }}
              </p>
            } @else {
              <h1 data-testid="verify-email-success" class="text-lg font-semibold">
                {{ 'auth.verify_email.success_title' | transloco }}
              </h1>
              <p class="text-sm text-slate2">
                {{ 'auth.verify_email.success_message' | transloco }}
              </p>
            }
            <a mat-flat-button color="primary" routerLink="/auth/sign-in" class="!mt-2">
              {{ 'auth.verify_email.go_to_sign_in' | transloco }}
            </a>
          }
          @case ('invalid') {
            <mat-icon class="!h-12 !w-12 !text-5xl text-red-500">error</mat-icon>
            <h1 data-testid="verify-email-invalid" class="text-lg font-semibold">
              {{ 'auth.verify_email.error_title' | transloco }}
            </h1>
            <p class="text-sm text-slate2">
              {{ 'auth.verify_email.error_invalid_code' | transloco }}
            </p>
            @if (resendState() === 'sent') {
              <p
                role="status"
                data-testid="verify-email-resend-success"
                class="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              >
                {{ 'auth.verify_email.resend_success' | transloco }}
              </p>
            } @else if (resendState() === 'failed') {
              <p
                role="alert"
                data-testid="verify-email-resend-error"
                class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {{ 'auth.verify_email.resend_error' | transloco }}
              </p>
            }
            @if (resendState() !== 'sent') {
              <button
                mat-flat-button
                color="primary"
                type="button"
                data-testid="verify-email-resend"
                [disabled]="resendState() === 'sending'"
                (click)="resendVerificationEmail()"
                class="!mt-2"
              >
                @if (resendState() === 'sending') {
                  <mat-spinner diameter="20" class="mx-auto"></mat-spinner>
                } @else {
                  {{ 'auth.verify_email.resend_button' | transloco }}
                }
              </button>
            }
            <a mat-stroked-button routerLink="/auth/sign-in" class="!mt-2">
              {{ 'auth.verify_email.go_to_sign_in' | transloco }}
            </a>
          }
        }
      </div>
    </section>
  `,
})
export class VerifyEmailComponent implements OnInit {
  private readonly auth = inject(AuthApiService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<State>('verifying');
  readonly errorKey = signal<string | null>(null);
  readonly isInfluencerFlow = signal(false);
  /** Resend-button state, only visible from the `invalid` case. */
  readonly resendState = signal<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  private oobCode: string | null = null;

  readonly passwordForm = new FormGroup<PasswordForm>(
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
    { validators: passwordMatchValidator },
  );

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.oobCode = params.get('oobCode');
    const userType = params.get('ut');

    if (!this.oobCode) {
      this.state.set('invalid');
      return;
    }

    if (userType === 'I') {
      // INFLUENCER atomic flow — defer the API call until they submit a
      // password. We don't pre-validate the oobCode; if it's stale, the
      // BE will reject the completeVerification call and we'll show the
      // invalid state then.
      this.isInfluencerFlow.set(true);
      this.state.set('password');
      return;
    }

    // COMPANY / ADMIN — simple verify.
    this.auth.verifyEmail(this.oobCode).subscribe({
      next: () => this.state.set('success'),
      error: () => this.state.set('invalid'),
    });
  }

  submitPassword(): void {
    // Re-entry guard: once the completeVerification call is in flight the
    // @switch hides the form, but a fast double-fire before change detection
    // can call this twice — and a second call resolving to 'invalid' would
    // overwrite the first's 'success'. Bail if already completing.
    if (this.state() === 'completing' || this.passwordForm.invalid || !this.oobCode) return;
    const { password } = this.passwordForm.getRawValue();
    this.errorKey.set(null);
    this.state.set('completing');

    this.auth.completeVerification(this.oobCode, password).subscribe({
      next: () => this.state.set('success'),
      error: () => {
        // BE rejected the oobCode (stale/used) or password (too weak).
        // Either way, drop them on the invalid screen — they can request
        // a new verification email from sign-in.
        this.state.set('invalid');
      },
    });
  }

  resendVerificationEmail(): void {
    if (this.resendState() === 'sending' || this.resendState() === 'sent') return;
    this.resendState.set('sending');
    this.auth.sendVerificationEmail().subscribe({
      next: () => this.resendState.set('sent'),
      error: () => this.resendState.set('failed'),
    });
  }
}
