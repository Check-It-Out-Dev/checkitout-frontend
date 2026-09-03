import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { ConsentProofPayload } from '../../core/api-frozen/hidden-models';
import { SubscriptionWriteApi } from '../../core/subscription/subscription.service';
import {
  TrialConsentDialogComponent,
  type TrialConsentDialogData,
  type TrialConsentResult,
} from './trial-consent-dialog.component';

const DATA: TrialConsentDialogData = {
  documentName: 'Subscription Activation Consent',
  documentHash: 'abc',
};

class FakeWrite {
  consentNext: () => Observable<unknown> = () => of(undefined);
  recordedProof?: ConsentProofPayload;
  recordConsent(payload: ConsentProofPayload): Observable<unknown> {
    this.recordedProof = payload;
    return this.consentNext();
  }
}

class FakeDialogRef {
  closed?: TrialConsentResult;
  close(result?: TrialConsentResult): void {
    this.closed = result ?? null;
  }
}

function create(
  write: FakeWrite,
  ref: FakeDialogRef,
): ComponentFixture<TrialConsentDialogComponent> {
  TestBed.configureTestingModule({
    imports: [
      TrialConsentDialogComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      { provide: SubscriptionWriteApi, useValue: write },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: DATA },
    ],
  });
  const fixture = TestBed.createComponent(TrialConsentDialogComponent);
  fixture.detectChanges();
  return fixture;
}

function fakeClick(): MouseEvent {
  return { isTrusted: true, clientX: 33, clientY: 44 } as MouseEvent;
}

// iter-50 P0 #3 — GDPR consent capture before trial activation. The dialog
// must POST /subscription/consent successfully BEFORE closing accepted; the
// caller only fires the trial POST after that.
describe('TrialConsentDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not record consent when the checkbox is unchecked', async () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    const spy = jest.spyOn(write, 'recordConsent');

    await fixture.componentInstance.confirm(fakeClick());

    expect(spy).not.toHaveBeenCalled();
    expect(ref.closed).toBeUndefined();
  });

  it('records the GDPR proof bundle then closes accepted', async () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm(fakeClick());

    expect(write.recordedProof).toMatchObject({
      isTrusted: true,
      screenX: 33,
      screenY: 44,
      checkboxId: 'trial-consent-checkbox',
      documentName: DATA.documentName,
      documentHash: DATA.documentHash,
      categories: { subscription_activation: true },
    });
    expect(write.recordedProof?.timestamp).toBeTruthy();
    expect(ref.closed).toEqual({ accepted: true });
  });

  it('stays open with an error key when consent recording fails', async () => {
    const write = new FakeWrite();
    write.consentNext = () => throwError(() => new HttpErrorResponse({ status: 400 }));
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm(fakeClick());

    expect(ref.closed).toBeUndefined();
    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe(
      'plan_billing.trial.consent.errors.invalid_input',
    );
  });

  it('maps 429 to the rate-limited error key', async () => {
    const write = new FakeWrite();
    write.consentNext = () => throwError(() => new HttpErrorResponse({ status: 429 }));
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm(fakeClick());

    expect(fixture.componentInstance.errorKey()).toBe(
      'plan_billing.trial.consent.errors.rate_limited',
    );
  });

  it('cancel closes with null and never records consent', () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    const spy = jest.spyOn(write, 'recordConsent');

    fixture.componentInstance.cancel();

    expect(spy).not.toHaveBeenCalled();
    expect(ref.closed).toBeNull();
  });
});
