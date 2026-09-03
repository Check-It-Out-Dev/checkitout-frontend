import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import {
  SubscriptionWriteApi,
  UpgradeRequestDtoInTargetPlanEnum,
} from '../../core/subscription/subscription.service';
import {
  UpgradeConfirmDialogComponent,
  type UpgradeConfirmDialogData,
  type UpgradeConfirmResult,
} from './upgrade-confirm-dialog.component';

const DATA: UpgradeConfirmDialogData = {
  targetPlan: UpgradeRequestDtoInTargetPlanEnum.BUSINESS,
  priceDisplay: '29 PLN / mo',
  documentName: 'Subscription Terms v1',
  documentHash: 'abc',
};

class FakeWrite {
  consentNext: () => Observable<unknown> = () => of(undefined);
  upgradeNext: () => Observable<{ sessionUrl: string }> = () =>
    of({ sessionUrl: 'https://stripe.example/cs_test' });
  recordedProof?: unknown;
  recordConsent(payload: unknown): Observable<unknown> {
    this.recordedProof = payload;
    return this.consentNext();
  }
  initiateUpgrade(): Observable<{ sessionUrl: string }> {
    return this.upgradeNext();
  }
}

class FakeDialogRef {
  closed?: UpgradeConfirmResult;
  close(result?: UpgradeConfirmResult): void {
    this.closed = result ?? null;
  }
}

function create(
  write: FakeWrite,
  ref: FakeDialogRef,
): ComponentFixture<UpgradeConfirmDialogComponent> {
  TestBed.configureTestingModule({
    imports: [
      UpgradeConfirmDialogComponent,
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
  const fixture = TestBed.createComponent(UpgradeConfirmDialogComponent);
  fixture.detectChanges();
  return fixture;
}

function fakeClick(): MouseEvent {
  return { isTrusted: true, clientX: 120, clientY: 240 } as MouseEvent;
}

describe('UpgradeConfirmDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not call BE when checkbox is unchecked', async () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    const consentSpy = jest.spyOn(write, 'recordConsent');

    await fixture.componentInstance.confirm(fakeClick());

    expect(consentSpy).not.toHaveBeenCalled();
    expect(ref.closed).toBeUndefined();
  });

  it('captures click coordinates + isTrusted in the proof bundle', async () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm({
      isTrusted: true,
      clientX: 42,
      clientY: 84,
    } as MouseEvent);

    expect(write.recordedProof).toMatchObject({
      isTrusted: true,
      screenX: 42,
      screenY: 84,
      documentHash: 'abc',
      documentName: 'Subscription Terms v1',
      categories: { subscription_terms: true },
    });
  });

  it('closes with sessionUrl on full success', async () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm(fakeClick());

    expect(ref.closed).toEqual({ sessionUrl: 'https://stripe.example/cs_test' });
  });

  it('lands in error state when consent record fails', async () => {
    const write = new FakeWrite();
    write.consentNext = () => throwError(() => new HttpErrorResponse({ status: 400 }));
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm(fakeClick());

    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('plan_billing.upgrade.errors.invalid_input');
    expect(ref.closed).toBeUndefined();
  });

  it('classifies HTTP 409 from initiateUpgrade as conflict', async () => {
    const write = new FakeWrite();
    write.upgradeNext = () => throwError(() => new HttpErrorResponse({ status: 409 }));
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm(fakeClick());

    expect(fixture.componentInstance.errorKey()).toBe('plan_billing.upgrade.errors.conflict');
  });

  it('shows no_session error when BE returns 200 without sessionUrl', async () => {
    const write = new FakeWrite();
    write.upgradeNext = () => of({} as { sessionUrl: string });
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);
    fixture.componentInstance.accepted.setValue(true);

    await fixture.componentInstance.confirm(fakeClick());

    expect(fixture.componentInstance.errorKey()).toBe('plan_billing.upgrade.errors.no_session');
  });

  it('cancel closes with null', () => {
    const fixture = create(new FakeWrite(), new FakeDialogRef());
    const ref = TestBed.inject(MatDialogRef) as unknown as FakeDialogRef;
    fixture.componentInstance.cancel();

    expect(ref.closed).toBeNull();
  });
});
