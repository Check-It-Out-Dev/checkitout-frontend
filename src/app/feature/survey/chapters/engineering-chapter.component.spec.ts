import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { VelocityShowcaseComponent } from '../showcases/velocity-showcase.component';
import { TestingQualityShowcaseComponent } from '../showcases/testing-quality-showcase.component';
import { GraphTopologyShowcaseComponent } from '../showcases/graph-topology-showcase.component';
import { ContractPipelineShowcaseComponent } from '../showcases/contract-pipeline-showcase.component';
import { EngineeringChapterComponent } from './engineering-chapter.component';

/**
 * Smoke-compiles the engineering chapter WITH all ten showcases (tsc
 * --noEmit does not compile inline templates — this spec proves the @for
 * bindings render) and pins the fragment anchors the hub's "Cool stuff"
 * strip deep-links to (`graph-dev`, `velocity`, `contract`,
 * `graph-topology`).
 */
describe('EngineeringChapterComponent', () => {
  let fixture: ComponentFixture<EngineeringChapterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        EngineeringChapterComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(EngineeringChapterComponent);
    fixture.detectChanges();
  });

  it('renders all ten showcase cards behind their stable deep-link anchors, the estate first', () => {
    const el: HTMLElement = fixture.nativeElement;
    const anchors = Array.from(el.querySelectorAll('app-chapter-shell [id].scroll-mt-24')).map(
      (a) => a.id,
    );
    expect(anchors[0]).toBe('estate');
    expect(anchors.slice(-3)).toEqual(['cicd', 'roadmap', 'demo-meta']);
    for (const id of [
      'estate',
      'cicd',
      'roadmap',
      'testing',
      'rewrite',
      'contract',
      'velocity',
      'graph-dev',
      'graph-topology',
      'demo-meta',
    ]) {
      const anchor = el.querySelector(`#${id}`);
      expect(anchor).toBeTruthy();
      // scroll-mt-24 clears the sticky toolbar on hub deep-links
      expect(anchor?.classList.contains('scroll-mt-24')).toBe(true);
    }
  });

  it('velocity card renders the three latency-ordered loops with growing bars', () => {
    const velocity = fixture.debugElement.query(
      By.directive(VelocityShowcaseComponent),
    ).componentInstance;
    expect(velocity.loops.map((l: { k: string }) => l.k)).toEqual(['compile', 'suite', 'runtime']);
    // bars grow with loop cost — the visual encodes the thesis
    const widths = velocity.loops.map((l: { bar: string }) => parseInt(l.bar, 10));
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
  });

  it('velocity card cites the research stats and cross-references the contract card', () => {
    const velocity = fixture.debugElement.query(
      By.directive(VelocityShowcaseComponent),
    ).componentInstance;
    expect(velocity.stats.map((s: { n: string }) => s.n)).toEqual(['15%', '38%', '16–23%']);
    // the type journey moved to the adjacent #contract card — velocity links
    // instead of repeating the dark panel two cards apart
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#velocity a[href="#contract"]')).toBeTruthy();
  });

  it('testing card renders both pyramids narrow→wide and the real nineteen-step gate chain', () => {
    const testing = fixture.debugElement.query(
      By.directive(TestingQualityShowcaseComponent),
    ).componentInstance;
    // a pyramid renders top→base: widths must strictly grow downward
    for (const tiers of [testing.beTiers, testing.feTiers]) {
      const widths = tiers.map((t: { pct: number }) => t.pct);
      for (let i = 1; i < widths.length; i++) {
        expect(widths[i]).toBeGreaterThan(widths[i - 1]);
      }
      expect(widths[widths.length - 1]).toBe(100); // the base fills the column
    }
    // FE tiers, top→base: BDD → live-BE → visual → unit
    expect(testing.feTiers.map((t: { k: string }) => t.k)).toEqual([
      'bdd',
      'integration',
      'visual',
      'unit',
    ]);
    // the gate chain is the REAL check:full from package.json — all nineteen steps. The count is
    // pinned here AND derived from package.json by check:gate-parity; this assertion is what makes
    // a drifting list fail the fast gate rather than only the static one.
    expect(testing.feGates).toHaveLength(19);
    for (const step of [
      'check:bdd-corpus',
      'check:contract-coverage',
      'check:icon-subset',
      'check:published-numbers',
      'check:workflow-env',
      'typecheck:e2e',
    ]) {
      expect(testing.feGates).toContain(step);
    }
  });

  it('contract card encodes the producer chain, the three same-type consumers and the research stats', () => {
    const contract = fixture.debugElement.query(
      By.directive(ContractPipelineShowcaseComponent),
    ).componentInstance;
    // producer chain: BE annotation → committed spec → generated client
    expect(contract.chain.map((c: { key: string }) => c.key)).toEqual(['be', 'spec', 'client']);
    // the same generated import feeds services, BDD steps and L0 pins
    expect(contract.consumers.map((u: { key: string }) => u.key)).toEqual([
      'services',
      'bdd',
      'pins',
    ]);
    // research-backed stat row (Postman 2024 / ICSE 2017 / arXiv 2112.10328 / DORA 2021)
    expect(contract.stats.map((s: { value: string }) => s.value)).toEqual([
      '74%',
      '15%',
      '1.4–4.5×',
      '3.7×',
    ]);
    // the snippet proves the compile-time claim end-to-end
    expect(contract.snippet).toContain('Expect<Equal<');
    expect(contract.snippet).toContain('openapi:gen');
    expect(contract.snippet).toContain('FAIL TO COMPILE');
  });

  it('renders no raw commit hashes anywhere on the chapter (owner ask: narrative over hex)', () => {
    // hex tokens ≥7 chars containing at least one digit — the shape of a short SHA.
    // i18n renders empty in this spec, so this guards component-data hashes.
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.match(/\b(?=[0-9a-f]*\d)[0-9a-f]{7,}\b/g)).toBeNull();
  });

  it('mounts the graph map with the real namespace behind it (1→15→130) and the 6-entity lens', () => {
    const topo = fixture.debugElement.query(
      By.directive(GraphTopologyShowcaseComponent),
    ).componentInstance;
    // the drawing and the inspector are pinned in the showcase's own spec;
    // here: it is the same graph the stat row counts, and the map is mounted
    expect(topo.placed.length).toBe(15);
    expect(topo.placed.reduce((n: number, p: { fan: number }) => n + p.fan, 0)).toBe(130);
    expect(topo.stats.find((s: { key: string }) => s.key === 'nodes')?.value).toBe('146');
    expect(fixture.nativeElement.querySelector('[data-testid="graphtopo-svg"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="graphtopo-inspector"]')).toBeTruthy();
    // the 6-entity behavioural lens (Controller/Config/Security/Impl/Diagnostics/Lifecycle)
    expect(topo.roles.map((r: { sym: string }) => r.sym)).toEqual(['C', 'F', 'S', 'I', 'D', 'L']);
    // the "shape of the system" query traverses the two typed edges of the topology
    expect(topo.querySnippet).toContain(
      ':GUIDES]->(e:EntityNavigator)-[:IMPLEMENTS]->(c:ConcreteImpl)',
    );
  });
});
