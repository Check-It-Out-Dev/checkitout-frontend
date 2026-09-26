import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  RejectApplicantDialogComponent,
  type RejectApplicantDialogData,
} from '../../feature/opportunities/reject-applicant-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

const REF_STUB = { close: () => undefined };

const DATA: RejectApplicantDialogData = { influencerName: 'Ola Kowalska' };

export const REJECT_APPLICANT_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'reject-applicant-dialog',
    label: 'Campaign applicants · reject confirmation',
    component: RejectApplicantDialogComponent,
    frame: 'dialog',
    viewport: { width: 520, height: 360 },
    providers: [
      { provide: MatDialogRef, useValue: REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
    ],
  },
];
