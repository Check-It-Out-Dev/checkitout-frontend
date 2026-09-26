import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { EMPTY, catchError, of, switchMap } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { SocialAuthService } from '../../../core/auth/social-auth.service';
import { currentDemoRole, isDemoMode } from '../../../core/demo/demo-mode';
import { TwoFactorVerifyDialogComponent } from '../../../shared/components/two-factor-verify-dialog/two-factor-verify-dialog.component';

interface SignInForm {
  email: FormControl<string>;
  password: FormControl<string>;
  rememberMe: FormControl<boolean>;
}

/**
 * Email/password sign-in with the full Stage-6 admin TOTP + cookie-only
 * recipe.
 *
 *   POST /auth/firebase/login → BE sets HttpOnly FirebaseIdToken cookie
 *     + (for ADMIN with 2FA) `requires2FA=true` flag on response body.
 *   POST /auth/exchange-token → BE reads the cookie, mints `session` +
 *     `session_sig` HttpOnly cookies (full or partial).
 *   On `requires2FA`: open `TwoFactorVerifyDialogComponent`, then
 *     re-call /auth/exchange-token to upgrade partial → full.
 *   On `requires2FASetup` (PENDING_ADMIN): redirect to /auth/2fa-setup.
 *   GET /users/me via SessionStateService.probe() → seed cache, navigate /.
 *
 * No client-side token storage at any step — see memory
 * `feedback_no_client_token_storage`. The form is wired to a typed
 * `FormGroup<SignInForm>` so the template gets autocomplete on
 * `controls.email` etc.
 */
@Component({
  selector: 'app-sign-in',
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
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
})
export class SignInComponent {
  private readonly auth = inject(AuthApiService);
  private readonly session = inject(SessionStateService);
  private readonly socialAuth = inject(SocialAuthService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  /** Translation key for the visible error message, or null when no error. */
  readonly errorKey = signal<string | null>(null);
  /** True between OAuth-button click and the actual page redirect. */
  readonly socialStarting = this.socialAuth.starting;
  /** Password-visibility toggle for the show/hide eye icon. */
  readonly passwordVisible = signal(false);

  readonly form = new FormGroup<SignInForm>({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    rememberMe: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    // Demo build: any credentials sign the persona in, so the form comes
    // prefilled with the persona the guided tour (or the last visit) chose —
    // one click and the visitor is inside; the admin-2fa sandbox narrates
    // "you don't need to type anything" on this screen and its admin
    // address is what triggers the TOTP beat.
    if (isDemoMode()) {
      const email = {
        ADMIN: 'admin@checkitout.app',
        INFLUENCER: 'ola.kowalska@example.com',
        COMPANY: 'demo@checkitout.app',
      }[currentDemoRole()];
      this.form.patchValue({ email, password: 'demo-checkitout' });
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.errorKey.set(null);
    this.form.disable();

    const { email, password } = this.form.getRawValue();

    // Production sign-in chain. Step transitions are wired with
    // switchMap so each step waits for the previous Observable to
    // emit. The conditional flows (PENDING_ADMIN, ADMIN+2FA) bail out
    // by returning a sentinel Observable that the next step interprets.
    this.auth
      .signIn(email, password)
      .pipe(
        switchMap((login) => {
          if (login.requires2FASetup) {
            // PENDING_ADMIN — route to setup, skip the rest.
            void this.router.navigate(['/auth/2fa-setup']);
            this.loading.set(false);
            this.form.enable();
            return EMPTY;
          }
          // First exchange-token: ADMIN gets partialSession; others get
          // full session immediately.
          return this.auth.exchangeTokenForSession().pipe(switchMap(() => of(login)));
        }),
        switchMap((login) => {
          if (!login.requires2FA) return of({ verified: true } as const);
          // ADMIN — open TOTP dialog, wait for result.
          return this.dialog
            .open<TwoFactorVerifyDialogComponent, undefined, { verified: boolean }>(
              TwoFactorVerifyDialogComponent,
              { disableClose: true, autoFocus: 'first-tabbable' },
            )
            .afterClosed()
            .pipe(
              switchMap((result) => {
                if (!result?.verified) {
                  // Drop the partial-session cookie + surface error.
                  return this.auth.signOut().pipe(
                    switchMap(() => {
                      this.loading.set(false);
                      this.form.enable();
                      this.errorKey.set('auth.sign_in.two_factor_cancelled');
                      return EMPTY;
                    }),
                    catchError(() => {
                      this.loading.set(false);
                      this.form.enable();
                      this.errorKey.set('auth.sign_in.two_factor_cancelled');
                      return EMPTY;
                    }),
                  );
                }
                // Re-exchange — BE mints the full session cookie.
                return this.auth
                  .exchangeTokenForSession()
                  .pipe(switchMap(() => of({ verified: true } as const)));
              }),
            );
        }),
        switchMap(() => this.session.probe()),
      )
      .subscribe({
        next: (user) => {
          this.loading.set(false);
          this.form.enable();
          if (!user) {
            this.errorKey.set('auth.sign_in.login_failed');
            return;
          }
          // Straight into the app — the same target noAuthGuard uses for an
          // already-authenticated visitor; "/" is the marketing landing.
          void this.router.navigate(['/collaborations/list']);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.form.enable();
          this.errorKey.set(this.classifyError(err));
        },
      });
  }

  signInWithInstagram(): void {
    if (this.loading() || this.socialStarting()) return;
    this.errorKey.set(null);
    if (!this.socialAuth.startOAuthFlow('instagram')) {
      this.errorKey.set('auth.sign_in.unsupported_provider');
    }
    // No subscribe — startOAuthFlow triggers a full-page redirect to
    // Instagram. SocialCallbackComponent + AuthSuccessComponent handle
    // the return path.
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return 'auth.sign_in.invalid_credentials';
      if (err.status === 429) return 'auth.sign_in.rate_limited';
      if (err.status === 0) return 'auth.sign_in.service_unavailable';
    }
    return 'auth.sign_in.login_failed';
  }
}
