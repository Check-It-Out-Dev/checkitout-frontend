import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { DeletionBlocker } from '../../api/model/deletion-blocker';
import {
  DeleteBlockersDialogComponent,
  type DeleteBlockersDialogData,
} from '../../feature/profile/delete-blockers-dialog.component';
import { DeleteConfirmationDialogComponent } from '../../feature/profile/delete-confirmation-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

const CONFIRM_REF_STUB = { close: () => undefined } as unknown as MatDialogRef<
  DeleteConfirmationDialogComponent,
  boolean
>;
const BLOCKERS_REF_STUB = { close: () => undefined } as unknown as MatDialogRef<
  DeleteBlockersDialogComponent,
  void
>;

const BLOCKERS: DeletionBlocker[] = [
  {
    category: 'ACTIVE_OPPORTUNITIES' as never,
    reason: 'Active cooperations',
    description:
      'You have cooperations that are still in progress. Finish or cancel them before deleting the account.',
    count: 2,
    entityType: 'AppliedOpportunity',
    entityDescription: 'Coffee shop opening, Spring sneaker drop',
  },
  {
    category: 'ACTIVE_PARTNERSHIP_OPPORTUNITIES' as never,
    reason: 'Published campaigns',
    description: 'Your company still has live campaigns accepting applications.',
    count: 1,
    entityType: 'PartnershipOpportunity',
    entityDescription: 'Skincare line launch',
  },
];

const BLOCKERS_DATA: DeleteBlockersDialogData = { blockers: BLOCKERS };

export const ACCOUNT_DELETION_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'delete-confirmation-dialog',
    label: 'Account deletion · RODO confirmation (iter-51 P0 #4)',
    component: DeleteConfirmationDialogComponent,
    viewport: { width: 560, height: 520 },
    providers: [{ provide: MatDialogRef, useValue: CONFIRM_REF_STUB }],
  },
  {
    id: 'delete-blockers-dialog',
    label: 'Account deletion · blockers list (iter-51 P0 #4)',
    component: DeleteBlockersDialogComponent,
    viewport: { width: 560, height: 560 },
    providers: [
      { provide: MatDialogRef, useValue: BLOCKERS_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: BLOCKERS_DATA },
    ],
  },
];
