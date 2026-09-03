import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import type { CascadeDeletePreview } from '../../api/model/cascade-delete-preview';
import type { CascadeDeleteResult } from '../../api/model/cascade-delete-result';
import { CascadeDeleteApiService } from '../../core/admin/cascade-delete.service';
import { AdminCascadeDeleteDialogComponent } from '../../feature/opportunities/admin-cascade-delete-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

/** Admin partnership cascade-delete dialog — preview state (the decision
 * surface: entity breakdown + warning + irreversible note). */

const PREVIEW: CascadeDeletePreview = {
  totalEntityCount: 14,
  confirmationCode: 'sandbox-code',
  entityBreakdown: [
    { entityType: 'APPLIED_OPPORTUNITY', count: 5, description: 'Zgłoszenia' },
    { entityType: 'CONTENT', count: 8, description: 'Treści' },
    { entityType: 'ADDRESS', count: 1, description: 'Adres kampanii' },
  ],
  warnings: ['2 zgłoszenia są w trakcie realizacji'],
};

class StubCascadePreview {
  previewPartnership(): Observable<CascadeDeletePreview> {
    return of(PREVIEW);
  }
  forceDeletePartnership(): Observable<CascadeDeleteResult> {
    return new Observable<CascadeDeleteResult>(() => undefined);
  }
}

class StubDialogRef {
  close(): void {
    /* no-op */
  }
}

export const ADMIN_CASCADE_DELETE_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'admin-cascade-delete-preview',
    label: 'Admin cascade delete · preview with entity breakdown + warning',
    component: AdminCascadeDeleteDialogComponent,
    providers: [
      { provide: CascadeDeleteApiService, useClass: StubCascadePreview },
      { provide: MatDialogRef, useClass: StubDialogRef },
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          partnershipOpportunityId: 1,
          title: 'Spring sneaker drop — long-form review',
          companyName: 'Acme Athletic',
        },
      },
    ],
  },
];
