import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { SubscriptionWriteApi } from '../../core/subscription/subscription.service';
import {
  TrialConsentDialogComponent,
  type TrialConsentDialogData,
  type TrialConsentResult,
} from '../../feature/plan-billing/trial-consent-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

const DIALOG_REF_STUB = { close: () => undefined } as unknown as MatDialogRef<
  TrialConsentDialogComponent,
  TrialConsentResult
>;

class StubConsentOk {
  recordConsent(): Observable<unknown> {
    return of(undefined);
  }
}

const DATA: TrialConsentDialogData = {
  documentName: 'Subscription Activation Consent',
  documentHash: 'fixture-hash',
};

export const TRIAL_CONSENT_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'trial-consent-dialog',
    label: 'Trial consent · Art 16(m) clickwrap before activateTrial (iter-50 P0 #3)',
    component: TrialConsentDialogComponent,
    viewport: { width: 520, height: 480 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
      { provide: SubscriptionWriteApi, useClass: StubConsentOk },
    ],
  },
];
