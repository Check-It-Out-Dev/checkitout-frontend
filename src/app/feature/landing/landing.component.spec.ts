import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        LandingComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([]), provideHttpClient(withXhr()), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders three campaign example cards', () => {
    const cards = host.querySelectorAll(
      'article[data-testid="landing-campaign-coffee_shop"], article[data-testid="landing-campaign-zero_waste"], article[data-testid="landing-campaign-summer_sports"]',
    );
    expect(cards.length).toBe(3);
  });

  it('renders three self-serve tiers (highlighted growth) plus the two managed tiers', () => {
    const tiers = host.querySelectorAll(
      '[data-testid="landing-pricing-starter"], [data-testid="landing-pricing-growth"], [data-testid="landing-pricing-premium"]',
    );
    expect(tiers.length).toBe(3);
    const highlighted = host.querySelector('[data-testid="landing-pricing-growth"]');
    expect(highlighted?.classList.contains('border-coral-500')).toBe(true);
    expect(host.querySelector('[data-testid="landing-pricing-hands-free"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="landing-pricing-enterprise"]')).toBeTruthy();
  });

  it('shows the legacy price truth on the tier cards (0 / 29 / 99 PLN)', () => {
    const price = (id: string) =>
      host.querySelector(`[data-testid="landing-price-${id}"]`)?.textContent?.trim() ?? '';
    expect(price('starter')).toMatch(/^0\b/);
    expect(price('growth')).toMatch(/^29\b/);
    expect(price('premium')).toMatch(/^99\b/);
  });

  it('renders cookie-free anchors deep-linking to sign-up', () => {
    const businessCtas = host.querySelectorAll<HTMLAnchorElement>(
      '[data-testid^="landing-pricing-cta-"]',
    );
    expect(businessCtas.length).toBe(3);
    businessCtas.forEach((a) => expect(a.getAttribute('href')).toBe('/auth/sign-up/business'));
  });

  // Iter-53 P0 #7 — Art. 206 KSH corporate disclosure: a sp. z o.o. must
  // show name, registered seat, KRS, NIP and REGON on commercial pages.
  it('renders the KRS/REGON/NIP legal-disclosure block in the footer', () => {
    const legal = host.querySelector('[data-testid="landing-footer-legal"]');
    expect(legal).not.toBeNull();
    const text = legal?.textContent ?? '';
    expect(text).toContain('CHECK IT OUT SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ');
    expect(text).toContain('Check It Out Sp. z o.o.');
    expect(text).toContain('Białowieska 89/24');
    expect(text).toContain('54-234 Wrocław');
    expect(text).toContain('Polska');
    expect(text).toContain('KRS: 0001181981');
    expect(text).toContain('REGON: 542155013');
    expect(text).toContain('NIP: 8943264018');
  });

  // a11y (Lighthouse heading-order / WCAG 1.3.1): heading levels must never
  // skip on the way down. Locks the sr-only features <h2> (the strip had no
  // section heading, so its cards skipped h1→h3) and the footer columns
  // (h4→h3, which skipped from the CTA h2). Sub-components add no headings.
  it('has no heading-order skips across the whole landing', () => {
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName.charAt(1)),
    );
    expect(levels.length).toBeGreaterThan(0);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  // a11y (Lighthouse definition-list): a <dl> may only wrap dt/dd/div groups.
  // The FAQ disclosures (<details>) moved out of the <dl> into a <div>; the
  // remaining hero/campaign/dashboard <dl>s hold only dt/dd. Guard relapse.
  it('never nests <details> inside a <dl> (valid dl content model)', () => {
    expect(host.querySelectorAll('dl details').length).toBe(0);
  });

  // audit-2026-05-13 P2 — the footer Grants link pointed at /support; a
  // dedicated /grants route exists and should be the target.
  it('footer Grants link targets the dedicated /grants route', () => {
    const grants = host.querySelector('[data-testid="landing-footer-grants"]');
    expect(grants?.getAttribute('href')).toBe('/grants');
  });
});
