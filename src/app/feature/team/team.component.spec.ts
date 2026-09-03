import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { TeamComponent } from './team.component';

// Owner 2026-09-02: the team is exactly the three founders — same roster,
// photos and roles as the landing's OSS-story section (one roster, two
// surfaces). Headings stay on landing.team.*.
describe('TeamComponent', () => {
  let fixture: ComponentFixture<TeamComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TeamComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {}, pl: {} },
          translocoConfig: { availableLangs: ['en', 'pl'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders exactly the three founders with their portraits', () => {
    const cards = host.querySelectorAll('[data-testid^="team-member-"]');
    expect(cards.length).toBe(3);
    expect(host.textContent).toContain('Norbert Marchewka');
    expect(host.textContent).toContain('Jakub Sadowski');
    expect(host.textContent).toContain('Piotr Żmudzki');
    const photos = Array.from(host.querySelectorAll<HTMLImageElement>('article img'));
    expect(photos.map((i) => i.getAttribute('src'))).toEqual([
      'assets/images/team/norbert.jpg',
      'assets/images/team/jakub.jpg',
      'assets/images/team/piotr.jpg',
    ]);
  });

  it('shows the OSS-roster roles verbatim', () => {
    expect(host.textContent).toContain('Full Stack Developer');
    expect(host.textContent).toContain('Backend Developer & QA');
    expect(host.textContent).toContain('Software Developer');
  });

  it('links socials with rel=noopener', () => {
    const linkedin = host.querySelectorAll('a[href*="linkedin.com"]');
    const github = host.querySelectorAll('a[href*="github.com"]');
    expect(linkedin.length).toBe(3);
    expect(github.length).toBe(3);
    linkedin.forEach((a) => expect(a.getAttribute('rel')).toBe('noopener'));
  });
});
