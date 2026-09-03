import { ChangeDetectionStrategy, Component, Inject, Optional, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import type { DeletionBlocker } from '../../api/model/deletion-blocker';

export interface DeleteBlockersDialogData {
  readonly blockers: readonly DeletionBlocker[];
}

/**
 * RODO Art 17 — shown instead of the confirmation when the eligibility
 * pre-check reports `canSoftDelete=false` (iter-51, audit P0 #4). Lists
 * each BE-provided blocker (active campaigns, pending cooperations,
 * last-admin, …) so the user knows exactly what to resolve first. Dead
 * end by design — the only action is "understood", matching legacy.
 * Blocker reason/description arrive pre-localized from the BE dictionary.
 */
@Component({
    selector: 'app-delete-blockers-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslocoModule],
    templateUrl: './delete-blockers-dialog.component.html'
})
export class DeleteBlockersDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<DeleteBlockersDialogComponent, void>>(
    MatDialogRef,
    { optional: true },
  );

  readonly data: DeleteBlockersDialogData;

  constructor(@Optional() @Inject(MAT_DIALOG_DATA) data?: DeleteBlockersDialogData) {
    this.data = data ?? { blockers: [] };
  }

  close(): void {
    this.dialogRef?.close();
  }
}
