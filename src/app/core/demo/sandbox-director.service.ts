import { isPlatformServer } from '@angular/common';
import {
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SessionStateService } from '../auth/session-state.service';
import { GuideRunnerService } from './guide-runner.service';
import {
  SCENARIOS,
  ScenarioDef,
  ScenarioKey,
  ScenarioStep,
  scenarioByKey,
} from './scenario-registry';
import { resetDemoTourStores } from './demo-fixtures';
import {
  DEMO_PERSONA_KEYS,
  currentDemoRole,
  isDemoMode,
  isDemoSignedIn,
  setDemoRole,
  setDemoSignedIn,
} from './demo-mode';

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

/**
 * How long a step waits for the application to confirm it. Long enough for a
 * mocked round-trip and a render, short enough that a step which is not going
 * to happen says so while the visitor is still looking at it.
 */
const DONE_WAIT_MS = 2500;

export interface SandboxState {
  key: ScenarioKey;
  step: number;
  done: boolean;
}

@Injectable({ providedIn: 'root' })
export class SandboxDirectorService {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStateService);
  private readonly dialog = inject(MatDialog);
  private readonly runner = inject(GuideRunnerService);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));

  private readonly _state = signal<SandboxState | null>(this.restore());

  /** True while the guide is typing and clicking for the visitor. The page is
   * shielded for exactly this long — measured at about 140 ms. */
  readonly performing = signal(false);

  /** True while the guide waits for the application to confirm the step. The
   * page stays live here: the visitor can carry on, and if they finish the
   * step themselves the watcher picks it up. */
  readonly awaiting = signal(false);

  /** Id of the step whose last attempt the application did not confirm. */
  readonly stalled = signal<string | null>(null);

  /** Cancels the watcher that advances when the visitor does a step by hand. */
  private doneWatch: (() => void) | null = null;

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

  /**
   * Set the moment a full boot is decided on. The boot must find the state
   * in sessionStorage, but the page being left must not act on it: with the
   * signal set first, the effect below re-armed the done watch against the
   * 2FA dialog still open on screen, and a replay pressed there walked
   * itself from step 0 to step 2 before the reload landed on step 0.
   */
  private booting = false;

  constructor() {
    // Demo fixtures can advance steps without touching components: a rule
    // dispatches CustomEvent('demo-sandbox', {detail:{id}}) and lands here.
    if (typeof window !== 'undefined') {
      window.addEventListener('demo-sandbox', (e) => {
        const id = (e as CustomEvent<{ id?: string }>).detail?.id;
        if (id) this.notify(id);
      });
    }
    // A page brought back from the back-forward cache is a page from before
    // the tour changed the persona. Its session cache may still say signed
    // out while localStorage says in, and its guide still shows whatever it
    // showed when the tour booted away from it: the hub came back with a
    // 1/5 panel over it, and the next Start bounced to the sign-in screen
    // (owner, 2026-09-07). Nothing a resurrected page holds in memory can be
    // trusted in the demo; it boots again.
    if (typeof window !== 'undefined' && isDemoMode()) {
      window.addEventListener('pageshow', (e) => {
        if ((e as PageTransitionEvent).persisted) this.reloadInPlace();
      });
    }
    // A tour follows the visitor through the app, not out of it: landing on
    // the marketing page or the hub (without a start link) ends it, so the
    // guide and a simulator never float over the public pages.
    const leave = (url: string): void => {
      const [path, query = ''] = url.split('?');
      if (path === '/' || (path === '/demo' && !query.includes('start='))) this.abandon();
    };
    this.router.events
      ?.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        if (this.active()) leave(e.urlAfterRedirects);
      });
    // On a full load the initial navigation has usually finished before this
    // service exists (the landing page is prerendered and hydrated), so the
    // event above never arrives for it — read the settled URL once.
    if (this.router.navigated && this.active()) leave(this.router.url);
    // A visitor who does the step with their own hands should not have to
    // press anything else afterwards: watch for the step's `done` condition
    // and move on when the app shows it happened.
    effect(() => {
      const step = this.step();
      const busy = this.performing();
      untracked(() => this.armDoneWatch(step, busy));
    });
  }

  start(key: ScenarioKey): void {
    // The hub deep-link (/demo?start=…) reaches ngOnInit during SSR too —
    // there is no sessionStorage there and nothing to navigate; the browser
    // boot starts the tour for real.
    if (this.server) return;
    const def = scenarioByKey(key);
    if (!def || !def.steps.length) return;
    this.clearTourArtifacts();
    this.enter(def, { key, step: 0, done: false }, def.steps[0].route);
  }

  /**
   * Demo hooks report a completed user action; advances on id match. A
   * manual step advances too: the simulators' buttons ("Zweryfikuj e-mail",
   * "Wyślij do KSeF", "Gotowe") ARE the action the step describes, and a
   * click that only flipped a status while the guide waited for "Dalej"
   * read as a dead button.
   */
  notify(stepId: string): void {
    const step = this.step();
    if (step && step.id === stepId) {
      this.advance();
    }
  }

  /**
   * The guide's pill: performs the step for the visitor when the step carries
   * a recipe (fills the form, presses the button, fires the simulator), then
   * advances as soon as the app confirms it — the step's `done` condition, or
   * a simulator calling notify() itself (never twice). Nothing here sleeps:
   * the waits resolve on the next DOM mutation.
   *
   * No step reloads the document any more: the checkout that used to hand
   * off through a full page load is a router hop into a simulator (2026-09-07),
   * so every step confirms in this document like any other. The old pre-advance
   * for that reload made every failure a phantom — all three of its clicks
   * landed on controls already on screen, so swallowing them still left the
   * tour narrating an invoice for a purchase nobody made — and is gone with it.
   *
   * Two rules keep a rejected step honest. The shield covers the typing only,
   * not the waiting, so the page is never frozen while the guide hopes. And a
   * step that declares how the application confirms it does not advance
   * without that confirmation — it used to walk on into a narration for a
   * screen that never appeared. A second attempt on the same step advances
   * regardless, so a wrong condition can never trap the visitor.
   */
  async next(): Promise<void> {
    const step = this.step();
    if (!step || this.performing() || this.awaiting()) return;
    if (!step.perform?.length) {
      this.advance();
      return;
    }
    const before = this._state();
    const moved = () =>
      this._state()?.step !== before?.step || this._state()?.done !== before?.done;
    // Read before anything can clear it: advance() resets the stall flag on
    // its way through, and a second attempt must still count as one.
    const retrying = this.stalled() === step.id;

    // Watch for the confirmation BEFORE running the recipe, not after.
    //
    // A `disappears` clause only counts once the element has actually been on
    // screen — otherwise a step arming on a route that has not rendered reads
    // as already done. But the recipe is precisely what takes that element off
    // screen, so a watcher built afterwards asks "was it ever there?" of a
    // page where it no longer is, and the answer is no forever: `decide-applicant`
    // clicks Accept and then waits for an Accept button that its own click
    // removed a moment earlier. Every such step stalled on its first press and
    // needed a second, which the retry escape quietly supplied.
    //
    // Started here, the watch is live across the recipe: it sees the element
    // while it is still there, and it sees the one `cascade-confirm` only
    // creates halfway through.
    let happened = false;
    const stop = step.done
      ? this.runner.watch(this.runner.doneWatcher(step.done), () => {
          happened = true;
        })
      : null;

    try {
      this.performing.set(true);
      try {
        await this.runner.run(step.perform);
      } finally {
        this.performing.set(false);
      }
      if (!step.done && !step.sim) {
        if (!moved()) this.advance();
        return;
      }

      this.awaiting.set(true);
      try {
        if (step.sim && !step.done) {
          // A simulator's own button IS the action the step describes, and it
          // calls notify() when it fires — so the step moving is the confirmation
          // here, exactly as a declared `done` is elsewhere. This used to advance
          // regardless after the wait, which meant a click that silently failed
          // still carried the tour on to narrate something that had not happened:
          // hiding `ksef-sim-done` and pressing once completed the whole tour.
          await this.runner.waitUntil(moved, 1500);
          if (moved()) return;
          if (retrying) {
            this.advance();
            return;
          }
          this.stalled.set(step.id);
          return;
        }
        // The watch above may already have fired — a fast recipe confirms
        // itself before this line is reached — so ask it first and only wait
        // if it has not.
        const confirmed =
          happened || (await this.runner.waitUntil(() => moved() || happened, DONE_WAIT_MS));
        if (moved()) return;
        if (confirmed) {
          this.advance();
          return;
        }
        // The application did not do what the step describes. Stay here so the
        // narration keeps matching the screen — unless this already failed once.
        if (retrying) {
          this.advance();
          return;
        }
        this.stalled.set(step.id);
      } finally {
        this.awaiting.set(false);
      }
    } finally {
      stop?.();
    }
  }

  /** Guide "next" — also moves routes between steps. */
  advance(): void {
    const s = this._state();
    const d = this.scenario();
    if (!s || !d || s.done) return;
    this.stalled.set(null);
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
    // The reload restores the in-memory fixtures, but sessionStorage is exactly
    // what a reload does NOT clear — so "Restart" used to hand the replay every
    // artifact the last run left behind.
    this.clearTourArtifacts();
    // And the persona is primed for the start route exactly as start() primes
    // it. A replay from the recap is signed in by the very tour it replays;
    // reloading the sign-in route with the session still on had the guard
    // bounce it into the marketplace, with the guide narrating step 1 of 5
    // over a page the step is not about (owner's screenshot, 2026-09-07).
    this.enter(d, { key: d.key, step: 0, done: false }, d.startRoute, true);
  }

  /**
   * Everything a finished run leaves lying around.
   *
   * A replay has to begin from the canonical state, and each leftover breaks a
   * specific beat if it does not: the stored plan already satisfies the
   * checkout step's `done`, so the upgrade is skipped rather than performed;
   * the TOTP attempt counter is capped at 2, so the phone's *first* code is
   * accepted, the admin is signed in on the spot, and the tour goes on asking
   * for a code from inside the app it just let them into — that one could even
   * walk the tour forward with nothing pressed at all.
   *
   * Rather than name the three keys that have bitten us so far, sweep the
   * prefix. Everything the demo writes is `demo…`-keyed, in both storages, and
   * a per-key list is a list that the next demo feature forgets to join:
   * `demoCollabRequests` sat in localStorage accumulating twenty stale
   * collaboration requests across every run precisely because nobody thought
   * to add it. The persona keys are the deliberate exception — `start()` is
   * about to set them for the scenario it is opening.
   *
   * Everything NOT `demo`-prefixed is the visitor's, not ours: the language
   * choice, the theme, the consent record, a dismissed banner, a saved filter.
   * A tour must not reach into any of it.
   */
  private clearTourArtifacts(): void {
    const keep = new Set([...DEMO_PERSONA_KEYS, STATE_KEY]);
    for (const store of this.demoStores()) {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith('demo') && !keep.has(key)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    }
    resetDemoTourStores();
  }

  /** Both web storages, when there are any — there is no SSR equivalent. */
  private demoStores(): Storage[] {
    const stores: Storage[] = [];
    if (typeof sessionStorage !== 'undefined') stores.push(sessionStorage);
    if (typeof localStorage !== 'undefined') stores.push(localStorage);
    return stores;
  }

  /**
   * Leaving is leaving. The run's state and artifacts go, and so does the
   * session the tour signed the visitor into: the hub, the landing page and
   * the next start all begin where a first visit does. Left signed in, the
   * landing bounced straight back into the app and the brand mark looked
   * dead. A session flip needs a full boot — the session cache is primed by
   * /users/me at startup — so a signed-in exit reloads at `to`; a signed-out
   * one is a plain hop.
   */
  exit(to = '/demo'): void {
    this.abandon();
    this.clearTourArtifacts();
    const wasSignedIn = isDemoSignedIn();
    setDemoSignedIn(false);
    if (wasSignedIn) {
      this.reload(to);
      return;
    }
    void this.router.navigateByUrl(to);
  }

  /** Watch the current step's done condition (cancelling the previous one).
   * Nothing is armed while a recipe runs — the recipe's own wait owns that. */
  private armDoneWatch(step: ScenarioStep | null, busy: boolean): void {
    this.doneWatch?.();
    this.doneWatch = null;
    if (this.server || this.booting || busy || !step?.done) return;
    const at = this._state()?.step;
    const pred = this.runner.doneWatcher(step.done);
    this.doneWatch = this.runner.watch(pred, () => {
      if (this._state()?.step === at && !this.performing()) this.advance();
    });
  }

  /** Drop the tour where the visitor stands: state, guide, any open dialog. */
  private abandon(): void {
    this.doneWatch?.();
    this.doneWatch = null;
    this.stalled.set(null);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STATE_KEY);
    this._state.set(null);
    // A tour left mid-dialog (the 2FA prompt is disableClose) would keep the
    // dialog over the page.
    this.dialog.closeAll();
  }

  /** Recap's "next tour" — chains runs without visiting the hub. */
  startNext(key: ScenarioKey): void {
    this.start(key);
  }

  /**
   * Prime the persona for the scenario, then go. A scenario that plays on
   * the auth screens (admin-2fa starts on /auth/sign-in) needs the persona
   * signed OUT — the sign-in page bounces authenticated users; every other
   * scenario needs it signed IN. A role switch or a session flip re-primes
   * the session cache through a full boot (the /users/me fixture reads
   * localStorage on every probe); otherwise it is a plain router hop.
   */
  private enter(def: ScenarioDef, state: SandboxState, route: string, reboot = false): void {
    const wantsSignedIn = !route.startsWith('/auth/');
    const stored = currentDemoRole() !== def.role || isDemoSignedIn() !== wantsSignedIn;
    // The page's own memory can lag the store: a tab brought back from the
    // back-forward cache, or a second tab, still holds the session it booted
    // with. A plain hop from such a page meets the auth guard with the wrong
    // answer — the sign-in screen, with a 1/5 panel over it (owner,
    // 2026-09-07). Only a page whose cached session already IS the persona
    // may hop; every other one boots.
    const cached = this.session.user();
    const stale = wantsSignedIn ? cached?.userType?.value !== def.role : cached !== null;
    const reprime = stored || stale;
    setDemoRole(def.role);
    setDemoSignedIn(wantsSignedIn);
    // `reboot`: a replay wants the full boot regardless — the in-memory
    // fixture stores only re-seed on one. Decided BEFORE the state is written,
    // so the watch does not arm on a page that is on its way out.
    this.booting = reprime || reboot;
    this.persist(state);
    if (this.booting) {
      this.reload(route);
      return;
    }
    void this.router.navigateByUrl(route);
  }

  /** Full boot — seam for tests (jsdom cannot navigate). */
  private reload(url: string): void {
    window.location.href = url;
  }

  /** The same page, booted again — seam for tests. */
  private reloadInPlace(): void {
    window.location.reload();
  }

  private persist(state: SandboxState): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
    this._state.set(state);
  }

  private restore(): SandboxState | null {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SandboxState;
      const def = scenarioByKey(parsed.key);
      if (!def) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
