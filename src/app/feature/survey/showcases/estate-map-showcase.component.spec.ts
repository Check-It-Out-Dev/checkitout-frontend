import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@ngneat/transloco';
import {
  AUTHOR_LINKEDIN_URL,
  AUTHOR_NAME,
  BE_REPO_URL,
  FE_REPO_URL,
  GITHUB_ORG_URL,
  GRAPH_REPO_URL,
} from '../ui/survey-links';
import { EstateMapShowcaseComponent } from './estate-map-showcase.component';

/**
 * The card a CV link lands on: three exits, each to a public README and one
 * document deeper, and the engineer named once with two links. The hrefs are
 * pinned because a broken exit here costs an interview.
 */
describe('EstateMapShowcaseComponent', () => {
  let fixture: ComponentFixture<EstateMapShowcaseComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        EstateMapShowcaseComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EstateMapShowcaseComponent);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('shows the three repositories in reading order with their README links', () => {
    const cards = el.querySelectorAll('[data-testid^="estate-repo-"]');
    expect(Array.from(cards).map((c) => c.getAttribute('data-testid'))).toEqual([
      'estate-repo-frontend',
      'estate-repo-backend',
      'estate-repo-method',
    ]);
    const href = (k: string) =>
      el.querySelector<HTMLAnchorElement>(`[data-testid="estate-readme-${k}"]`)?.href;
    expect(href('frontend')).toBe(FE_REPO_URL);
    expect(href('backend')).toBe(BE_REPO_URL);
    expect(href('method')).toBe(GRAPH_REPO_URL);
  });

  it('every card carries one document a step deeper than the README, on the same repository', () => {
    for (const r of fixture.componentInstance.repos) {
      expect(r.docs.startsWith(`${r.readme}/blob/main/`)).toBe(true);
      const links = el.querySelectorAll<HTMLAnchorElement>(`[data-testid="estate-repo-${r.k}"] a`);
      expect(links.length).toBe(2);
      for (const a of links) {
        expect(a.target).toBe('_blank');
        expect(a.rel).toContain('noopener');
      }
    }
  });

  it('names the engineer once, with LinkedIn and the GitHub organisation', () => {
    const author = el.querySelector('[data-testid="estate-author"]');
    expect(author?.textContent).toContain(AUTHOR_NAME);
    expect(el.querySelectorAll('[data-testid="estate-author"]').length).toBe(1);
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="estate-author-linkedin"]')?.href,
    ).toBe(AUTHOR_LINKEDIN_URL);
    expect(el.querySelector<HTMLAnchorElement>('[data-testid="estate-author-github"]')?.href).toBe(
      GITHUB_ORG_URL,
    );
  });
});
