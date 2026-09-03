import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { StepUpActionType } from '../../api/model/step-up-action-type';
import { StepUpChallengeType } from '../../api/model/step-up-challenge-type';
import type { StepUpCheckResponse } from '../../api/model/step-up-check-response';
import type { StepUpRequestResponse } from '../../core/api-frozen/hidden-models';
import type { StepUpTokenResponse } from '../../api/model/step-up-token-response';
import { StepUpService } from '../../core/step-up/step-up.service';
import {
  StepUpDialogComponent,
  type StepUpDialogData,
  type StepUpDialogResult,
} from '../../shared/components/step-up-dialog/step-up-dialog.component';
import type { SandboxFixture } from '../sandbox-registry';

const DIALOG_REF_STUB = { close: () => undefined } as unknown as MatDialogRef<
  StepUpDialogComponent,
  StepUpDialogResult
>;

class StubStepUpEmail {
  check(): Observable<StepUpCheckResponse> {
    return of({ required: true, challengeType: StepUpChallengeType.EMAIL_CODE });
  }
  request(): Observable<StepUpRequestResponse> {
    return of({
      success: true,
      required: true,
      challengeType: StepUpChallengeType.EMAIL_CODE,
    });
  }
  verify(): Observable<StepUpTokenResponse> {
    return of({ success: true, token: 'fixture-token', expiresInSeconds: 300 });
  }
}

class StubStepUpInvalid {
  check(): Observable<StepUpCheckResponse> {
    return of({ required: true, challengeType: StepUpChallengeType.EMAIL_CODE });
  }
  request(): Observable<StepUpRequestResponse> {
    return of({
      success: true,
      required: true,
      challengeType: StepUpChallengeType.EMAIL_CODE,
    });
  }
  verify(): Observable<StepUpTokenResponse> {
    return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
  }
}

class StubStepUpRequesting {
  check(): Observable<StepUpCheckResponse> {
    return of({ required: true, challengeType: StepUpChallengeType.EMAIL_CODE });
  }
  request(): Observable<StepUpRequestResponse> {
    // Never emits — keeps the dialog in the "sending code" phase for the snapshot.
    return new Observable<StepUpRequestResponse>(() => undefined);
  }
  verify(): Observable<StepUpTokenResponse> {
    return of({ success: true, token: 'fixture-token' });
  }
}

const DATA: StepUpDialogData = {
  action: StepUpActionType.EMAIL_CHANGE,
  email: 'maja@example.com',
};

export const STEP_UP_DIALOG_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'step-up-dialog-awaiting',
    label: 'Step-up dialog · awaiting code (EMAIL_CODE)',
    component: StepUpDialogComponent,
    viewport: { width: 480, height: 360 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
      { provide: StepUpService, useClass: StubStepUpEmail },
    ],
  },
  {
    id: 'step-up-dialog-requesting',
    label: 'Step-up dialog · sending code (spinner)',
    component: StepUpDialogComponent,
    viewport: { width: 480, height: 360 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
      { provide: StepUpService, useClass: StubStepUpRequesting },
    ],
  },
  {
    id: 'step-up-dialog-invalid-code',
    label: 'Step-up dialog · invalid code error',
    component: StepUpDialogComponent,
    viewport: { width: 480, height: 360 },
    providers: [
      { provide: MatDialogRef, useValue: DIALOG_REF_STUB },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
      { provide: StepUpService, useClass: StubStepUpInvalid },
    ],
  },
];
