import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import { StepUpActionType } from '../../../api/model/step-up-action-type';
import { StepUpChallengeType } from '../../../api/model/step-up-challenge-type';
import type { StepUpRequestResponse } from '../../../core/api-frozen/hidden-models';
import type { StepUpTokenResponse } from '../../../api/model/step-up-token-response';
import { StepUpService } from '../../../core/step-up/step-up.service';
import {
  StepUpDialogComponent,
  type StepUpDialogData,
  type StepUpDialogResult,
} from './step-up-dialog.component';

class FakeStepUp {
  request: () => Observable<StepUpRequestResponse> = () =>
    of({ success: true, required: true, challengeType: StepUpChallengeType.EMAIL_CODE });
  verify: () => Observable<StepUpTokenResponse> = () =>
    of({ success: true, token: 'abc-token', expiresInSeconds: 300 });
}

class FakeDialogRef {
  closed?: StepUpDialogResult;
  close(result?: StepUpDialogResult): void {
    this.closed = result ?? null;
  }
}

const DATA: StepUpDialogData = {
  action: StepUpActionType.EMAIL_CHANGE,
  email: 'user@example.com',
};

function create(
  api: FakeStepUp,
  dialogRef: FakeDialogRef,
): ComponentFixture<StepUpDialogComponent> {
  TestBed.configureTestingModule({
    imports: [
      StepUpDialogComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      { provide: StepUpService, useValue: api },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
    ],
  });
  const fixture = TestBed.createComponent(StepUpDialogComponent);
  fixture.detectChanges();
  return fixture;
}

describe('StepUpDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts in awaiting_code phase after request resolves', fakeAsync(() => {
    const api = new FakeStepUp();
    const ref = new FakeDialogRef();
    const fixture = create(api, ref);
    tick();

    expect(fixture.componentInstance.phase()).toBe('awaiting_code');
    expect(fixture.componentInstance.challengeType()).toBe('EMAIL_CODE');
    expect(ref.closed).toBeUndefined();
  }));

  it('closes immediately with null when BE says step-up not required', fakeAsync(() => {
    const api = new FakeStepUp();
    api.request = () => of({ success: true, required: false });
    const ref = new FakeDialogRef();
    create(api, ref);
    tick();

    expect(ref.closed).toBeNull();
  }));

  it('rejects an empty / non-numeric code', fakeAsync(() => {
    const api = new FakeStepUp();
    const verifySpy = jest.spyOn(api, 'verify');
    const ref = new FakeDialogRef();
    const fixture = create(api, ref);
    tick();

    fixture.componentInstance.codeControl.setValue('not-a-code');
    fixture.componentInstance.verify();
    tick();

    expect(verifySpy).not.toHaveBeenCalled();
    expect(ref.closed).toBeUndefined();
  }));

  it('closes with the token on a successful verify', fakeAsync(() => {
    const api = new FakeStepUp();
    const ref = new FakeDialogRef();
    const fixture = create(api, ref);
    tick();

    fixture.componentInstance.codeControl.setValue('123456');
    fixture.componentInstance.verify();
    tick();

    expect(ref.closed).toBe('abc-token');
  }));

  it('shows invalid_code on a 401 from verify and clears the input', fakeAsync(() => {
    const api = new FakeStepUp();
    api.verify = () =>
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
    const ref = new FakeDialogRef();
    const fixture = create(api, ref);
    tick();

    fixture.componentInstance.codeControl.setValue('999999');
    fixture.componentInstance.verify();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('step_up.dialog.errors.invalid_code');
    expect(fixture.componentInstance.codeControl.value).toBe('');
    expect(fixture.componentInstance.phase()).toBe('awaiting_code');
    expect(ref.closed).toBeUndefined();
  }));

  it('hands the caret back to the emptied field after a refused code', fakeAsync(() => {
    const api = new FakeStepUp();
    api.verify = () =>
      throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
    const fixture = create(api, new FakeDialogRef());
    tick();
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="step-up-code-input"]',
    )!;
    input.blur();

    fixture.componentInstance.codeControl.setValue('999999');
    fixture.componentInstance.verify();
    tick();
    fixture.detectChanges();
    tick(); // the focus call waits for the re-render

    expect(document.activeElement).toBe(input);
  }));

  it('classifies 429 as rate_limited', fakeAsync(() => {
    const api = new FakeStepUp();
    api.verify = () => throwError(() => new HttpErrorResponse({ status: 429 }));
    const ref = new FakeDialogRef();
    const fixture = create(api, ref);
    tick();

    fixture.componentInstance.codeControl.setValue('123456');
    fixture.componentInstance.verify();
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('step_up.dialog.errors.rate_limited');
  }));

  it('cancel closes with null', () => {
    const api = new FakeStepUp();
    const ref = new FakeDialogRef();
    const fixture = create(api, ref);
    fixture.componentInstance.cancel();

    expect(ref.closed).toBeNull();
  });

  it('shows send_failed when request fails', fakeAsync(() => {
    const api = new FakeStepUp();
    api.request = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const ref = new FakeDialogRef();
    const fixture = create(api, ref);
    tick();

    expect(fixture.componentInstance.errorKey()).toBe('step_up.dialog.errors.send_failed');
    expect(fixture.componentInstance.phase()).toBe('awaiting_code');
  }));
});
