import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import {
  DowngradeRequestDtoInTargetPlanEnum,
  SubscriptionWriteApi,
} from '../../core/subscription/subscription.service';
import {
  DowngradeConfirmDialogComponent,
  type DowngradeConfirmDialogData,
  type DowngradeConfirmResult,
} from './downgrade-confirm-dialog.component';

const DATA: DowngradeConfirmDialogData = {
  targetPlan: DowngradeRequestDtoInTargetPlanEnum.FREE,
  currentPlanName: 'Business',
  billingPeriodEnd: '2026-06-01T00:00:00Z',
};

class FakeWrite {
  next: () => Observable<unknown> = () => of(undefined);
  calls = 0;
  requestDowngrade(): Observable<unknown> {
    this.calls += 1;
    return this.next();
  }
}

class FakeDialogRef {
  closed?: DowngradeConfirmResult;
  close(result?: DowngradeConfirmResult): void {
    this.closed = result ?? null;
  }
}

function create(
  write: FakeWrite,
  ref: FakeDialogRef,
): ComponentFixture<DowngradeConfirmDialogComponent> {
  TestBed.configureTestingModule({
    imports: [
      DowngradeConfirmDialogComponent,
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
  const fixture = TestBed.createComponent(DowngradeConfirmDialogComponent);
  fixture.detectChanges();
  return fixture;
}

describe('DowngradeConfirmDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('cancel closes with null without calling BE', () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);

    fixture.componentInstance.cancel();

    expect(ref.closed).toBeNull();
    expect(write.calls).toBe(0);
  });

  it('confirm closes with "confirmed" on success', async () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);

    await fixture.componentInstance.confirm();

    expect(write.calls).toBe(1);
    expect(ref.closed).toBe('confirmed');
  });

  it('classifies HTTP 409 as conflict', async () => {
    const write = new FakeWrite();
    write.next = () => throwError(() => new HttpErrorResponse({ status: 409 }));
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);

    await fixture.componentInstance.confirm();

    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('plan_billing.downgrade.errors.conflict');
    expect(ref.closed).toBeUndefined();
  });

  it('does not double-submit while in flight', async () => {
    const write = new FakeWrite();
    const ref = new FakeDialogRef();
    const fixture = create(write, ref);

    const first = fixture.componentInstance.confirm();
    await fixture.componentInstance.confirm();
    await first;

    expect(write.calls).toBe(1);
  });
});
