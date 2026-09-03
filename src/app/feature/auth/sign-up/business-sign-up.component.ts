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
import type { NipLookupResponse } from '../../../api/model/nip-lookup-response';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { CompanyRegistryService } from '../../../core/registry/registry.service';
import { LegalClickwrapComponent } from '../../../shared/components/legal-clickwrap/legal-clickwrap.component';

interface BusinessSignUpForm {
  nip: FormControl<string>;
  email: FormControl<string>;
  password: FormControl<string>;
}

const NIP_PATTERN = /^\d{10}$/;

/**
 * Business sign-up — NIP first, then email/password/ToS.
 *
 * Flow:
 * 1. User types 10-digit NIP → click "Verify" (or blur) → BE lookup
 *    against GUS BIR1 + CEIDG + Biała Lista. Show company name + VAT
 *    status as a read-only confirmation card.
 * 2. User fills email + password + accepts ToS.
 * 3. Submit → POST /auth/firebase/register (same envelope as influencer
 *    sign-up). Company metadata wiring (linking the registered NIP to
 *    the new account on the BE side) is a Stage 2 polish task — for
 *    Phase 3 Stage 1 this just establishes the account, the user goes
 *    through `/company/setup` afterwards to attach the company.
 */
@Component({
  selector: 'app-business-sign-up',
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
  templateUrl: './business-sign-up.component.html',
})
export class BusinessSignUpComponent {
  private readonly auth = inject(AuthApiService);
  private readonly registry = inject(CompanyRegistryService);
  private readonly router = inject(Router);

  readonly looking = signal(false);
  readonly registering = signal(false);
  readonly company = signal<NipLookupResponse | null>(null);
  readonly errorKey = signal<string | null>(null);
  readonly consentValid = signal(false);

  readonly form = new FormGroup<BusinessSignUpForm>({
    nip: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(NIP_PATTERN)],
    }),
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

  /** Trigger NIP lookup. Caller wires this to the "Verify NIP" button. */
  verifyNip(): void {
    const nipControl = this.form.controls.nip;
    if (nipControl.invalid || this.looking()) return;

    this.looking.set(true);
    this.errorKey.set(null);
    this.company.set(null);
    this.registry.lookup(nipControl.value).subscribe({
      next: (res) => {
        this.looking.set(false);
        if (!res.companyName) {
          this.errorKey.set('auth.sign_up.nip_not_found');
          return;
        }
        this.company.set(res);
      },
      error: (err: unknown) => {
        this.looking.set(false);
        this.errorKey.set(this.classifyLookupError(err));
      },
    });
  }

  submit(): void {
    if (this.form.invalid || !this.consentValid() || this.registering()) return;
    if (!this.company()) {
      this.errorKey.set('auth.sign_up.verify_nip_first');
      return;
    }

    this.registering.set(true);
    this.errorKey.set(null);
    this.form.disable();

    const { email, password } = this.form.getRawValue();
    this.auth.register(email, password).subscribe({
      next: () => {
        this.registering.set(false);
        this.form.enable();
        // Business users finish setup at /company/setup (Stage 2 slice)
        // — Phase 3 Stage 1 just lands them in the verification flow.
        // No /auth/exchange-token here: user can't sign in until they
        // verify the email link.
        void this.router.navigate(['/auth/confirmation-required']);
      },
      error: (err: unknown) => {
        this.registering.set(false);
        this.form.enable();
        this.errorKey.set(this.classifyRegisterError(err));
      },
    });
  }

  private classifyLookupError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 404) return 'auth.sign_up.nip_not_found';
      if (err.status === 429) return 'auth.sign_up.lookup_rate_limited';
    }
    return 'auth.sign_up.lookup_failed';
  }

  private classifyRegisterError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 409) return 'auth.sign_up.email_already_taken';
      if (err.status === 429) return 'auth.sign_up.rate_limited';
      if (err.status === 400) return 'auth.sign_up.invalid_input';
    }
    return 'auth.sign_up.failed';
  }
}
