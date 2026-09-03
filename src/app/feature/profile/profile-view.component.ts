import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import type { UserDtoIn } from '../../api/model/user-dto-in';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { UserApiService } from '../../core/user/user.service';
import {
  DeleteBlockersDialogComponent,
  type DeleteBlockersDialogData,
} from './delete-blockers-dialog.component';
import { DeleteConfirmationDialogComponent } from './delete-confirmation-dialog.component';
import { EmailChangeComponent } from './email-change.component';
import { ProfilePictureUploadComponent } from './profile-picture-upload.component';

type State = 'loading' | 'loaded' | 'error';
type Mode = 'view' | 'edit';

interface ProfileEditForm {
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  name: FormControl<string>;
  phoneNumber: FormControl<string>;
}

/**
 * Profile at `/user/settings` — view + edit modes in one component.
 *
 * State machines:
 *   load: loading → loaded | error
 *   mode: view ⇄ edit (only meaningful when state = loaded)
 *
 * Edit mode opens a typed reactive form pre-populated from the loaded
 * user. Submit → PATCH /api/user/{id} with the editable fields swapped
 * into a full UserDtoIn (preserving `userType` + `email` +
 * `accountStatus` from the loaded user, since the BE schema requires
 * them on every write).
 *
 * Email + NIP changes intentionally NOT in this slice — those need
 * step-up auth (C6) and BE-side update-email flow (C7).
 */
@Component({
    selector: 'app-profile-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatDialogModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        TranslocoModule,
        EmailChangeComponent,
        ProfilePictureUploadComponent,
    ],
    templateUrl: './profile-view.component.html'
})
export class ProfileViewComponent implements OnInit {
  private readonly userApi = inject(UserApiService);
  private readonly authApi = inject(AuthApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly state = signal<State>('loading');
  readonly mode = signal<Mode>('view');
  readonly user = signal<UserDtoOut | null>(null);
  readonly saving = signal(false);
  readonly saveErrorKey = signal<string | null>(null);
  readonly deletionState = signal<'idle' | 'checking' | 'deleting'>('idle');
  readonly deletionErrorKey = signal<string | null>(null);

  readonly editForm = new FormGroup<ProfileEditForm>({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    phoneNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.userApi.getCurrent().subscribe({
      next: (dto) => {
        this.user.set(dto);
        this.state.set('loaded');
      },
      error: () => {
        this.state.set('error');
      },
    });
  }

  startEdit(): void {
    const u = this.user();
    if (!u) return;
    this.editForm.reset({
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      name: u.name ?? '',
      phoneNumber: u.phoneNumber ?? '',
    });
    this.saveErrorKey.set(null);
    this.mode.set('edit');
  }

  cancelEdit(): void {
    this.mode.set('view');
    this.saveErrorKey.set(null);
    this.editForm.enable();
  }

  onUserUpdated(updated: UserDtoOut): void {
    // Profile picture upload completed successfully — refresh the cached
    // user so the avatar header re-renders with the new URL.
    this.user.set(updated);
  }

  saveEdit(): void {
    const u = this.user();
    if (!u || !u.id || !u.userType?.value || !u.accountStatus?.value) {
      // Defensive — BE requires id + userType + accountStatus to PATCH.
      // Without them we can't construct a valid UserDtoIn.
      this.saveErrorKey.set('profile.edit.missing_required');
      return;
    }
    if (this.editForm.invalid || this.saving()) return;

    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.editForm.disable();

    const v = this.editForm.getRawValue();
    // The codegen splits UserType / AccountStatus into separate Out-Value /
    // In enums even though the string members match — cast at the boundary.
    const dto: UserDtoIn = {
      id: u.id,
      userType: u.userType.value as unknown as UserDtoIn['userType'],
      email: u.email,
      accountStatus: u.accountStatus.value as unknown as UserDtoIn['accountStatus'],
      firstName: v.firstName || undefined,
      lastName: v.lastName || undefined,
      name: v.name || undefined,
      phoneNumber: v.phoneNumber || undefined,
    };

    this.userApi.patch(u.id, dto).subscribe({
      next: (updated) => {
        this.user.set(updated);
        this.saving.set(false);
        this.editForm.enable();
        this.mode.set('view');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.editForm.enable();
        this.saveErrorKey.set(this.classifyError(err));
      },
    });
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'profile.edit.invalid_input';
      if (err.status === 403) return 'profile.edit.step_up_required';
      if (err.status === 429) return 'profile.edit.rate_limited';
    }
    return 'profile.edit.failed';
  }

  /**
   * RODO Art 17 account deletion (iter-51, audit P0 #4) — ports legacy's
   * three-step flow: eligibility pre-check → blockers dialog (dead end)
   * OR confirmation dialog → DELETE /users/{id} soft-delete. The
   * eligibility gate is client-side by design (the DELETE endpoint does
   * not re-guard; legacy behaved the same). After a successful delete the
   * session is closed and the user lands on sign-in — sign-out failures
   * are swallowed because the account is already TO_BE_DELETED.
   */
  async deleteAccount(): Promise<void> {
    const u = this.user();
    if (!u?.id || this.deletionState() !== 'idle') return;

    this.deletionState.set('checking');
    this.deletionErrorKey.set(null);

    try {
      const eligibility = await firstValueFrom(this.userApi.checkMyDeletionEligibility());

      if (!eligibility.canSoftDelete) {
        const data: DeleteBlockersDialogData = {
          blockers: eligibility.softDeleteBlockers ?? [],
        };
        this.dialog.open(DeleteBlockersDialogComponent, {
          data,
          width: '520px',
          autoFocus: 'first-tabbable',
        });
        this.deletionState.set('idle');
        return;
      }

      const confirmed = await firstValueFrom(
        this.dialog
          .open<
            DeleteConfirmationDialogComponent,
            void,
            boolean
          >(DeleteConfirmationDialogComponent, { width: '520px', autoFocus: 'first-tabbable' })
          .afterClosed(),
      );
      if (!confirmed) {
        this.deletionState.set('idle');
        return;
      }

      this.deletionState.set('deleting');
      await firstValueFrom(this.userApi.deleteAccount(u.id));

      try {
        await firstValueFrom(this.authApi.signOut());
      } catch {
        // Session may already be invalid — the redirect below still runs.
      }
      void this.router.navigate(['/auth/sign-in']);
    } catch {
      const wasDeleting = this.deletionState() === 'deleting';
      this.deletionState.set('idle');
      this.deletionErrorKey.set(
        wasDeleting ? 'profile.danger.error.failed' : 'profile.danger.error.eligibility_failed',
      );
    }
  }
}
