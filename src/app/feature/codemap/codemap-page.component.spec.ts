import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { CodemapPageComponent } from './codemap-page.component';

/**
 * Smoke-compiles the /codemap page with the real toolbar + player (tsc does
 * not compile external templates — this spec proves the bindings render) and
 * pins the promises the page makes: the top link row (repo href is the real
 * research repo; the film plays in place under the intro, poster first),
 * six decision cards, four journey milestones, and the install section.
 */
describe('CodemapPageComponent', () => {
  let fixture: ComponentFixture<CodemapPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CodemapPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        provideRouter([]),
        // The marketing toolbar reads the session cache (SessionStateService → HttpClient).
        provideHttpClient(withXhr()),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CodemapPageComponent);
    fixture.detectChanges();
  });

  const q = (testid: string) => fixture.debugElement.query(By.css(`[data-testid="${testid}"]`));

  it('renders hero with the real research-repo link', () => {
    expect(q('codemap-hero')).toBeTruthy();
    const repo = q('codemap-link-repo');
    expect(repo.nativeElement.getAttribute('href')).toBe(
      'https://github.com/Check-It-Out-Dev/graph-theory-system-modeling',
    );
    expect(repo.nativeElement.getAttribute('rel')).toContain('noopener');
  });

  it('the film sits under the intro as a poster, and one press plays the real capture in place', () => {
    // The poster is the first thing under the intro — no link row button, no
    // lightbox: a film behind a button was a film nobody watched.
    expect(q('codemap-film')).toBeTruthy();
    expect(q('codemap-film-video')).toBeNull();
    const play = q('codemap-film-play');
    expect(play).toBeTruthy();
    play.nativeElement.click();
    fixture.detectChanges();
    const video = q('codemap-film-video');
    expect(video).toBeTruthy();
    expect(video.nativeElement.getAttribute('src')).toBe('assets/codemap/codemap-demo.mp4');
    expect(q('codemap-film-play')).toBeNull();
  });

  it('links contact by mail in hero and closing CTA', () => {
    const mail = q('codemap-link-mail');
    expect(mail.nativeElement.getAttribute('href')).toBe('mailto:norbert_marchewka@checkitout.app');
    expect(q('codemap-cta-mail')).toBeTruthy();
  });

  it('renders the player, four journey milestones and six decision cards', () => {
    expect(q('codemap-player')).toBeTruthy();
    expect(fixture.debugElement.queryAll(By.css('[data-testid^="codemap-journey-"]')).length).toBe(
      4,
    );
    expect(fixture.debugElement.queryAll(By.css('[data-testid^="codemap-decision-"]')).length).toBe(
      6,
    );
  });

  it('anchors the install section for the hero deep-link', () => {
    const install = q('codemap-install');
    expect(install.nativeElement.getAttribute('id')).toBe('install');
    expect(q('codemap-install-readme')).toBeTruthy();
  });
});
