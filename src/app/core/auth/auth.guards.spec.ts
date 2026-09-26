import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, of } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { adminGuard, authGuard, noAuthGuard } from './auth.guards';
import { SessionStateService } from './session-state.service';

const FAKE_ROUTE = {} as ActivatedRouteSnapshot;
const FAKE_STATE = { url: '/' } as RouterStateSnapshot;

const FAKE_USER: UserDtoOut = {
  id: 1,
  email: 'company1@e2e.test',
  firstName: 'Acme',
  lastName: 'Studios',
  userType: 'COMPANY',
} as unknown as UserDtoOut;

class FakeSession {
  private _user: UserDtoOut | null = null;
  private _probed = false;
  probeReturn: UserDtoOut | null = FAKE_USER;
  probed = () => this._probed;
  isAuthenticated = () => this._user !== null;
  user = () => this._user;
  setUser(u: UserDtoOut) {
    this._user = u;
    this._probed = true;
  }
  clear() {
    this._user = null;
    this._probed = true;
  }
  probe(): Observable<UserDtoOut | null> {
    return new Observable((sub) => {
      // Simulate async resolution via microtask.
      Promise.resolve().then(() => {
        this._user = this.probeReturn;
        this._probed = true;
        sub.next(this.probeReturn);
        sub.complete();
      });
    });
  }
}

function runGuardSync(
  guard: typeof authGuard | typeof noAuthGuard,
): boolean | UrlTree | Observable<true | UrlTree> {
  return TestBed.runInInjectionContext(() => guard(FAKE_ROUTE, FAKE_STATE)) as
    | boolean
    | UrlTree
    | Observable<true | UrlTree>;
}

function configureWith(session: FakeSession) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SessionStateService, useValue: session }],
  });
}

describe('authGuard', () => {
  it('allows the route on the server platform without probing (SSR renders the shell; client re-checks)', () => {
    // Even probed + unauthenticated — which redirects in the browser —
    // must pass on the server: a server-side redirect becomes a real HTTP
    // 302 that bounces authenticated users too (no cookies during SSR).
    const session = new FakeSession();
    session.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionStateService, useValue: session },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    expect(runGuardSync(authGuard)).toBe(true);
  });

  it('allows the route synchronously when SessionState is already probed + authenticated', () => {
    const session = new FakeSession();
    session.setUser(FAKE_USER);
    configureWith(session);
    expect(runGuardSync(authGuard)).toBe(true);
  });

  it('redirects to /auth/sign-in synchronously when probed + unauthenticated', () => {
    const session = new FakeSession();
    session.clear(); // probed=true, user=null
    configureWith(session);
    const result = runGuardSync(authGuard) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/sign-in');
  });

  it('probes BE on first navigation and allows when /users/me returns a user', fakeAsync(() => {
    const session = new FakeSession();
    session.probeReturn = FAKE_USER;
    configureWith(session);
    let result: true | UrlTree | undefined;
    (runGuardSync(authGuard) as Observable<true | UrlTree>).subscribe((r) => (result = r));
    tick();
    expect(result).toBe(true);
  }));

  it('probes BE on first navigation and redirects when /users/me 401s', fakeAsync(() => {
    const session = new FakeSession();
    session.probeReturn = null;
    configureWith(session);
    let result: true | UrlTree | undefined;
    (runGuardSync(authGuard) as Observable<true | UrlTree>).subscribe((r) => (result = r));
    tick();
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/auth/sign-in');
  }));
});

describe('adminGuard', () => {
  const ADMIN_USER = {
    ...FAKE_USER,
    userType: { value: 'ADMIN', label: 'Administrator' },
  } as unknown as UserDtoOut;

  it('allows an ADMIN synchronously when the session is already probed', () => {
    const session = new FakeSession();
    session.setUser(ADMIN_USER);
    configureWith(session);
    expect(runGuardSync(adminGuard)).toBe(true);
  });

  it('sends a signed-in non-admin back to the dashboard', () => {
    const session = new FakeSession();
    session.setUser(FAKE_USER); // COMPANY
    configureWith(session);
    const result = runGuardSync(adminGuard) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/collaborations/list');
  });

  it('sends an anonymous visitor to sign-in', () => {
    const session = new FakeSession();
    session.clear();
    configureWith(session);
    const result = runGuardSync(adminGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/sign-in');
  });

  it('probes once on a cold session and decides on the answer', fakeAsync(() => {
    const session = new FakeSession();
    session.probeReturn = ADMIN_USER;
    configureWith(session);
    let result: true | UrlTree | undefined;
    (runGuardSync(adminGuard) as Observable<true | UrlTree>).subscribe((r) => (result = r));
    tick();
    expect(result).toBe(true);
  }));
});

describe('noAuthGuard', () => {
  it('allows the route synchronously when SessionState has not yet probed', () => {
    // Default fresh session: probed=false, user=null. Public routes must
    // render immediately for unauthenticated visitors — no async probe.
    const session = new FakeSession();
    configureWith(session);
    expect(runGuardSync(noAuthGuard)).toBe(true);
  });

  it('allows the route synchronously when probed + unauthenticated', () => {
    const session = new FakeSession();
    session.clear();
    configureWith(session);
    expect(runGuardSync(noAuthGuard)).toBe(true);
  });

  it('redirects to /collaborations/list synchronously when probed + authenticated', () => {
    const session = new FakeSession();
    session.setUser(FAKE_USER);
    configureWith(session);
    const result = runGuardSync(noAuthGuard) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/collaborations/list');
  });
});

// of is only used implicitly above; suppress unused-import warning.
const _stub = of;
void _stub;
