import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';

export interface RejectApplicantDialogData {
  /** Who is about to be turned down — shown in the body so the click is deliberate. */
  readonly influencerName: string;
}

/**
 * "Odrzucić aplikację?" — the one confirmation step before a company
 * rejects an applicant. Rejecting used to happen on a single click with no
 * undo, next to the accept button. Same shape as the account-deletion
 * confirmation: consequence line + a single warn-coloured confirm.
 *
 * Returns `true` (reject) / `false` (keep) via the dialog result.
 * MatDialogRef / MAT_DIALOG_DATA are optional so the sandbox can render it bare.
 */
@Component({
  selector: 'app-reject-applicant-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslocoModule],
  templateUrl: './reject-applicant-dialog.component.html',
})
export class RejectApplicantDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<RejectApplicantDialogComponent, boolean>>(
    MatDialogRef,
    { optional: true },
  );
  readonly data = inject<RejectApplicantDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  cancel(): void {
    this.dialogRef?.close(false);
  }

  confirm(): void {
    this.dialogRef?.close(true);
  }
}
