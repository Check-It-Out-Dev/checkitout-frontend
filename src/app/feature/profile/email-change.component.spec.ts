import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { UserDtoIn } from '../../api/model/user-dto-in';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UserApiService } from '../../core/user/user.service';
import { EmailChangeComponent } from './email-change.component';

const USER: UserDtoOut = {
  id: 42,
  email: 'old@example.com',
  emailVerified: true,
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
};

class FakeUserApi {
  next: () => Observable<UserDtoOut> = () => of(USER);
  lastDto?: UserDtoIn;
  lastStepUpToken?: string;
  patch(_id: number, dto: UserDtoIn, stepUpToken?: string): Observable<UserDtoOut> {
    this.lastDto = dto;
    this.lastStepUpToken = stepUpToken;
    return this.next();
  }
  getCurrent(): Observable<UserDtoOut> {
    return of(USER);
  }
}

interface DialogStub {
  result: Observable<string | null>;
  opened: number;
}

/**
 * Replaces the component's private `dialog` field with a stub. Bypasses DI
 * entirely — Angular Material's MatDialog has heavy overlay/portal deps that
 * are painful to mock; faking the single method the component uses is enough.
 */
function setupDialogSpy(fixture: ComponentFixture<EmailChangeComponent>, stub: DialogStub): void {
  const fake = {
    open: () => {
      stub.opened += 1;
      return {
        afterClosed: () => stub.result,
      } as unknown as MatDialogRef<unknown, string | null>;
    },
  };
  Object.defineProperty(fixture.componentInstance, 'dialog', { value: fake });
}

function create(api: FakeUserApi): ComponentFixture<EmailChangeComponent> {
  TestBed.configureTestingModule({
    imports: [
      EmailChangeComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      { provide: UserApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(EmailChangeComponent);
  fixture.componentRef.setInput('user', USER);
  fixture.detectChanges();
  return fixture;
}

describe('EmailChangeComponent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('starts collapsed and expands on click', () => {
    const fixture = create(new FakeUserApi());

    expect(fixture.componentInstance.expanded()).toBe(false);
    fixture.componentInstance.expand();
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(fixture.componentInstance.phase()).toBe('idle');
  });

  it('rejects same-as-current email without opening the dialog', async () => {
    const fixture = create(new FakeUserApi());
    const stub: DialogStub = { result: of(null), opened: 0 };
    setupDialogSpy(fixture, stub);

    fixture.componentInstance.expand();
    fixture.componentInstance.form.setValue({ email: 'OLD@example.com' });

    await fixture.componentInstance.submit();

    expect(stub.opened).toBe(0);
    expect(fixture.componentInstance.errorKey()).toBe(
      'profile.email_change.errors.same_as_current',
    );
  });

  it('opens dialog, calls PATCH with the step-up token, lands in sent state', async () => {
    const api = new FakeUserApi();
    const fixture = create(api);
    const stub: DialogStub = { result: of('verify-token-99'), opened: 0 };
    setupDialogSpy(fixture, stub);

    fixture.componentInstance.expand();
    fixture.componentInstance.form.setValue({ email: 'new@example.com' });

    await fixture.componentInstance.submit();

    expect(stub.opened).toBe(1);
    expect(api.lastStepUpToken).toBe('verify-token-99');
    expect(api.lastDto?.email).toBe('new@example.com');
    expect(fixture.componentInstance.phase()).toBe('sent');
    expect(fixture.componentInstance.newEmail()).toBe('new@example.com');
  });

  it('returns to idle when the dialog is cancelled', async () => {
    const api = new FakeUserApi();
    const fixture = create(api);
    const stub: DialogStub = { result: of(null), opened: 0 };
    setupDialogSpy(fixture, stub);

    fixture.componentInstance.expand();
    fixture.componentInstance.form.setValue({ email: 'new@example.com' });

    await fixture.componentInstance.submit();

    expect(api.lastStepUpToken).toBeUndefined();
    expect(fixture.componentInstance.phase()).toBe('idle');
  });

  it('classifies HTTP 409 as email_taken', async () => {
    const api = new FakeUserApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 409 }));
    const fixture = create(api);
    const stub: DialogStub = { result: of('tok'), opened: 0 };
    setupDialogSpy(fixture, stub);

    fixture.componentInstance.expand();
    fixture.componentInstance.form.setValue({ email: 'new@example.com' });

    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('profile.email_change.errors.email_taken');
  });

  it('classifies HTTP 401 as step_up_invalid', async () => {
    const api = new FakeUserApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    const fixture = create(api);
    const stub: DialogStub = { result: of('tok'), opened: 0 };
    setupDialogSpy(fixture, stub);

    fixture.componentInstance.expand();
    fixture.componentInstance.form.setValue({ email: 'new@example.com' });

    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.errorKey()).toBe(
      'profile.email_change.errors.step_up_invalid',
    );
  });

  it('cancel collapses without opening the dialog', () => {
    const fixture = create(new FakeUserApi());
    const stub: DialogStub = { result: of(null), opened: 0 };
    setupDialogSpy(fixture, stub);

    fixture.componentInstance.expand();
    fixture.componentInstance.cancel();

    expect(fixture.componentInstance.expanded()).toBe(false);
    expect(stub.opened).toBe(0);
  });
});
