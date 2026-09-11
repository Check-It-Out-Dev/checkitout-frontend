import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { GraphTopologyShowcaseComponent } from './graph-topology-showcase.component';
import { GRAPH_DATA } from './graph-topology-data';
import { GRAPH_COST } from './graph-cost-data';

/**
 * The map is generated from the graph, so the first thing to pin is that the
 * generated data still has the shape the drawing and the survey's numbers
 * assume; the second is the focus model — hover previews, click pins, Escape
 * returns to the master — because the inspector is the whole point of the
 * block and a card that ignores the pointer is a map of nothing.
 */
describe('GraphTopologyShowcaseComponent', () => {
  let fixture: ComponentFixture<GraphTopologyShowcaseComponent>;
  let c: GraphTopologyShowcaseComponent;
  const q = (sel: string): HTMLElement | null => fixture.nativeElement.querySelector(sel);
  /** The first inspector card: jsdom renders the accordion's copy too (CSS hides it in a browser). */
  const card = (): HTMLElement => q('[data-testid="graphtopo-inspector"]') as HTMLElement;
  const inCard = (sel: string): number => card().querySelectorAll(sel).length;
  const inspectorName = (): string =>
    q('[data-testid="graphtopo-inspector-name"]')?.textContent?.trim() ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GraphTopologyShowcaseComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GraphTopologyShowcaseComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('the generated graph', () => {
    it('is the CheckItOutSystem namespace: 1 master, 15 domains, 130 components, 22 typed relationships', () => {
      expect(GRAPH_DATA.master.name).toBeTruthy();
      expect(GRAPH_DATA.domains.length).toBe(15);
      expect(GRAPH_DATA.leaves.length).toBe(130);
      expect(GRAPH_DATA.edges.length).toBe(22);
      // the stat row and the published-numbers gate count the same graph
      expect(c.stats.find((s) => s.key === 'nodes')?.value).toBe(
        String(1 + GRAPH_DATA.domains.length + GRAPH_DATA.leaves.length),
      );
      expect(c.stats.find((s) => s.key === 'rels')?.value).toBe(
        String(GRAPH_DATA.domains.length + GRAPH_DATA.leaves.length + GRAPH_DATA.edges.length),
      );
    });

    it('resolves every reference: each component to a domain, each relationship to two components', () => {
      const domains = new Set(GRAPH_DATA.domains.map((d) => d.key));
      const leaves = new Set(GRAPH_DATA.leaves.map((l) => l.id));
      expect(leaves.size).toBe(GRAPH_DATA.leaves.length); // ids are unique
      for (const l of GRAPH_DATA.leaves) expect(domains.has(l.domain)).toBe(true);
      for (const e of GRAPH_DATA.edges) {
        expect(leaves.has(e.from)).toBe(true);
        expect(leaves.has(e.to)).toBe(true);
        expect(e.ai_context.length).toBeGreaterThan(0);
      }
    });

    it('carries the metadata the block exists to show, and only where the graph has it', () => {
      for (const d of GRAPH_DATA.domains) expect(d.ai_description.length).toBeGreaterThan(0);
      for (const l of GRAPH_DATA.leaves) expect(l.ai_description.length).toBeGreaterThan(0);
      // the two vintages of the model: 40 components with a behavioural role, 90 with a "why"
      expect(GRAPH_DATA.leaves.filter((l) => l.role).length).toBe(40);
      expect(GRAPH_DATA.leaves.filter((l) => l.why).length).toBe(90);
      // the typed relationships never cross a domain — the chords are drawn inside a sector
      const domainOf = new Map(GRAPH_DATA.leaves.map((l) => [l.id, l.domain]));
      for (const e of GRAPH_DATA.edges) expect(domainOf.get(e.from)).toBe(domainOf.get(e.to));
      expect(new Set(GRAPH_DATA.edges.map((e) => domainOf.get(e.from))).size).toBe(4);
    });
  });

  describe('the drawing', () => {
    it('lays every domain out with a span, in category order, and no two marks on top of each other', () => {
      let last = -1;
      let lastCat = '';
      const order = ['app', 'infra', 'quality'];
      for (const p of c.placed) {
        expect(p.a1 - p.a0).toBeGreaterThan(0);
        expect(p.a0).toBeGreaterThanOrEqual(last);
        last = p.a1;
        if (lastCat)
          expect(order.indexOf(p.domain.cat)).toBeGreaterThanOrEqual(order.indexOf(lastCat));
        lastCat = p.domain.cat;
      }
      expect(last).toBeLessThanOrEqual(360);
      const marks = c.placed.flatMap((p) => p.leaves);
      for (let i = 0; i < marks.length; i++) {
        for (let j = i + 1; j < marks.length; j++) {
          const d = Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y);
          expect(d).toBeGreaterThanOrEqual(8);
        }
      }
    });

    it('renders 15 arcs, 130 marks, 22 chords and a sector per category', () => {
      expect(fixture.nativeElement.querySelectorAll('.gt-arc').length).toBe(15);
      expect(fixture.nativeElement.querySelectorAll('.gt-leaf').length).toBe(130);
      expect(fixture.nativeElement.querySelectorAll('.gt-chord').length).toBe(22);
      expect(fixture.nativeElement.querySelectorAll('.gt-sector').length).toBe(3);
      expect(c.chords.every((ch) => ch.d.startsWith('M'))).toBe(true);
    });
  });

  describe('the inspector', () => {
    it('starts on the master, with its description and the discovery protocol', () => {
      expect(q('[data-testid="graphtopo-inspector"]')?.getAttribute('data-kind')).toBe('master');
      expect(inspectorName()).toBe(GRAPH_DATA.master.name);
      expect(q('[data-testid="graphtopo-inspector"]')?.textContent).toContain(
        GRAPH_DATA.master.ai_description,
      );
      expect(q('[data-testid="graphtopo-inspector-cypher"]')?.textContent).toContain(
        'NavigationMaster',
      );
    });

    it('previews a domain on hover and forgets it when the pointer leaves; a click pins it', () => {
      const billing = GRAPH_DATA.domains.find((d) => d.key === 'billing')!;
      c.hover.set({ kind: 'domain', key: 'billing' });
      fixture.detectChanges();
      expect(inspectorName()).toBe(billing.name);
      expect(q('[data-testid="graphtopo-inspector-desc"]')?.textContent).toContain(
        billing.ai_description,
      );
      expect(q('[data-testid="graphtopo-inspector-cypher"]')?.textContent).toContain(
        "key: 'billing'",
      );
      c.hover.set(null);
      fixture.detectChanges();
      expect(inspectorName()).toBe(GRAPH_DATA.master.name);

      c.pin({ kind: 'domain', key: 'billing' });
      fixture.detectChanges();
      expect(inspectorName()).toBe(billing.name);
      expect(q('.gt-arc[data-domain="billing"]')?.getAttribute('aria-pressed')).toBe('true');
      // its ten components as chips, and its six typed relationships with their context
      expect(inCard('[data-testid="graphtopo-inspector-leaves"] button')).toBe(10);
      expect(inCard('[data-testid="graphtopo-inspector-edges"] li')).toBe(6);
      // the other domains step back behind the overlay's wedges; the base is untouched
      const wedge = (key: string): string | null =>
        q(`[data-testid="graphtopo-overlay"] .gt-wedge[data-domain="${key}"]`)?.getAttribute(
          'fill-opacity',
        ) ?? null;
      expect(wedge('cicd')).toBe('0.55');
      expect(wedge('billing')).toBe('0');
      expect(q('[data-testid="graphtopo-active-arc"]')).toBeTruthy();
      expect(
        fixture.nativeElement.querySelectorAll('[data-testid="graphtopo-overlay"] .gt-lit').length,
      ).toBe(6);
    });

    it('escapes a quote in the snippet, and the backslash before it', () => {
      // An id that is not a known leaf falls back to itself as the name, which is the only way to
      // put an awkward value through this from a test. The snippet is offered to the reader to
      // copy, so a value that closes the string literal early hands them a different query than the
      // one on the screen. CodeQL had this as js/incomplete-sanitization: the quote was escaped,
      // the backslash before it was not. A backslash immediately before the quote is the case where
      // that matters -- escaping only the quote turns \' into \\', where the first backslash
      // escapes the second and the quote is left free to close the literal.
      c.pin({ kind: 'leaf', id: String.raw`Odd\' RETURN 1 //` });
      fixture.detectChanges();

      const cypher = q('[data-testid="graphtopo-inspector-cypher"]')?.textContent ?? '';
      expect(cypher).toContain(String.raw`name: 'Odd\\\' RETURN 1 //'`);
      expect(cypher).not.toContain(String.raw`name: 'Odd\\' RETURN`);
    });

    it('shows a component with its role, its parent and its relationships, and Escape returns to the master', () => {
      const handler = GRAPH_DATA.leaves.find((l) => l.name === 'StripeWebhookHandler')!;
      c.pin({ kind: 'leaf', id: handler.id });
      fixture.detectChanges();
      expect(q('[data-testid="graphtopo-inspector"]')?.getAttribute('data-kind')).toBe('leaf');
      expect(inspectorName()).toBe('StripeWebhookHandler');
      expect(q('[data-testid="graphtopo-inspector"]')?.textContent).toContain('Implementation');
      // TRIGGERS in, ORCHESTRATES + VALIDATES out
      expect(inCard('[data-testid="graphtopo-inspector-edges"] li')).toBe(3);
      expect(c.litEdge(GRAPH_DATA.edges.find((e) => e.from === handler.id)!)).toBe(true);
      c.onEscape();
      fixture.detectChanges();
      expect(q('[data-testid="graphtopo-inspector"]')?.getAttribute('data-kind')).toBe('master');
    });

    it('lets a role card light its glyphs: the counts are the graph’s, not typed', () => {
      expect(c.roles.map((r) => r.sym)).toEqual(['C', 'F', 'S', 'I', 'D', 'L']);
      const total = c.roles.reduce((n, r) => n + c.roleCount(r.key), 0);
      expect(total).toBe(40);
      c.roleHighlight.set('security');
      fixture.detectChanges();
      expect(q('[data-testid="graphtopo-role-veil"]')?.getAttribute('fill-opacity')).toBe('0.7');
      expect(c.roleMarks().length).toBe(c.roleCount('security'));
    });
  });

  it('prints the measured cost of an answer, graph against search-and-read, never a typed figure', () => {
    expect(GRAPH_COST.questions.map((q) => q.key)).toEqual([
      'dependents',
      'billing',
      'consent',
      'scheduled',
    ]);
    expect(GRAPH_COST.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(GRAPH_COST.backend.javaFiles).toBeGreaterThan(100);
    for (const q of GRAPH_COST.questions) {
      expect(q.graph.nodes).toBeGreaterThan(0);
      expect(q.graph.tokens).toBe(Math.round(q.graph.chars / 4));
      expect(q.search.tokens).toBe(Math.round(q.search.bytes / 4));
      expect(q.ratio).toBe(Math.round(q.search.bytes / 4 / Math.max(1, q.graph.chars / 4)));
      expect(q.ratio).toBeGreaterThan(1);
    }
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="graphtopo-cost"] tbody tr');
    expect(rows.length).toBe(4);
    expect(rows[0].textContent).toContain(`×${GRAPH_COST.questions[0].ratio}`);
  });

  it('resolves a point of the drawing to the master, a domain, a mark, or nothing', () => {
    // the base layer never changes, so the pointer is matched against the
    // layout instead of 145 listeners: the centre, an arc, a mark, a gap
    expect(c.resolve(380, 380)).toEqual({ kind: 'master' });
    const billing = c.placed.find((p) => p.domain.key === 'billing')!;
    expect(c.resolve(Number(billing.fanAt.x), Number(billing.fanAt.y) - 3.5)).toEqual({
      kind: 'domain',
      key: 'billing',
    });
    const mark = billing.leaves[0];
    expect(c.resolve(mark.x + 2, mark.y - 2)).toEqual({ kind: 'leaf', id: mark.leaf.id });
    expect(c.resolve(380, 280)).toBeNull(); // between the master and the sectors
    expect(c.resolve(2, 2)).toBeNull(); // the corner, outside the ring
  });

  it('asks the graph for the subsystems by name, not by the entity type they all share', () => {
    expect(c.querySnippet).toContain(
      ':GUIDES]->(e:EntityNavigator)-[:IMPLEMENTS]->(c:ConcreteImpl)',
    );
    expect(c.querySnippet).toContain('e.name AS subsystem');
  });
});
