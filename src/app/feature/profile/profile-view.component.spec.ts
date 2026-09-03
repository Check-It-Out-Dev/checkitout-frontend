import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { DeletionEligibilityDto } from '../../api/model/deletion-eligibility-dto';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { UserApiService } from '../../core/user/user.service';
import { ProfileViewComponent } from './profile-view.component';

const SAMPLE: UserDtoOut = {
  id: 42,
  email: 'user@example.com',
  firstName: 'Maja',
  lastName: 'Kowalska',
  name: 'Maja Kowalska',
  phoneNumber: '+48 123 456 789',
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
};

class FakeUserApi {
  next: () => Observable<UserDtoOut> = () => of({ ...SAMPLE });
  patchNext: (id: number, dto: unknown) => Observable<UserDtoOut> = (_id, dto) =>
    of({ ...SAMPLE, ...(dto as Partial<UserDtoOut>) });
  eligibilityNext: () => Observable<DeletionEligibilityDto> = () =>
    of({ canSoftDelete: true, softDeleteBlockers: [] });
  deleteNext: () => Observable<void> = () => of(undefined);
  deleteCalls: number[] = [];
  getCurrent(): Observable<UserDtoOut> {
    return this.next();
  }
  patch(id: number, dto: unknown): Observable<UserDtoOut> {
    return this.patchNext(id, dto);
  }
  checkMyDeletionEligibility(): Observable<DeletionEligibilityDto> {
    return this.eligibilityNext();
  }
  deleteAccount(id: number): Observable<void> {
    this.deleteCalls.push(id);
    return this.deleteNext();
  }
}

class FakeAuthApi {
  signOutCalls = 0;
  signOut(): Observable<unknown> {
    this.signOutCalls += 1;
    return of({ success: true });
  }
}

