import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { AuthErrorComponent } from './auth-error.component';

function create(error: string | null): ComponentFixture<AuthErrorComponent> {
  TestBed.configureTestingModule({
    imports: [
      AuthErrorComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(error ? { error } : {}) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(AuthErrorComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AuthErrorComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the generic branch without the error param', fakeAsync(() => {
    const fixture = create(null);
    expect(fixture.componentInstance.isConsentRequired()).toBe(false);
    fixture.destroy(); // clears the pending redirect timer
  }));

  it('renders the consent branch for ?error=consent_required', fakeAsync(() => {
    const fixture = create('consent_required');
    expect(fixture.componentInstance.isConsentRequired()).toBe(true);
    fixture.destroy();
  }));

  it('auto-redirects to sign-in after 5s on the generic branch', fakeAsync(() => {
    const fixture = create(null);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    tick(5000);
    expect(navigate).toHaveBeenCalledWith(['/auth/sign-in']);
    fixture.destroy();
  }));

  it('auto-redirects to sign-up on the consent branch and cancels on destroy', fakeAsync(() => {
    const fixture = create('consent_required');
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.destroy();
    tick(6000);
    expect(navigate).not.toHaveBeenCalled(); // destroy cleared the timer
  }));

  it('does not schedule the redirect timer under SSR (server platform)', fakeAsync(() => {
    // A setTimeout scheduled on the server keeps ApplicationRef unstable and delays the
    // render — the timer must be browser-only.
    TestBed.configureTestingModule({
      imports: [
        AuthErrorComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(withXhr()),
        provideAnimationsAsync(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const fixture = TestBed.createComponent(AuthErrorComponent);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    tick(6000);
    expect(navigate).not.toHaveBeenCalled(); // no timer scheduled server-side
    fixture.destroy();
  }));
});
