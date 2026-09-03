import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import type { CascadeDeletePreview } from '../../api/model/cascade-delete-preview';
import type { CascadeDeleteResult } from '../../api/model/cascade-delete-result';
import { CascadeDeleteApiService } from '../../core/admin/cascade-delete.service';

export interface AdminCascadeDeleteDialogData {
  readonly partnershipOpportunityId: number;
  readonly title?: string;
  readonly companyName?: string;
}

type DialogState = 'loading' | 'preview' | 'deleting' | 'success' | 'partial' | 'error';

/**
 * Admin partnership cascade-delete (legacy
 * `AdminPartnershipDeleteDialogComponent` parity). Two-step protocol:
 * the preview lists every entity type that will be removed + warnings +
 * a one-time confirmationCode; the destructive call echoes the code AND
 * the expected total so a stale preview can never over-delete. Result
 * states mirror legacy: success / partial (some systems failed,
 * retryable server-side) / error.
 */
@Component({
  selector: 'app-admin-cascade-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './admin-cascade-delete-dialog.component.html',
})
export class AdminCascadeDeleteDialogComponent implements OnInit {
  private readonly api = inject(CascadeDeleteApiService);
  private readonly dialogRef = inject(MatDialogRef<AdminCascadeDeleteDialogComponent>);
  readonly data: AdminCascadeDeleteDialogData = inject(MAT_DIALOG_DATA);

  readonly state = signal<DialogState>('loading');
  readonly preview = signal<CascadeDeletePreview | null>(null);
  readonly result = signal<CascadeDeleteResult | null>(null);

  ngOnInit(): void {
    this.api.previewPartnership(this.data.partnershipOpportunityId).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.state.set('preview');
      },
      error: () => this.state.set('error'),
    });
  }

  confirmDelete(): void {
    const p = this.preview();
    if (!p?.confirmationCode || this.state() === 'deleting') return;
    this.state.set('deleting');
    this.api
      .forceDeletePartnership(
        this.data.partnershipOpportunityId,
        p.confirmationCode,
        p.totalEntityCount ?? 0,
      )
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.state.set(result.success ? 'success' : 'partial');
        },
        error: () => this.state.set('error'),
      });
  }

  /** success → close(true) so the caller navigates away from the dead detail. */
  close(): void {
    this.dialogRef.close(this.state() === 'success');
  }
}
