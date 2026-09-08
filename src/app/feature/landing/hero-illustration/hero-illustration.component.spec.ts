import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco } from '@ngneat/transloco';
import { of } from 'rxjs';
import { HeroIllustrationComponent } from './hero-illustration.component';

class FakeTranslocoLoader {
  getTranslation() {
    return of({});
  }
}

describe('HeroIllustrationComponent', () => {
  let fixture: ComponentFixture<HeroIllustrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroIllustrationComponent],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en', 'pl'], defaultLang: 'en' },
          loader: FakeTranslocoLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeroIllustrationComponent);
    fixture.detectChanges();
  });

  it('renders the root illustration container', () => {
    const root = fixture.nativeElement.querySelector('[data-testid="hero-illustration"]');
    expect(root).toBeTruthy();
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the influencer + company + connection elements', () => {
    expect(
      fixture.nativeElement.querySelector('[data-testid="hero-illustration-influencer"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="hero-illustration-company"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="hero-illustration-connection"]'),
    ).toBeTruthy();
  });

  it('gives the connection a line and two dots that carry the crossing motion', () => {
    // jsdom has no animation engine, so this is the DOM contract only: the
    // line exists as its own element (it used to be a 0 px flex leftover), and
    // each dot wears the class its keyframes are bound to. Whether they move,
    // and meet in the middle, is asserted in the browser by
    // e2e-tests/sandbox/hero-illustration.spec.ts.
    const el = fixture.nativeElement;
    expect(el.querySelector('[data-testid="hero-illustration-connection-line"]')).toBeTruthy();
    const creator = el.querySelector('[data-testid="hero-illustration-dot-creator"]');
    const company = el.querySelector('[data-testid="hero-illustration-dot-company"]');
    expect(creator.classList.contains('hero-dot--creator')).toBe(true);
    expect(company.classList.contains('hero-dot--company')).toBe(true);
  });

  it('renders the analytics floating card', () => {
    const analytics = fixture.nativeElement.querySelector(
      '[data-testid="hero-illustration-analytics"]',
    );
    expect(analytics).toBeTruthy();
  });

  it('renders the progress floating card with creator name + progress bar', () => {
    const progress = fixture.nativeElement.querySelector(
      '[data-testid="hero-illustration-progress"]',
    );
    expect(progress).toBeTruthy();
    expect(progress.textContent).toContain('75%');
  });
});
