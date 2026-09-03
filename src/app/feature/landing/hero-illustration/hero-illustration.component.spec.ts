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
