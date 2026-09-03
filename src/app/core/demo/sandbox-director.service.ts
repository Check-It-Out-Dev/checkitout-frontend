import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  SCENARIOS,
  ScenarioDef,
  ScenarioKey,
  ScenarioStep,
  scenarioByKey,
} from './scenario-registry';
import { DEMO_PLAN_KEY, DEMO_STEP_UP_KEY, resetDemoTourStores } from './demo-fixtures';
import { currentDemoRole, setDemoRole } from './demo-mode';

/**
 * Sandbox director — the step machine behind the guided demos (ported
 * from the legacy demo build; BehaviorSubject state re-expressed as
 * signals, the greenfield idiom).
 *
 * Holds the active scenario + step index in sessionStorage
 * (`demoSandbox`) so a refresh resumes in place. Steps advance from the
 * guide's "next" (manual) or when a demo-mode hook inside a real
 * component calls notify(stepId) (event steps — follow-up slice).
 *
 * Role handling: a scenario declares the persona it plays as. If the
 * current demoRole differs, start()/reset() persist FIRST and switch via
 * a full reload (the /users/me fixture reads localStorage at boot).
 * Reset is a full reload on purpose — in-memory fixture stores re-seed.
 */
const STATE_KEY = 'demoSandbox';

export interface SandboxState {
  key: ScenarioKey;
  step: number;
  done: boolean;
}

@Injectable({ providedIn: 'root' })
export class SandboxDirectorService {
  private readonly router = inject(Router);

  private readonly _state = signal<SandboxState | null>(this.restore());

  /** Active scenario definition (null = no tour running). */
  readonly scenario = computed<ScenarioDef | null>(() => {
    const s = this._state();
    return s ? (scenarioByKey(s.key) ?? null) : null;
  });

  /** Current step (null when idle or on the recap). */
  readonly step = computed<ScenarioStep | null>(() => {
    const s = this._state();
    const d = this.scenario();
    if (!s || !d || s.done) return null;
    return d.steps[s.step] ?? null;
  });

  /** Zero-based step index + recap flag for the guide's progress UI. */
  readonly state = computed(() => this._state());

  /** True when any scenario is running (guide overlay shows). */
  readonly active = computed(() => this._state() !== null);

  readonly all = SCENARIOS;

  constructor() {
    // Demo fixtures can advance steps without touching components: a rule
    // dispatches CustomEvent('demo-sandbox', {detail:{id}}) and lands here.
    if (typeof window !== 'undefined') {
      window.addEventListener('demo-sandbox', (e) => {
        const id = (e as CustomEvent<{ id?: string }>).detail?.id;
        if (id) this.notify(id);
      });
    }
  }

  start(key: ScenarioKey): void {
    const def = scenarioByKey(key);
    if (!def || !def.steps.length) return;
    // Fresh story per run — the upgrade's plan choice, the step-up code and
    // the cascade's deleted-campaign set are per-tour artifacts; a replay
    // must begin from the canonical state (else byId()'s fallback serves a
    // different campaign under a deleted id's route).
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DEMO_PLAN_KEY);
      sessionStorage.removeItem(DEMO_STEP_UP_KEY);
    }
    resetDemoTourStores();
    this.persist({ key, step: 0, done: false });
    this.enter(def, def.steps[0].route);
  }

  /** Demo hooks report a completed user action; advances on id match. */
  notify(stepId: string): void {
    const step = this.step();
    if (step && step.advanceOn === 'event' && step.id === stepId) {
      this.advance();
    }
  }

  /** Guide "next" — also moves routes between steps. */
  advance(): void {
    const s = this._state();
    const d = this.scenario();
    if (!s || !d || s.done) return;
    const next = s.step + 1;
    if (next >= d.steps.length) {
      this.persist({ ...s, done: true });
      return; // guide flips to the recap
    }
    const from = d.steps[s.step].route;
    const to = d.steps[next].route;
    this.persist({ ...s, step: next });
    if (to !== from) {
      void this.router.navigateByUrl(to);
    }
  }

  /** Fresh run: fixture seeds restored via full reload. */
  reset(): void {
    const d = this.scenario();
    if (!d) return;
    this.persist({ key: d.key, step: 0, done: false });
    window.location.href = d.startRoute;
  }

  exit(): void {
    sessionStorage.removeItem(STATE_KEY);
    this._state.set(null);
    void this.router.navigateByUrl('/demo');
  }

  /** Recap's "next tour" — chains runs without visiting the hub. */
  startNext(key: ScenarioKey): void {
    this.start(key);
  }

  private enter(def: ScenarioDef, route: string): void {
    if (currentDemoRole() !== def.role) {
      setDemoRole(def.role);
      window.location.href = route; // full boot re-primes the demo persona
      return;
    }
    void this.router.navigateByUrl(route);
  }

  private persist(state: SandboxState): void {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    this._state.set(state);
  }

  private restore(): SandboxState | null {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SandboxState;
      return scenarioByKey(parsed.key) ? parsed : null;
    } catch {
      return null;
    }
  }
}
