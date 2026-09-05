import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { CodemapFilmDialogComponent } from './film-dialog/codemap-film-dialog.component';
import { CodemapPageComponent } from './codemap-page.component';

/**
 * Smoke-compiles the /codemap page with the real toolbar + player (tsc does
 * not compile external templates — this spec proves the bindings render) and
 * pins the promises the page makes: the top link row (repo href is the real
 * research repo; the film is an honest "soon" stub until the Vimeo upload),
 * six decision cards, four journey milestones, and the install section.
 */
describe('CodemapPageComponent', () => {
  let fixture: ComponentFixture<CodemapPageComponent>;
  const dialogOpen = jest.fn();

  beforeEach(async () => {
    dialogOpen.mockClear();
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
        { provide: MatDialog, useValue: { open: dialogOpen } },
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

  it('the film button opens the lightbox with the real capture', () => {
    const btn = q('codemap-link-film');
    expect(btn).toBeTruthy();
    btn.nativeElement.click();
    expect(dialogOpen).toHaveBeenCalledWith(
      CodemapFilmDialogComponent,
      expect.objectContaining({ panelClass: 'codemap-film-panel' }),
    );
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
