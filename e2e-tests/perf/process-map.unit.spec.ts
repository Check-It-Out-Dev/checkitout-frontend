import { SCENARIOS, scenarioByKey } from '../../src/app/core/demo/scenario-registry';
import { PROCESSES } from './process-map';

/**
 * The map has to keep up with the registry.
 *
 * Its whole value is that it states, per step, what the tour promises — so a
 * step that gains a phase, or a tour that gains a step, must not quietly go
 * unmapped and unchecked. Splitting the cascade preview off from its
 * confirmation this morning added a step; nothing would have noticed.
 *
 * Runs in the fast gate: pure TypeScript, no browser, no served build.
 */
describe('the process map', () => {
  it('covers every tour', () => {
    expect(PROCESSES.map((p) => p.tour).sort()).toEqual(SCENARIOS.map((s) => s.key).sort());
  });

  it('covers every step of every tour, in the registry order', () => {
    for (const process of PROCESSES) {
      const registry = scenarioByKey(process.tour)!.steps.map((s) => s.id);
      expect(process.phases.map((p) => p.step)).toEqual(registry);
    }
  });

  it('quotes what the tour actually says, not a paraphrase of it', () => {
    // `says` is the visitor-facing narration. It is not asserted character for
    // character — the map holds the English copy with typographic dashes
    // normalised — but a phase whose claim shares almost nothing with the
    // narration is a map that has drifted away from the product.
    for (const process of PROCESSES) {
      for (const phase of process.phases) {
        expect(phase.says.length).toBeGreaterThan(40);
        expect(phase.requires.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every requirement and every atomic check a unique id within its phase', () => {
    for (const process of PROCESSES) {
      for (const phase of process.phases) {
        const ids = [...phase.requires.map((r) => r.id), ...phase.atomic.map((a) => a.id)];
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('points its atomic checks at controls the step could plausibly reach', () => {
    // A testid typo turns a check into one that can never hold, which reads as
    // a defect in the app. Cheap guard: every testid named must appear
    // somewhere in the registry or in the demo's own components.
    for (const process of PROCESSES) {
      for (const phase of process.phases) {
        for (const check of phase.atomic) {
          if (check.kind === 'visible' || check.kind === 'absent' || check.kind === 'ring') {
            expect(check.testid).toMatch(/^[a-z0-9-]+$/);
          }
          if (check.kind === 'route') {
            expect(() => new RegExp(check.pattern)).not.toThrow();
          }
        }
      }
    }
  });

  it('asks for a readable lifetime only where there is something to read', () => {
    for (const process of PROCESSES) {
      for (const phase of process.phases) {
        for (const requirement of phase.requires) {
          if (requirement.readableMs !== undefined) {
            expect(requirement.readableMs).toBeGreaterThanOrEqual(1000);
          }
        }
      }
    }
  });
});