function create(
  api: FakeUserApi,
  auth: FakeAuthApi = new FakeAuthApi(),
): ComponentFixture<ProfileViewComponent> {
  TestBed.configureTestingModule({
    imports: [
      ProfileViewComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: UserApiService, useValue: api },
      { provide: AuthApiService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(ProfileViewComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ProfileViewComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('flips to loaded on success and exposes the user', fakeAsync(() => {
    const api = new FakeUserApi();
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.user()?.email).toBe('user@example.com');
  }));

  it('flips to error on BE failure', fakeAsync(() => {
    const api = new FakeUserApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.user()).toBeNull();
  }));

  it('retries when load() is called again', fakeAsync(() => {
    const api = new FakeUserApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
    api.next = () => of({ ...SAMPLE });
    fixture.componentInstance.load();
    tick();
    expect(fixture.componentInstance.state()).toBe('loaded');
  }));

  describe('edit mode', () => {
    it('startEdit pre-populates the form from the loaded user', fakeAsync(() => {
      const api = new FakeUserApi();
      const fixture = create(api);
      tick();
      fixture.componentInstance.startEdit();
      expect(fixture.componentInstance.mode()).toBe('edit');
      expect(fixture.componentInstance.editForm.value.firstName).toBe('Maja');
      expect(fixture.componentInstance.editForm.value.phoneNumber).toBe('+48 123 456 789');
    }));

    it('cancelEdit returns to view mode without saving', fakeAsync(() => {
      const api = new FakeUserApi();
      const fixture = create(api);
      tick();
      fixture.componentInstance.startEdit();
      fixture.componentInstance.editForm.controls.firstName.setValue('Anna');
      fixture.componentInstance.cancelEdit();
      expect(fixture.componentInstance.mode()).toBe('view');
      expect(fixture.componentInstance.user()?.firstName).toBe('Maja');
    }));

    it('saveEdit patches and updates the loaded user', fakeAsync(() => {
      const api = new FakeUserApi();
      const fixture = create(api);
      tick();
      fixture.componentInstance.startEdit();
      fixture.componentInstance.editForm.controls.firstName.setValue('Anna');
      fixture.componentInstance.saveEdit();
      tick();
      expect(fixture.componentInstance.mode()).toBe('view');
      expect(fixture.componentInstance.user()?.firstName).toBe('Anna');
      expect(fixture.componentInstance.saving()).toBe(false);
    }));

    it('saveEdit classifies 403 as step_up_required', fakeAsync(() => {
      const api = new FakeUserApi();
      api.patchNext = () => throwError(() => new HttpErrorResponse({ status: 403 }));
      const fixture = create(api);
      tick();
      fixture.componentInstance.startEdit();
      fixture.componentInstance.saveEdit();
      tick();
      expect(fixture.componentInstance.saveErrorKey()).toBe('profile.edit.step_up_required');
      expect(fixture.componentInstance.mode()).toBe('edit');
    }));

    it('saveEdit refuses when required loaded fields are missing', fakeAsync(() => {
      const api = new FakeUserApi();
      // Force a load with no userType — defensive guard should fire.
      api.next = () => of({ id: 42, email: 'a@b.c' });
      const fixture = create(api);
      tick();
      fixture.componentInstance.startEdit();
      const spy = jest.spyOn(api, 'patch');
      fixture.componentInstance.saveEdit();
      expect(spy).not.toHaveBeenCalled();
      expect(fixture.componentInstance.saveErrorKey()).toBe('profile.edit.missing_required');
    }));
  });

  // Iter-51 P0 #4 — RODO Art 17 deletion: eligibility pre-check branches to
  // the blockers dialog (dead end) or the confirmation dialog; only a
  // confirmed dialog fires DELETE /users/{id}, then sign-out + redirect.
  describe('account deletion (iter-51 P0 #4)', () => {
    interface OpenedDialog {
      component: unknown;
      confirmResult: boolean | undefined;
    }

    function stubDialog(
      fixture: ComponentFixture<ProfileViewComponent>,
      confirmResult: boolean | undefined,
    ): OpenedDialog[] {
      const opened: OpenedDialog[] = [];
      Object.defineProperty(fixture.componentInstance, 'dialog', {
        value: {
          open: (component: unknown) => {
            opened.push({ component, confirmResult });
            return { afterClosed: () => of(confirmResult) };
          },
        },
      });
      return opened;
    }

    it('confirmed deletion soft-deletes, signs out and redirects to sign-in', async () => {
      const api = new FakeUserApi();
      const auth = new FakeAuthApi();
      const fixture = create(api, auth);
      const router = TestBed.inject(Router);
      const nav = jest.spyOn(router, 'navigate').mockResolvedValue(true);
      const opened = stubDialog(fixture, true);

      await fixture.componentInstance.deleteAccount();

      expect(opened).toHaveLength(1);
      expect(api.deleteCalls).toEqual([42]);
      expect(auth.signOutCalls).toBe(1);
      expect(nav).toHaveBeenCalledWith(['/auth/sign-in']);
    });

    it('blocked account opens the blockers dialog and never deletes', async () => {
      const api = new FakeUserApi();
      api.eligibilityNext = () =>
        of({
          canSoftDelete: false,
          softDeleteBlockers: [{ reason: 'Active cooperations', count: 2 }],
        });
      const fixture = create(api);
      const opened = stubDialog(fixture, true);

      await fixture.componentInstance.deleteAccount();

      expect(opened).toHaveLength(1);
      expect(api.deleteCalls).toEqual([]);
      expect(fixture.componentInstance.deletionState()).toBe('idle');
    });

    it('declined confirmation aborts without deleting', async () => {
      const api = new FakeUserApi();
      const auth = new FakeAuthApi();
      const fixture = create(api, auth);
      stubDialog(fixture, false);

      await fixture.componentInstance.deleteAccount();

      expect(api.deleteCalls).toEqual([]);
      expect(auth.signOutCalls).toBe(0);
      expect(fixture.componentInstance.deletionState()).toBe('idle');
    });

    it('eligibility failure surfaces the eligibility error key', async () => {
      const api = new FakeUserApi();
      api.eligibilityNext = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      const fixture = create(api);
      stubDialog(fixture, true);

      await fixture.componentInstance.deleteAccount();

      expect(fixture.componentInstance.deletionErrorKey()).toBe(
        'profile.danger.error.eligibility_failed',
      );
      expect(fixture.componentInstance.deletionState()).toBe('idle');
    });

    it('delete failure surfaces the failed error key and stays signed in', async () => {
      const api = new FakeUserApi();
      api.deleteNext = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      const auth = new FakeAuthApi();
      const fixture = create(api, auth);
      stubDialog(fixture, true);

      await fixture.componentInstance.deleteAccount();

      expect(fixture.componentInstance.deletionErrorKey()).toBe('profile.danger.error.failed');
      expect(auth.signOutCalls).toBe(0);
      expect(fixture.componentInstance.deletionState()).toBe('idle');
    });

    it('sign-out failure still redirects — the account is already deleted', async () => {
      const api = new FakeUserApi();
      const auth = new FakeAuthApi();
      auth.signOut = () => {
        auth.signOutCalls += 1;
        return throwError(() => new HttpErrorResponse({ status: 401 }));
      };
      const fixture = create(api, auth);
      const router = TestBed.inject(Router);
      const nav = jest.spyOn(router, 'navigate').mockResolvedValue(true);
      stubDialog(fixture, true);

      await fixture.componentInstance.deleteAccount();

      expect(api.deleteCalls).toEqual([42]);
      expect(nav).toHaveBeenCalledWith(['/auth/sign-in']);
    });
  });
});
