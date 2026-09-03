import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import type { UserDtoIn } from '../../api/model/user-dto-in';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UploadService } from '../../core/upload/upload.service';
import { UserApiService } from '../../core/user/user.service';

type Phase = 'idle' | 'uploading' | 'patching' | 'success' | 'error';

/**
 * Profile picture upload control. Handles the full BE flow:
 *   1. POST /upload/signed-url → get signed PUT URL + public URL
 *   2. PUT raw file bytes to the signed URL (Firebase Storage)
 *   3. POST /upload/confirm/{uploadId} → register file server-side
 *   4. PATCH /users/{id} → set `profilePicture` to the tracked uploadId;
 *      the BE resolves it to an own-bucket URL server-side (pentest 3.1 —
 *      the client never chooses the stored URL).
 *
 * Limits: image/{jpeg,jpg,png,gif,webp}, max 5 MB. Anything else is
 * rejected client-side before hitting the BE.
 */
@Component({
  selector: 'app-profile-picture-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslocoModule],
  templateUrl: './profile-picture-upload.component.html',
})
export class ProfilePictureUploadComponent {
  @Input({ required: true }) user!: UserDtoOut;
  @Output() readonly updated = new EventEmitter<UserDtoOut>();

  private readonly upload = inject(UploadService);
  private readonly userApi = inject(UserApiService);

  readonly phase = signal<Phase>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly currentUrl = signal<string | null>(null);

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset the native input so the same filename can be re-selected.
    input.value = '';
    if (!file) return;

    this.errorKey.set(null);
    this.phase.set('uploading');

    try {
      const result = await firstValueFrom(this.upload.uploadProfilePhoto(file));
      this.phase.set('patching');
      const updated = await this.applyToUser(result.uploadId, result.publicUrl);
      this.currentUrl.set(updated.profilePicture ?? null);
      this.phase.set('success');
      this.updated.emit(updated);
    } catch (err: unknown) {
      this.phase.set('error');
      this.errorKey.set(this.classifyError(err));
    }
  }

  private async applyToUser(uploadId: string, expectedUrl: string): Promise<UserDtoOut> {
    const u = this.user;
    if (!u.id) {
      throw new Error('upload.errors.missing_required');
    }
    // Sparse PATCH — ONLY the changing key. The BE endpoint takes a strict
    // allowlisted map: extra keys like `id` are rejected outright (400), and
    // a carried-along `email` engages the step-up gate. The value is the
    // tracked uploadId, not a URL — the BE resolves + own-bucket-checks it
    // and stores its own canonical URL.
    const dto = { profilePicture: uploadId } as UserDtoIn;
    try {
      return await firstValueFrom(this.userApi.patch(u.id, dto));
    } catch (err: unknown) {
      // The PATCH may have committed even though its response never made it
      // back (timeout, proxy 5xx, dropped connection). Before telling the
      // user it failed, ask the BE how things stand: if /users/me already
      // carries the freshly uploaded file's canonical URL, the save landed
      // and the error was transport noise. A 4xx is a definitive rejection
      // — no probe, fail immediately.
      if (this.isTransportAmbiguous(err)) {
        const me = await firstValueFrom(this.userApi.getCurrent()).catch(() => null);
        if (me?.profilePicture === expectedUrl) {
          return me;
        }
      }
      throw err;
    }
  }

  private isTransportAmbiguous(err: unknown): boolean {
    return err instanceof HttpErrorResponse && (err.status === 0 || err.status >= 500);
  }

  private classifyError(err: unknown): string {
    if (err instanceof Error && err.message.startsWith('upload.errors.')) {
      return err.message;
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'upload.errors.invalid_input';
      if (err.status === 413) return 'upload.errors.too_large';
      if (err.status === 415) return 'upload.errors.invalid_type';
      if (err.status === 429) return 'upload.errors.rate_limited';
    }
    return 'upload.errors.failed';
  }
}
