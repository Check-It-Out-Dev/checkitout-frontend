import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { GRAPH_REPO_URL } from '../ui/survey-links';
import { RoadmapShowcaseComponent } from './roadmap-showcase.component';

/**
 * The work under way. Every item declares a status that is a fact about the
 * work — `progress` has commits behind it, `next` has a design — and the AI
 * evaluation box exits to the repository that holds the evidence.
 */
describe('RoadmapShowcaseComponent', () => {
  let fixture: ComponentFixture<RoadmapShowcaseComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RoadmapShowcaseComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RoadmapShowcaseComponent);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('lists the four items with the in-progress ones first', () => {
    const items = el.querySelectorAll('[data-testid="roadmap-items"] [data-item]');
    expect(Array.from(items).map((i) => i.getAttribute('data-item'))).toEqual([
      'k8s',
      'perf',
      'reports',
      'vitals',
    ]);
    expect(Array.from(items).map((i) => i.getAttribute('data-status'))).toEqual([
      'progress',
      'progress',
      'next',
      'next',
    ]);
  });

  it('says why before what', () => {
    const why = el.querySelector('[data-testid="roadmap-why"]');
    const items = el.querySelector('[data-testid="roadmap-items"]');
    expect(why && items).toBeTruthy();
    expect(why!.compareDocumentPosition(items!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the AI evaluation box exits to the graph-theory repository and its evaluation findings', () => {
    const hrefs = Array.from(
      el.querySelectorAll<HTMLAnchorElement>('[data-testid="roadmap-ai"] a'),
    ).map((a) => a.href);
    expect(hrefs).toContain(GRAPH_REPO_URL);
    expect(
      hrefs.some((h) => h.startsWith(`${GRAPH_REPO_URL}/blob/main/applications/CodeMap/docs/`)),
    ).toBe(true);
  });
});
