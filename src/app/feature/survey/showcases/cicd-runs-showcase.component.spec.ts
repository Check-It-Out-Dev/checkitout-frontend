import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { BE_REPO_URL, FE_REPO_URL } from '../ui/survey-links';
import { CicdRunsShowcaseComponent } from './cicd-runs-showcase.component';

/**
 * Four pipelines, in the order they run in a day, each linking to the file
 * that defines it — the card must never describe a workflow that cannot be
 * opened.
 */
describe('CicdRunsShowcaseComponent', () => {
  let fixture: ComponentFixture<CicdRunsShowcaseComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CicdRunsShowcaseComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CicdRunsShowcaseComponent);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('renders the pipelines in reading order, with mutation after the night that runs it', () => {
    const rows = el.querySelectorAll('[data-testid="cicd-runs"] [data-run]');
    expect(Array.from(rows).map((r) => r.getAttribute('data-run'))).toEqual([
      'pr',
      'browser',
      'kubernetes',
      'nightly',
      'mutation',
      'release',
      'perf',
    ]);
  });

  it('links the workflow files in both repositories', () => {
    const hrefs = Array.from(el.querySelectorAll<HTMLAnchorElement>('a')).map((a) => a.href);
    // pr.yml, not ci-tests.yml: the card names the pipeline, and the tier it used to name is now
    // one of the things that pipeline calls.
    expect(hrefs).toContain(`${FE_REPO_URL}/blob/main/.github/workflows/pr.yml`);
    expect(hrefs).toContain(`${FE_REPO_URL}/blob/main/.github/workflows/nightly-full-stack.yml`);
    expect(hrefs).toContain(`${BE_REPO_URL}/tree/main/.github/workflows`);
    for (const a of el.querySelectorAll<HTMLAnchorElement>('a')) {
      expect(a.rel).toContain('noopener');
    }
  });

  it('carries the provenance note for its figures', () => {
    expect(el.querySelector('[data-testid="cicd-note"]')).toBeTruthy();
  });

  it('points at the dashboard the figures are measured on', () => {
    expect(el.querySelector('[data-testid="cicd-dashboard"]')).toBeTruthy();
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="cicd-dashboard-link"]');
    expect(link).toBeTruthy();
    expect(link!.href).toContain('check-it-out-dev.github.io/checkitout-frontend');
  });
});
