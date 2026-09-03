import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import type { UserDtoIn } from '../../api/model/user-dto-in';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { StepUpActionType } from '../../core/step-up/step-up.service';
import { UserApiService } from '../../core/user/user.service';
import {
  StepUpDialogComponent,
  type StepUpDialogData,
  type StepUpDialogResult,
} from '../../shared/components/step-up-dialog/step-up-dialog.component';

interface EmailChangeForm {
  email: FormControl<string>;
}

type Phase = 'idle' | 'verifying' | 'submitting' | 'sent' | 'error';

/**
 * Inline email-change panel embedded in `/user/settings/account`. Toggles
 * between collapsed (just a "Change email" link) and expanded (form +
 * step-up flow).
 *
 * Flow:
 *   1. User enters new email + submits.
 *   2. We open `StepUpDialogComponent` with action=EMAIL_CHANGE.
 *   3. On dialog success: PATCH /api/user/{id} with the new email and
 *      `X-Step-Up-Token` (via the step-up interceptor + HttpContext).
 *   4. BE responds OK + sends a confirmation email; the change activates
 *      after the user clicks the link in that email. We surface a
 *      "verification sent" state.
 */
@Component({
  selector: 'app-email-change',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './email-change.component.html',
})
export class EmailChangeComponent implements OnInit {
  @Input({ required: true }) user!: UserDtoOut;

  private readonly userApi = inject(UserApiService);
  private readonly dialog = inject(MatDialog);

  readonly expanded = signal(false);
  readonly phase = signal<Phase>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly newEmail = signal<string>('');

  readonly form = new FormGroup<EmailChangeForm>({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
  });

  ngOnInit(): void {
    // Reset form when component initializes — defensive in case the user
    // navigates back to the page after a previous attempt.
    this.form.reset({ email: '' });
  }

  expand(): void {
    this.expanded.set(true);
    this.phase.set('idle');
    this.errorKey.set(null);
    this.form.reset({ email: '' });
  }

  cancel(): void {
    this.expanded.set(false);
    this.phase.set('idle');
    this.errorKey.set(null);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.phase() === 'submitting' || this.phase() === 'verifying') {
      return;
    }
    const newEmail = this.form.controls.email.value.trim();
    if (newEmail.toLowerCase() === (this.user.email ?? '').toLowerCase()) {
      this.errorKey.set('profile.email_change.errors.same_as_current');
      return;
    }

    this.phase.set('verifying');
    this.errorKey.set(null);

    const data: StepUpDialogData = {
      action: StepUpActionType.EMAIL_CHANGE,
      email: this.user.email,
    };
    const ref = this.dialog.open<StepUpDialogComponent, StepUpDialogData, StepUpDialogResult>(
      StepUpDialogComponent,
      {
        data,
        width: '420px',
        disableClose: false,
        autoFocus: 'first-tabbable',
      },
    );

    const token = await firstValueFrom(ref.afterClosed());
    if (!token) {
      // User cancelled — or BE said step-up not required. The latter case
      // hits the BE path that *also* returns 401 if the action *is* required
      // for this user; we can safely retry the PATCH with no token and let
      // the BE be the source of truth.
      this.phase.set('idle');
      return;
    }

    this.phase.set('submitting');
    await this.patchEmail(newEmail, token);
  }

  private async patchEmail(newEmail: string, stepUpToken: string): Promise<void> {
    const u = this.user;
    if (!u.id || !u.userType?.value || !u.accountStatus?.value) {
      this.phase.set('error');
      this.errorKey.set('profile.email_change.errors.missing_required');
      return;
    }

    const dto: UserDtoIn = {
      id: u.id,
      userType: u.userType.value as unknown as UserDtoIn['userType'],
      email: newEmail,
      accountStatus: u.accountStatus.value as unknown as UserDtoIn['accountStatus'],
    };

    try {
      await firstValueFrom(this.userApi.patch(u.id, dto, stepUpToken));
      this.newEmail.set(newEmail);
      this.phase.set('sent');
    } catch (err: unknown) {
      this.phase.set('error');
      this.errorKey.set(this.classifyError(err));
    }
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'profile.email_change.errors.invalid_input';
      if (err.status === 401) return 'profile.email_change.errors.step_up_invalid';
      if (err.status === 409) return 'profile.email_change.errors.email_taken';
      if (err.status === 429) return 'profile.email_change.errors.rate_limited';
    }
    return 'profile.email_change.errors.failed';
  }
}
