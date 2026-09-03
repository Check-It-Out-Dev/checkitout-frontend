import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { ActionRouterComponent } from './action-router.component';

function setupWithQueryParams(queryParams: Record<string, string>): {
  fixture: ComponentFixture<ActionRouterComponent>;
  navSpy: jest.SpyInstance;
} {
  TestBed.configureTestingModule({
    imports: [
      ActionRouterComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ActionRouterComponent);
  const router = TestBed.inject(Router);
  const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
  return { fixture, navSpy };
}

describe('ActionRouterComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('routes verifyEmail mode to /auth/verify-email and forwards passthrough params', () => {
    const { fixture, navSpy } = setupWithQueryParams({
      mode: 'verifyEmail',
      oobCode: 'abc123',
      continueUrl: 'https://app.example/back',
      lang: 'pl',
      ut: 'I',
      iac: '0',
      stripped: 'should-not-pass',
    });
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalledWith(['/auth/verify-email'], {
      queryParams: {
        oobCode: 'abc123',
        continueUrl: 'https://app.example/back',
        lang: 'pl',
        ut: 'I',
        iac: '0',
      },
      replaceUrl: true,
    });
    expect(fixture.componentInstance.showError()).toBe(false);
  });

  it('routes resetPassword mode to /auth/reset-password (only oobCode + lang)', () => {
    const { fixture, navSpy } = setupWithQueryParams({
      mode: 'resetPassword',
      oobCode: 'def456',
      lang: 'en',
      ut: 'C', // intentionally dropped on reset-password path
    });
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalledWith(['/auth/reset-password'], {
      queryParams: { oobCode: 'def456', lang: 'en' },
      replaceUrl: true,
    });
  });

  it('shows the error panel when mode is unknown', () => {
    const { fixture, navSpy } = setupWithQueryParams({
      mode: 'recoverEmail', // unsupported by greenfield
      oobCode: 'xyz',
    });
    fixture.detectChanges();

    expect(navSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.showError()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-router-error-title"]'),
    ).not.toBeNull();
  });

  it('shows the error panel when oobCode is missing', () => {
    const { fixture, navSpy } = setupWithQueryParams({ mode: 'verifyEmail' });
    fixture.detectChanges();

    expect(navSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.showError()).toBe(true);
  });
});
