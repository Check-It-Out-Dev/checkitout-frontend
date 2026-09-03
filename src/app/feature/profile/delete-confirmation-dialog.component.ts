import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';

/**
 * RODO Art 17 — final confirmation before soft-deleting the account
 * (iter-51, audit P0 #4). Mirrors legacy's DeleteConfirmationDialog:
 * a consequences list + a single warn-colored confirm. No password,
 * no typed-confirm, no step-up — the BE endpoint is isAuthenticated-only
 * and legacy asked for nothing more; parity keeps the friction identical.
 *
 * Returns `true` (delete) / `false` (cancel) via the dialog result.
 * MatDialogRef is optional so the sandbox can render the component bare.
 */
@Component({
    selector: 'app-delete-confirmation-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslocoModule],
    templateUrl: './delete-confirmation-dialog.component.html'
})
export class DeleteConfirmationDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<DeleteConfirmationDialogComponent, boolean>>(
    MatDialogRef,
    { optional: true },
  );

  cancel(): void {
    this.dialogRef?.close(false);
  }

  confirm(): void {
    this.dialogRef?.close(true);
  }
}
