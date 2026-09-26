import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { TokenExchangeResponse } from '../../../api/model/token-exchange-response';
import type { UserDtoOut } from '../../../api/model/user-dto-out';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { AuthSuccessComponent } from './auth-success.component';

const FAKE_USER: UserDtoOut = {
  id: 1,
  email: 'influencer1@e2e.test',
  userType: 'INFLUENCER',
} as unknown as UserDtoOut;

class FakeAuthApi {
  exchangeNext: () => Observable<TokenExchangeResponse> = () =>
    of({ success: true } as unknown as TokenExchangeResponse);
  exchangeTokenForSession(): Observable<TokenExchangeResponse> {
    return this.exchangeNext();
  }
}

class FakeSession {
  probeNext: () => Observable<UserDtoOut | null> = () => of(FAKE_USER);
  probe(): Observable<UserDtoOut | null> {
    return this.probeNext();
  }
}

function create(
  api: FakeAuthApi = new FakeAuthApi(),
  session: FakeSession = new FakeSession(),
): { fixture: ComponentFixture<AuthSuccessComponent>; navSpy: jest.SpyInstance } {
  TestBed.configureTestingModule({
    imports: [
      AuthSuccessComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: AuthApiService, useValue: api },
      { provide: SessionStateService, useValue: session },
    ],
  });
  const fixture = TestBed.createComponent(AuthSuccessComponent);
  const navSpy = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, navSpy };
}

describe('AuthSuccessComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('exchanges token + probes /users/me + navigates into the app on success', fakeAsync(() => {
    const { fixture, navSpy } = create();
    tick();
    expect(navSpy).toHaveBeenCalledWith(['/collaborations/list']);
    expect(fixture.componentInstance.errorKey()).toBeNull();
  }));

  it('shows exchange_failed when exchange-token errors', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.exchangeNext = () => throwError(() => new Error('boom'));
    const { fixture, navSpy } = create(api);
    tick();
    expect(fixture.componentInstance.errorKey()).toBe('auth.success.errors.exchange_failed');
    expect(navSpy).not.toHaveBeenCalled();
  }));

  it('shows exchange_failed when /users/me returns null after a successful exchange', fakeAsync(() => {
    const session = new FakeSession();
    session.probeNext = () => of(null);
    const { fixture, navSpy } = create(new FakeAuthApi(), session);
    tick();
    expect(fixture.componentInstance.errorKey()).toBe('auth.success.errors.exchange_failed');
    expect(navSpy).not.toHaveBeenCalled();
  }));
});
