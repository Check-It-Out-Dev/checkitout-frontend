import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideTransloco, TranslocoService } from '@ngneat/transloco';
import { of } from 'rxjs';
import { MarketingToolbarComponent } from './marketing-toolbar.component';

class FakeTranslocoLoader {
  getTranslation() {
    return of({});
  }
}

describe('MarketingToolbarComponent', () => {
  let fixture: ComponentFixture<MarketingToolbarComponent>;
  let component: MarketingToolbarComponent;
  let transloco: TranslocoService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketingToolbarComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideNoopAnimations(),
        provideTransloco({
          config: { availableLangs: ['en', 'pl'], defaultLang: 'en' },
          loader: FakeTranslocoLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MarketingToolbarComponent);
    component = fixture.componentInstance;
    transloco = TestBed.inject(TranslocoService);
    fixture.detectChanges();
  });

  it('renders the toolbar container', () => {
    const toolbar = fixture.nativeElement.querySelector('[data-testid="marketing-toolbar"]');
    expect(toolbar).toBeTruthy();
  });

  it('renders the brand mark link to /', () => {
    const brand = fixture.nativeElement.querySelector('[data-testid="marketing-toolbar-brand"]');
    expect(brand).toBeTruthy();
    expect(brand.getAttribute('href')).toBe('/');
  });

  it('renders the Sign in link to /auth/sign-in', () => {
    const signIn = fixture.nativeElement.querySelector('[data-testid="marketing-toolbar-sign-in"]');
    expect(signIn).toBeTruthy();
    expect(signIn.getAttribute('href')).toBe('/auth/sign-in');
  });

  it('renders the Join for free CTA to /auth/sign-up', () => {
    const join = fixture.nativeElement.querySelector('[data-testid="marketing-toolbar-join"]');
    expect(join).toBeTruthy();
    expect(join.getAttribute('href')).toBe('/auth/sign-up');
  });

  it('renders six desktop nav items — three landing anchors + CodeMap, Grants routes + contact', () => {
    const nav = fixture.nativeElement.querySelectorAll('nav a');
    expect(nav.length).toBe(6);
    const hrefs = Array.from(nav).map((a) => (a as HTMLAnchorElement).getAttribute('href'));
    // CodeMap (/codemap) and Grants (/grants) are real routes, not in-page anchors.
    expect(hrefs).toEqual(['#how-it-works', '#pricing', '#faq', '/codemap', '/grants', '#contact']);
  });

  it('renders the language switcher trigger with active locale code', () => {
    const trigger = fixture.nativeElement.querySelector('[data-testid="marketing-toolbar-lang"]');
    expect(trigger).toBeTruthy();
    expect(trigger.textContent.toLowerCase()).toContain('en');
    // WCAG 2.5.3 label-in-name: the accessible name must contain the visible
    // code ("EN") so speech-input users can activate what they see.
    expect(trigger.getAttribute('aria-label')).toContain('EN');
  });

  it('switches active language to PL when setLang(pl) is called', () => {
    component.setLang('pl');
    fixture.detectChanges();
    expect(component.activeLang()).toBe('pl');
    expect(transloco.getActiveLang()).toBe('pl');

    const trigger = fixture.nativeElement.querySelector('[data-testid="marketing-toolbar-lang"]');
    expect(trigger.textContent.toLowerCase()).toContain('pl');
    expect(trigger.getAttribute('aria-label')).toContain('PL');
  });

  it('flag(lang) returns 🇬🇧 for en and 🇵🇱 for pl', () => {
    expect(component.flag('en')).toBe('🇬🇧');
    expect(component.flag('pl')).toBe('🇵🇱');
  });
});
