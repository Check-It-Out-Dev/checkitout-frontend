import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { AuthApiService } from '../../core/auth/auth-api.service';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PasswordFormShape {
  currentPassword: FormControl<string>;
  newPassword: FormControl<string>;
  confirmPassword: FormControl<string>;
}

/** Cross-field: newPassword must equal confirmPassword. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return next && confirm && next !== confirm ? { passwordsMismatch: true } : null;
}

/**
 * Security tab at `/user/settings/security` (legacy Security-tab
 * parity — legacy hosted it inside the single /user/settings page; the
 * greenfield URL-per-tab split is the established deliberate
 * divergence). Slice 1: password change (current + new + confirm, min 8
 * chars matching the legacy validator). The BE re-verifies the current
 * password against Firebase; a wrong one maps to a dedicated error key.
 * The 2FA setup wizard keeps its own route (`/auth/2fa-setup`) — the
 * tab links to it as the second security concern.
 */
@Component({
  selector: 'app-security-settings',
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
  templateUrl: './security-settings.component.html',
})
export class SecuritySettingsComponent {
  private readonly auth = inject(AuthApiService);

  readonly state = signal<SaveState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly form = new FormGroup<PasswordFormShape>(
    {
      currentPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      newPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: [passwordsMatch] },
  );

  submit(): void {
    if (this.form.invalid || this.state() === 'saving') {
      this.form.markAllAsTouched();
      return;
    }
    this.state.set('saving');
    this.errorKey.set(null);
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.state.set('saved');
        this.form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      },
      error: (err: { status?: number }) => {
        this.state.set('error');
        this.errorKey.set(
          err?.status === 400 || err?.status === 401
            ? 'settings.security.error.wrong_current'
            : err?.status === 429
              ? 'settings.security.error.rate_limited'
              : 'settings.security.error.failed',
        );
      },
    });
  }
}
