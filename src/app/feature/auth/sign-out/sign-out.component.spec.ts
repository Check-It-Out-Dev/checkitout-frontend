import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AuthOperationResponse } from '../../../api/model/auth-operation-response';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { SignOutComponent } from './sign-out.component';

class FakeAuthApi {
  next: () => Observable<AuthOperationResponse> = () =>
    of({ success: true } as AuthOperationResponse);
  signOut(): Observable<AuthOperationResponse> {
    return this.next();
  }
}

class FakeSession {
  cleared = 0;
  clear(): void {
    this.cleared += 1;
  }
}

function create(api: FakeAuthApi): {
  fixture: ComponentFixture<SignOutComponent>;
  session: FakeSession;
  router: Router;
} {
  const session = new FakeSession();
  TestBed.configureTestingModule({
    imports: [
      SignOutComponent,
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
  const fixture = TestBed.createComponent(SignOutComponent);
  const router = TestBed.inject(Router);
  jest.spyOn(router, 'navigate').mockResolvedValue(true);
  return { fixture, session, router };
}

describe('SignOutComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('clears SessionState and navigates to /auth/sign-in on BE success', fakeAsync(() => {
    const api = new FakeAuthApi();
    const { fixture, session, router } = create(api);

    fixture.detectChanges();
    tick();

    expect(session.cleared).toBe(1);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/sign-in']);
  }));

  it('still clears + navigates when BE fails (resilient sign-out)', fakeAsync(() => {
    const api = new FakeAuthApi();
    api.next = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const { fixture, session, router } = create(api);

    fixture.detectChanges();
    tick();

    expect(session.cleared).toBe(1);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/sign-in']);
  }));
});
