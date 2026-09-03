import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { SCENARIO_COUNT } from '../../../core/demo/scenario-registry';
import { SURVEY_CHAPTERS } from '../../survey/ui/chapter-registry';
import { OssStorySectionComponent } from './oss-story-section.component';

describe('OssStorySectionComponent', () => {
  let fixture: ComponentFixture<OssStorySectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        OssStorySectionComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {}, en: {} },
          translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(OssStorySectionComponent);
    fixture.detectChanges();
  });

  it('renders the MIT repo family — backend, greenfield frontend, and the method', () => {
    const backend: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '[data-testid="landing-oss-github-backend"]',
    );
    const frontend: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '[data-testid="landing-oss-github-frontend"]',
    );
    const method: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '[data-testid="landing-oss-github-method"]',
    );
    expect(backend.href).toBe('https://github.com/Check-It-Out-Dev/checkitout-backend');
    expect(frontend.href).toBe('https://github.com/Check-It-Out-Dev/checkitout-frontend');
    expect(method.href).toBe('https://github.com/Check-It-Out-Dev/graph-theory-system-modeling');
    expect([backend, frontend, method].every((a) => a.rel.includes('noopener'))).toBe(true);
  });

  it('teases every survey chapter and every demo sandbox (registries stay in lock-step)', () => {
    const surveyLinks = fixture.nativeElement.querySelectorAll(
      '[data-testid="landing-oss-survey-card"] ul a',
    );
    const demoLinks = fixture.nativeElement.querySelectorAll(
      '[data-testid="landing-oss-demo-card"] ul a',
    );
    expect(surveyLinks.length).toBe(SURVEY_CHAPTERS.length);
    expect(demoLinks.length).toBe(SCENARIO_COUNT);
    expect(surveyLinks[0].getAttribute('href')).toBe('/technical-survey/platform');
    expect(demoLinks[0].getAttribute('href')).toContain('/demo?start=admin-2fa');
  });

  it('shows the three-person team with LinkedIn profiles', () => {
    const team = fixture.nativeElement.querySelector('[data-testid="landing-oss-team"]');
    const links = Array.from(team.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(team.textContent).toContain('Norbert Marchewka');
    expect(team.textContent).toContain('Jakub Sadowski');
    expect(team.textContent).toContain('Piotr Żmudzki');
    expect(links.every((a) => a.href.startsWith('https://www.linkedin.com/in/'))).toBe(true);
    expect(team.querySelectorAll('img').length).toBe(3);
  });
});
