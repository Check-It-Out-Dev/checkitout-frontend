import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SocialAuthService } from '../../../core/auth/social-auth.service';
import { LegalClickwrapComponent } from '../../../shared/components/legal-clickwrap/legal-clickwrap.component';

interface SignUpForm {
  email: FormControl<string>;
  password: FormControl<string>;
}

/**
 * Influencer sign-up — email + password + 3-document consent clickwrap.
 *
 * The clickwrap (see `LegalClickwrapComponent`) talks to BE on each
 * checkbox click: `POST /legal/consent/prepare` sets HMAC-signed
 * cookies BE then validates on `/auth/firebase/register` (else 400 with
 * `error.consent.required`). The form gates submit on
 * `consentValid()` emitted by the clickwrap.
 *
 * Instagram OAuth (the legacy primary flow for influencers) starts
 * via `SocialAuthService.startOAuthFlow('instagram')` — that path
 * does NOT route through this form, but BE still requires the consent
 * cookies on the OAuth callback. Stage 6e wires the clickwrap into the
 * email path; OAuth pre-redirect consent prep is a follow-up.
 */
@Component({
  selector: 'app-influencer-sign-up',
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
    LegalClickwrapComponent,
  ],
  templateUrl: './influencer-sign-up.component.html',
})
export class InfluencerSignUpComponent {
  private readonly auth = inject(AuthApiService);
  private readonly socialAuth = inject(SocialAuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly consentValid = signal(false);
  readonly socialStarting = this.socialAuth.starting;

  readonly form = new FormGroup<SignUpForm>({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  onConsentChange(allAccepted: boolean): void {
    this.consentValid.set(allAccepted);
  }

  signUpWithInstagram(): void {
    if (this.loading() || this.socialStarting()) return;
    this.errorKey.set(null);
    if (!this.socialAuth.startOAuthFlow('instagram')) {
      this.errorKey.set('auth.sign_up.unsupported_provider');
    }
  }

  submit(): void {
    if (this.form.invalid || !this.consentValid() || this.loading()) return;

    this.loading.set(true);
    this.errorKey.set(null);
    this.form.disable();

    const { email, password } = this.form.getRawValue();
    this.auth.register(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.form.enable();
        // BE sends a verification email on register; landing on
        // confirmation-required tells the user to check their inbox.
        // No /auth/exchange-token here: influencer must verify email
        // (and set password via /auth/firebase/complete-verification)
        // before they can sign in.
        void this.router.navigate(['/auth/confirmation-required']);
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
      if (err.status === 409) return 'auth.sign_up.email_already_taken';
      if (err.status === 429) return 'auth.sign_up.rate_limited';
      if (err.status === 400) return 'auth.sign_up.invalid_input';
    }
    return 'auth.sign_up.failed';
  }
}
