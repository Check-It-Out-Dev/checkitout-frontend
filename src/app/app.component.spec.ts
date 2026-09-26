import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoService } from '@ngneat/transloco';
import { of } from 'rxjs';
import { AppComponent } from './app.component';

class FakeTranslocoLoader {
  getTranslation() {
    return of({});
  }
}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en', 'pl'], defaultLang: 'pl' },
          loader: FakeTranslocoLoader,
        }),
      ],
    }).compileComponents();
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('keeps <html lang> in step with the active language', () => {
    TestBed.createComponent(AppComponent);
    expect(document.documentElement.lang).toBe('pl');
    TestBed.inject(TranslocoService).setActiveLang('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('renders a <router-outlet /> as its entire template', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const outlet = fixture.nativeElement.querySelector('router-outlet');
    expect(outlet).not.toBeNull();
  });

  it('has no chrome of its own (no sidenav / toolbar / banner) — those live on LayoutComponent', () => {
    // The docstring is explicit: AppComponent is intentionally bare so
    // the sandbox harness routes can render fixtures without inherited
    // layout chrome. Lock in that contract — if anyone "tidies up" by
    // adding a toolbar here, every sandbox fixture's snapshot becomes
    // contaminated with the toolbar.
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-sidenav')).toBeNull();
    expect(host.querySelector('mat-toolbar')).toBeNull();
    expect(host.querySelector('[data-testid="cookie-banner"]')).toBeNull();
  });
});
