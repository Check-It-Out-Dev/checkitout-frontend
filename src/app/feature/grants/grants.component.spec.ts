import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { GrantsComponent } from './grants.component';

// Iter-56 P0 #8 — /grants ported from legacy: hero + WRO4digITal logo +
// three service cards + EU banner with the funding legal text. Copy comes
// from the pre-existing landing.grants.* keys; TranslocoTestingModule with
// empty langs renders keys verbatim, so assertions target the key strings.
describe('GrantsComponent', () => {
  let fixture: ComponentFixture<GrantsComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GrantsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {}, pl: {} },
          translocoConfig: { availableLangs: ['en', 'pl'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GrantsComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the hero with badge, highlighted title and description', () => {
    const title = host.querySelector('[data-testid="grants-title"]');
    expect(title?.textContent).toContain('landing.grants.hero.title');
    expect(title?.textContent).toContain('landing.grants.hero.title_highlight');
    expect(host.textContent).toContain('landing.grants.hero.badge');
    expect(host.textContent).toContain('landing.grants.hero.description');
  });

  it('renders the three service cards with per-card i18n scopes', () => {
    const cards = host.querySelectorAll('[data-testid^="grants-service-"]');
    expect(cards.length).toBe(3);
    for (const id of ['security', 'advisory', 'funding']) {
      const card = host.querySelector(`[data-testid="grants-service-${id}"]`);
      expect(card?.textContent).toContain(`landing.grants.services.${id}.category`);
      expect(card?.textContent).toContain(`landing.grants.services.${id}.title`);
      expect(card?.textContent).toContain(`landing.grants.services.${id}.description`);
      expect(card?.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
    }
  });

  it('renders both EU-visibility images unmodified from the euGraphics assets', () => {
    const logo = host.querySelector('img[src="assets/images/euGraphics/wro4digital_logo.png"]');
    const banner = host.querySelector('img[src="assets/images/euGraphics/eu_banner.webp"]');
    expect(logo).toBeTruthy();
    expect(logo?.getAttribute('alt')).toContain('WRO4digITal');
    expect(banner).toBeTruthy();
    expect(banner?.getAttribute('alt')).toContain('Fundusze Europejskie');
  });

  it('renders the EU funding legal text block', () => {
    const legal = host.querySelector('[data-testid="grants-legal-text"]');
    expect(legal?.textContent).toContain('landing.grants.eu_banner.legal_text');
    expect(host.textContent).toContain('landing.grants.eu_banner.title');
  });
});
