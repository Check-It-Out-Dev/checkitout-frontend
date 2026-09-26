import { SCENARIOS } from './scenario-registry';
import { actsOnTarget, hintKeyFor } from './guide-hint';

/**
 * E-PROMISE, swept — the guide must not say pressing will do something the beat
 * cannot do.
 *
 * The panel told every beat the same thing: "kliknij podświetlony element —
 * wykona ten krok w aplikacji". Two reviewers found it false in two different
 * shapes, on two different tours, and the fix at the time was to make the
 * component choose between three sentences. That closes the two beats that were
 * filmed. This closes the class: every step of every scenario, including the
 * ones no film reaches and the ones added next month.
 *
 * The register calls a class closed only when it has been swept across all seven
 * tours — never fixed where it was seen and left there (methodology §13).
 */
describe('E-PROMISE — what the guide may promise about a step', () => {
  const steps = SCENARIOS.flatMap((s) => s.steps.map((step) => [s.key, step] as const));

  it('has a step to check in every scenario', () => {
    expect(SCENARIOS.length).toBe(7);
    expect(steps.length).toBeGreaterThanOrEqual(24);
  });

  it.each(steps)('%s/%#: the footer matches what the beat can actually do', (_key, step) => {
    const hint = hintKeyFor(step, true);
    switch (actsOnTarget(step)) {
      case 'click':
        // Something a press really does perform in the application.
        expect(hint).toBe('demo.guide.sandboxHint');
        break;
      case 'fill':
        // Clicking an input does nothing at all; the visitor types, or the
        // guide types for them.
        expect(hint).toBe('demo.guide.fillHint');
        break;
      default:
        // A reading beat: the ring is around something already done and the
        // press only moves the tour on.
        expect(hint).toBe('demo.guide.lookHint');
    }
  });

  it('never promises an action on a beat with no recipe at all', () => {
    const reading = steps.filter(([, step]) => !step.perform?.length);
    expect(reading.length).toBeGreaterThan(0); // the class needs instances to be worth sweeping
    for (const [key, step] of reading) {
      expect(`${key}/${step.id}: ${hintKeyFor(step, true)}`).not.toContain('sandboxHint');
    }
  });

  it('with nothing on screen to point at, the panel says so', () => {
    for (const [, step] of steps) {
      expect(hintKeyFor(step, false)).toBe('demo.guide.readHint');
    }
  });

  /**
   * The planted defect. A sweep that has never caught anything has not been
   * shown to work, and "nothing found" is only worth something once the
   * instrument has been made to find something (methodology §13).
   */
  it('catches a beat that rings a field and claims a click will do it', () => {
    const planted = {
      id: 'planted',
      route: '/x',
      advanceOn: 'manual' as const,
      target: '[data-testid="a-field"]',
      perform: [{ kind: 'fill' as const, selector: '[data-testid="a-field"]', value: 'whatever' }],
    };
    expect(actsOnTarget(planted)).toBe('fill');
    expect(hintKeyFor(planted, true)).not.toBe('demo.guide.sandboxHint');

    const alsoPlanted = { ...planted, perform: undefined };
    expect(actsOnTarget(alsoPlanted)).toBe('none');
    expect(hintKeyFor(alsoPlanted, true)).toBe('demo.guide.lookHint');
  });
});
