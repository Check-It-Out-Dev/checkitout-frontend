import { provideHttpClient, withXhr } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UserApiService } from '../user/user.service';
import { SessionStateService } from './session-state.service';

const FAKE_USER: UserDtoOut = {
  id: 1,
  email: 'company1@e2e.test',
  firstName: 'Acme',
  lastName: 'Studios',
  userType: 'COMPANY',
} as unknown as UserDtoOut;

class FakeUserApi {
  next: () => Observable<UserDtoOut> = () => of(FAKE_USER);
  calls = 0;
  getCurrent(): Observable<UserDtoOut> {
    this.calls += 1;
    return this.next();
  }
}

function create(api: FakeUserApi = new FakeUserApi()): {
  svc: SessionStateService;
  api: FakeUserApi;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withXhr()), { provide: UserApiService, useValue: api }],
  });
  return { svc: TestBed.inject(SessionStateService), api };
}

describe('SessionStateService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts unauthenticated and unprobed', () => {
    const { svc } = create();
    expect(svc.isAuthenticated()).toBe(false);
    expect(svc.probed()).toBe(false);
    expect(svc.user()).toBeNull();
  });

  it('caches the user from probe() on success', fakeAsync(() => {
    const { svc, api } = create();
    let result: UserDtoOut | null | undefined;
    svc.probe().subscribe((u) => (result = u));
    tick();

    expect(api.calls).toBe(1);
    expect(result).toEqual(FAKE_USER);
    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.probed()).toBe(true);
    expect(svc.user()).toEqual(FAKE_USER);
  }));

  it('treats probe() failure as unauthenticated, never bubbles', fakeAsync(() => {
    const api = new FakeUserApi();
    api.next = () => throwError(() => new Error('401'));
    const { svc } = create(api);

    let result: UserDtoOut | null | undefined;
    let errored = false;
    svc.probe().subscribe({
      next: (u) => (result = u),
      error: () => (errored = true),
    });
    tick();

    expect(errored).toBe(false);
    expect(result).toBeNull();
    expect(svc.isAuthenticated()).toBe(false);
    expect(svc.probed()).toBe(true);
  }));

  it('setUser() seeds the cache without an HTTP roundtrip', () => {
    const { svc, api } = create();
    svc.setUser(FAKE_USER);
    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.user()).toEqual(FAKE_USER);
    expect(api.calls).toBe(0);
  });

  it('clear() resets to unauthenticated but stays probed', () => {
    const { svc } = create();
    svc.setUser(FAKE_USER);
    svc.clear();
    expect(svc.isAuthenticated()).toBe(false);
    expect(svc.user()).toBeNull();
    expect(svc.probed()).toBe(true);
  });

  it('a stale user is replaced when probe() returns 401', fakeAsync(() => {
    const api = new FakeUserApi();
    const { svc } = create(api);
    svc.setUser(FAKE_USER);

    api.next = () => throwError(() => new Error('401'));
    svc.probe().subscribe();
    tick();

    expect(svc.isAuthenticated()).toBe(false);
    expect(svc.user()).toBeNull();
  }));
});
