import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of } from 'rxjs';
import { HealthApiService } from '../../core/health/health.service';
import { ErrorPageComponent } from './error-page.component';

class FakeHealth {
  next: () => Observable<boolean> = () => of(true);
  calls = 0;
  isHealthy(): Observable<boolean> {
    this.calls += 1;
    return this.next();
  }
}

function create(
  type: string | null,
  health: FakeHealth = new FakeHealth(),
): ComponentFixture<ErrorPageComponent> {
  const fakeRoute = {
    paramMap: of(convertToParamMap(type === null ? {} : { type })),
  } as unknown as ActivatedRoute;
  TestBed.configureTestingModule({
    imports: [
      ErrorPageComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: fakeRoute },
      { provide: HealthApiService, useValue: health },
    ],
  });
  const fixture = TestBed.createComponent(ErrorPageComponent);
  fixture.detectChanges();
  return fixture;
}

// Iter-54 P0 #8 — /error/:type real views: param picks 404/500/503 copy,
// invalid params keep the 404 default (legacy behavior), and 503 exposes
// the health re-probe that navigates back once the BE recovers.
describe('ErrorPageComponent', () => {
  afterEach(() => {
    sessionStorage.removeItem('health-check-redirect-url');
    TestBed.resetTestingModule();
  });

  it.each(['404', '500', '503'] as const)('maps route param %s to its copy', (type) => {
    const fixture = create(type);
    expect(fixture.componentInstance.errorType()).toBe(type);
    const code = fixture.nativeElement.querySelector('[data-testid="error-page-code"]');
    expect(code?.textContent?.replace(/\s+/g, '')).toBe(type);
  });

  it('defaults to 404 for an invalid param', () => {
    const fixture = create('teapot');
    expect(fixture.componentInstance.errorType()).toBe('404');
  });

  it('shows the refresh probe only on 503', () => {
    const fixture503 = create('503');
    expect(
      fixture503.nativeElement.querySelector('[data-testid="error-page-refresh"]'),
    ).not.toBeNull();
    TestBed.resetTestingModule();
    const fixture404 = create('404');
    expect(fixture404.nativeElement.querySelector('[data-testid="error-page-refresh"]')).toBeNull();
  });

  it('healthy probe navigates home when no redirect URL is stored', () => {
    const health = new FakeHealth();
    const fixture = create('503', health);
    const router = TestBed.inject(Router);
    const nav = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.refreshStatus();

    expect(health.calls).toBe(1);
    expect(nav).toHaveBeenCalledWith('/');
    expect(fixture.componentInstance.isRefreshing()).toBe(false);
  });

  it('healthy probe honors the stored health-check redirect URL', () => {
    sessionStorage.setItem('health-check-redirect-url', '/collaborations/list');
    const fixture = create('503');
    const router = TestBed.inject(Router);
    const nav = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.refreshStatus();

    expect(nav).toHaveBeenCalledWith('/collaborations/list');
    expect(sessionStorage.getItem('health-check-redirect-url')).toBeNull();
  });

  it('unhealthy probe stays on the page', () => {
    const health = new FakeHealth();
    health.next = () => of(false);
    const fixture = create('503', health);
    const router = TestBed.inject(Router);
    const nav = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.refreshStatus();

    expect(nav).not.toHaveBeenCalled();
    expect(fixture.componentInstance.isRefreshing()).toBe(false);
  });

  it('refreshStatus is a no-op outside 503', () => {
    const health = new FakeHealth();
    const fixture = create('404', health);
    fixture.componentInstance.refreshStatus();
    expect(health.calls).toBe(0);
  });
});
