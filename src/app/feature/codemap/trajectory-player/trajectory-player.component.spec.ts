import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { RECORDED_RUNS } from '../codemap-recordings';
import { TrajectoryPlayerComponent } from './trajectory-player.component';

/**
 * The player replays VERBATIM recorded sessions — these tests pin (a) that the
 * animation actually reaches the fully revealed state, (b) that skip() jumps
 * there instantly, and (c) that the honest run surfaces the consent card and
 * the API trace with its real token receipt. The recordings themselves are
 * data — if a capture is ever re-recorded, tests keep passing because they
 * assert against RECORDED_RUNS, not against copied strings.
 */
describe('TrajectoryPlayerComponent', () => {
  let fixture: ComponentFixture<TrajectoryPlayerComponent>;
  let component: TrajectoryPlayerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TrajectoryPlayerComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrajectoryPlayerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts idle with all three recorded runs as chips', () => {
    expect(component.stage()).toBe('idle');
    const chips = fixture.debugElement.queryAll(By.css('[data-testid^="codemap-player-chip-"]'));
    expect(chips.length).toBe(RECORDED_RUNS.length);
  });

  it('plays an answer run to completion through timed stages', fakeAsync(() => {
    const impact = RECORDED_RUNS.find((r) => r.id === 'impact')!;
    component.play(impact);
    tick(20_000);
    fixture.detectChanges();
    expect(component.stage()).toBe('done');
    expect(component.localShown()).toBe(impact.localSteps.length);
    const answer = fixture.debugElement.query(
      By.css('[data-testid="codemap-player-local-answer"]'),
    );
    expect(answer.nativeElement.textContent).toContain('51 dependency edges');
  }));

  it('skip() reveals the full state instantly', () => {
    const impact = RECORDED_RUNS.find((r) => r.id === 'impact')!;
    component.play(impact);
    component.skip();
    fixture.detectChanges();
    expect(component.stage()).toBe('done');
    expect(component.localShown()).toBe(impact.localSteps.length);
  });

  it('the honest run walks pass -> consent -> API trace with the real receipt', fakeAsync(() => {
    const honest = RECORDED_RUNS.find((r) => r.id === 'honest')!;
    component.play(honest);
    tick(30_000);
    fixture.detectChanges();
    expect(component.stage()).toBe('done');
    expect(fixture.debugElement.query(By.css('[data-testid="codemap-player-pass"]'))).toBeTruthy();
    expect(
      fixture.debugElement.query(By.css('[data-testid="codemap-player-consent"]')),
    ).toBeTruthy();
    const api = fixture.debugElement.query(By.css('[data-testid="codemap-player-api-answer"]'));
    expect(api.nativeElement.textContent).toContain("can't fabricate a rationale");
    expect(component.apiShown()).toBe(honest.api!.steps.length);
  }));

  it('preset input renders a finished run synchronously (fixture path)', () => {
    const preset = TestBed.createComponent(TrajectoryPlayerComponent);
    preset.componentInstance.preset = 'honest';
    preset.detectChanges();
    expect(preset.componentInstance.stage()).toBe('done');
    expect(preset.componentInstance.active().id).toBe('honest');
    expect(
      preset.debugElement.query(By.css('[data-testid="codemap-player-api-answer"]')),
    ).toBeTruthy();
  });

  it('replay restarts the active capture after done', () => {
    const impact = RECORDED_RUNS.find((r) => r.id === 'impact')!;
    component.play(impact);
    component.skip();
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('[data-testid="codemap-player-replay"]')),
    ).toBeTruthy();
    component.replay();
    component.skip();
    fixture.detectChanges();
    expect(component.stage()).toBe('done');
    expect(component.localShown()).toBe(impact.localSteps.length);
  });

  it('every recorded run keeps the verbatim-capture invariants', () => {
    for (const run of RECORDED_RUNS) {
      expect(run.localSteps.length).toBeGreaterThan(0);
      expect(run.terminal === 'answer' || run.terminal === 'pass').toBe(true);
      if (run.terminal === 'pass') {
        expect(run.api).toBeDefined();
        expect(run.api!.tokensIn).toBeGreaterThan(0);
      }
    }
  });
});
