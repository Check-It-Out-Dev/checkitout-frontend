import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { TwoFactorService } from '../../../core/two-factor/two-factor.service';

type Step = 'loading' | 'setup' | 'backup' | 'complete' | 'error';

/**
 * `/auth/2fa-setup` — first-time TOTP enrollment for PENDING_ADMIN.
 *
 * Reached only via SignInComponent when /auth/firebase/login returns
 * `requires2FASetup=true`. Greenfield carries the partialSession cookie
 * at this point — `/twofactor/setup` and `/twofactor/verify-setup` are
 * the only BE endpoints reachable until enrollment finishes.
 *
 * Three-step flow (no intro screen — BE forces this state, so the user
 * has nowhere else to go but sign-out anyway):
 *   1. `setup` — show QR + secret + 6-digit verify input (auto-fetched).
 *   2. `backup` — display recovery codes; require confirmation checkbox.
 *   3. `complete` — re-probe `/users/me` (BE auto-issued full session
 *       with role=ADMIN) and route to `/`.
 *
 * Errors surface via `errorKey` signal. The 401-on-verify case is the
 * "wrong code" path — keep the user on this screen and let them retry.
 */
@Component({
  selector: 'app-two-factor-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './two-factor-setup.component.html',
  styleUrl: './two-factor-setup.component.scss',
})
export class TwoFactorSetupComponent implements OnInit {
  private readonly twoFactor = inject(TwoFactorService);
  private readonly session = inject(SessionStateService);
  private readonly router = inject(Router);

  readonly step = signal<Step>('loading');
  readonly errorKey = signal<string | null>(null);
  readonly verifying = signal(false);
  readonly finalizing = signal(false);

  readonly qrCodeImage = signal<string>('');
  readonly secret = signal<string>('');
  readonly secretFormatted = signal<string>('');
  readonly issuer = signal<string>('');
  readonly emailLabel = signal<string>('');
  readonly backupCodes = signal<string[]>([]);
  readonly codesConfirmed = signal(false);

  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
  });

  ngOnInit(): void {
    this.twoFactor.setup().subscribe({
      next: (response) => {
        if (response.alreadyEnabled) {
          // Edge case — BE says 2FA was already configured. Just go home.
          void this.router.navigate(['/']);
          return;
        }
        if (!response.qrCodeImage && !response.qrCodeUrl) {
          this.errorKey.set('auth.two_factor_setup.errors.setup_failed');
          this.step.set('error');
          return;
        }
        this.qrCodeImage.set(response.qrCodeImage ?? '');
        this.secret.set(response.secret ?? '');
        this.secretFormatted.set(response.secretFormatted ?? response.secret ?? '');
        this.backupCodes.set(response.backupCodes ?? []);
        this.issuer.set(response.issuer ?? '');
        this.emailLabel.set(response.email ?? '');
        this.step.set('setup');
      },
      error: (err: unknown) => {
        this.errorKey.set(this.classifyError(err));
        this.step.set('error');
      },
    });
  }

  verify(): void {
    if (this.code.invalid || this.verifying()) return;
    this.verifying.set(true);
    this.errorKey.set(null);
    this.code.disable();

    this.twoFactor.verifySetup(this.code.value).subscribe({
      next: (response) => {
        this.verifying.set(false);
        this.code.enable();
        if (response.success) {
          this.step.set('backup');
          return;
        }
        this.errorKey.set('auth.two_factor_setup.errors.invalid_code');
      },
      error: (err: unknown) => {
        this.verifying.set(false);
        this.code.enable();
        this.errorKey.set(this.classifyError(err));
      },
    });
  }

  toggleConfirm(checked: boolean): void {
    this.codesConfirmed.set(checked);
  }

  complete(): void {
    if (!this.codesConfirmed() || this.finalizing()) return;
    this.finalizing.set(true);
    this.step.set('complete');
    // BE auto-issued a fresh session cookie with role=ADMIN at the
    // moment /twofactor/verify-setup succeeded. Drop the cached
    // SessionState (still says PENDING_ADMIN) and re-probe so the
    // shell renders the right nav for the upgraded role.
    this.session.clear();
    this.session.probe().subscribe({
      next: () => {
        void this.router.navigate(['/']);
      },
      error: () => {
        // Probe failure means cookie didn't roll over for some reason —
        // safest is to send them through sign-in again.
        void this.router.navigate(['/auth/sign-in']);
      },
    });
  }

  copyToClipboard(text: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return 'auth.two_factor_setup.errors.invalid_code';
      if (err.status === 403) return 'auth.two_factor_setup.errors.access_denied';
      if (err.status === 429) return 'auth.two_factor_setup.errors.rate_limited';
      if (err.status === 0) return 'auth.two_factor_setup.errors.service_unavailable';
    }
    return 'auth.two_factor_setup.errors.failed';
  }
}
