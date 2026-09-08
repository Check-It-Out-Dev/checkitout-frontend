jest.mock('./demo-mode', () => ({
  ...jest.requireActual('./demo-mode'),
  isDemoMode: () => true,
}));

import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { SessionStateService } from '../auth/session-state.service';
import { currentDemoRole, isDemoSignedIn } from './demo-mode';
import { GuideRunnerService } from './guide-runner.service';
import { SandboxDirectorService } from './sandbox-director.service';
import { SCENARIOS, scenarioByKey } from './scenario-registry';

describe('SandboxDirectorService', () => {
  let service: SandboxDirectorService;
  let router: {
    navigateByUrl: jest.Mock;
    events: Subject<unknown>;
    navigated?: boolean;
    url?: string;
  };
  let runner: {
    run: jest.Mock;
    waitUntil: jest.Mock;
    isDone: jest.Mock;
    doneWatcher: jest.Mock;
    watch: jest.Mock;
  };
  let dialog: { closeAll: jest.Mock };
  /** What the page's session cache holds. By default it agrees with the
   * persona store, the way a freshly booted page does. */
  let cachedUser: () => { userType?: { value: string } } | null;
  /** Done-condition watchers the director armed, newest last. */
  let watchers: { pred: () => boolean; onTrue: () => void }[];

  /** A scenario whose role matches the default persona (COMPANY) — start()
   *  must NOT take the full-reload role-switch branch in tests. */
  const companyScenario = SCENARIOS.find((s) => s.role === 'COMPANY')!;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    // Persona already signed in — an app scenario then needs no re-prime.
    localStorage.setItem('demoSession', '1');
    router = { navigateByUrl: jest.fn().mockResolvedValue(true), events: new Subject<unknown>() };
    watchers = [];
    runner = {
      run: jest.fn().mockResolvedValue(true),
      waitUntil: jest.fn(async (pred: () => boolean) => pred()),
      isDone: jest.fn(() => true),
      // The real one gates a `disappears` clause on having seen the element and
      // then defers to isDone, so the mock defers too — otherwise every test
      // that drives a done condition through isDone would silently stop
      // reaching the code it is about.
      doneWatcher: jest.fn((done: unknown) => () => runner.isDone(done) as boolean),
      watch: jest.fn((pred: () => boolean, onTrue: () => void) => {
        watchers.push({ pred, onTrue });
        // The real one evaluates immediately and fires if the condition already
        // holds — which is the whole point of arming it before a recipe runs.
        // A mock that only records was faithful enough until then.
        if (pred()) onTrue();
        return () => undefined;
      }),
    };
    dialog = { closeAll: jest.fn() };
    cachedUser = () => (isDemoSignedIn() ? { userType: { value: currentDemoRole() } } : null);
    TestBed.configureTestingModule({
      providers: [
        SandboxDirectorService,
        { provide: Router, useValue: router },
        { provide: GuideRunnerService, useValue: runner },
        { provide: MatDialog, useValue: dialog },
        { provide: SessionStateService, useValue: { user: () => cachedUser() } },
      ],
    });
    service = TestBed.inject(SandboxDirectorService);
  });

  it('is idle until started', () => {
    expect(service.active()).toBe(false);
    expect(service.scenario()).toBeNull();
    expect(service.step()).toBeNull();
  });

  it('start() signs a signed-out persona in for an app scenario via a full boot', () => {
    localStorage.removeItem('demoSession');
    const reload = jest
      .spyOn(service as unknown as { reload(url: string): void }, 'reload')
      .mockImplementation(() => undefined);

    service.start(companyScenario.key);

    expect(localStorage.getItem('demoSession')).toBe('1');
    expect(localStorage.getItem('demoRole')).toBe('COMPANY');
    expect(reload).toHaveBeenCalledWith(companyScenario.steps[0].route);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('start() signs the persona OUT for the admin-2fa scenario (it plays on /auth/sign-in)', () => {
    localStorage.setItem('demoRole', 'ADMIN');
    const reload = jest
      .spyOn(service as unknown as { reload(url: string): void }, 'reload')
      .mockImplementation(() => undefined);

    service.start('admin-2fa');

    expect(localStorage.getItem('demoSession')).toBe('0');
    expect(localStorage.getItem('demoRole')).toBe('ADMIN');
    expect(reload).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('start() boots when the page remembers a different session than the store', () => {
    // The store says the company persona is signed in, but this page still
    // holds the signed-out session it was frozen with.
    cachedUser = () => null;
    const reload = jest
      .spyOn(service as unknown as { reload(url: string): void }, 'reload')
      .mockImplementation(() => undefined);

    service.start(companyScenario.key);

    expect(reload).toHaveBeenCalledWith(companyScenario.steps[0].route);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('start() enters step 0 and navigates to its route', () => {
    service.start(companyScenario.key);

    expect(service.active()).toBe(true);
    expect(service.step()?.id).toBe(companyScenario.steps[0].id);
    expect(router.navigateByUrl).toHaveBeenCalledWith(companyScenario.steps[0].route);
  });

  it('start() resets per-tour story state (plan, step-up code, TOTP attempt)', () => {
    sessionStorage.setItem('demoPlan', 'ENTERPRISE');
    sessionStorage.setItem('demoStepUpCode', '123456');
    sessionStorage.setItem('demoTotp', JSON.stringify({ attempt: 2, code: '408952' }));

    service.start(companyScenario.key);

    expect(sessionStorage.getItem('demoPlan')).toBeNull();
    expect(sessionStorage.getItem('demoStepUpCode')).toBeNull();
    expect(sessionStorage.getItem('demoTotp')).toBeNull();
  });

  /**
   * The TOTP counter is capped at 2 and the verify fixture accepts any code
   * once it is there. Carried into a replay, the admin's FIRST code is
   * accepted: they are signed in on the spot, the app navigates off the
   * sign-in page, and the tour — still waiting for the refusal that teaches
   * the beat — goes on asking for a code from inside the app it just let
   * them into.
   */
  it('start() sweeps demo leftovers out of localStorage too, and leaves the visitor alone', () => {
    // `demoCollabRequests` accumulated twenty stale requests across runs
    // because the reset named keys one at a time and nobody added it.
    localStorage.setItem('demoCollabRequests', JSON.stringify([{ id: 1 }]));
    localStorage.setItem('demoSomethingNobodyHasWrittenYet', 'x');
    // …and these are the visitor's, not the tour's
    localStorage.setItem('cio-lang', 'en');
    localStorage.setItem('cio.theme', 'dark');
    localStorage.setItem('cio.consent.v1', '{"analytics":false}');
    localStorage.setItem('cio.shell.trialOfferDismissed', '1');

    service.start(companyScenario.key);

    expect(localStorage.getItem('demoCollabRequests')).toBeNull();
    expect(localStorage.getItem('demoSomethingNobodyHasWrittenYet')).toBeNull();
    expect(localStorage.getItem('cio-lang')).toBe('en');
    expect(localStorage.getItem('cio.theme')).toBe('dark');
    expect(localStorage.getItem('cio.consent.v1')).toBe('{"analytics":false}');
    expect(localStorage.getItem('cio.shell.trialOfferDismissed')).toBe('1');
  });

  it('start() keeps the persona it is about to set', () => {
    // both begin with `demo`, and both are the scenario's own doing
    service.start(companyScenario.key);

    expect(localStorage.getItem('demoRole')).not.toBeNull();
    expect(localStorage.getItem('demoSession')).not.toBeNull();
  });

  it('reset() clears the same artifacts — a reload does not empty sessionStorage', () => {
    service.start(companyScenario.key);
    sessionStorage.setItem('demoPlan', 'ENTERPRISE');
    sessionStorage.setItem('demoStepUpCode', '123456');
    sessionStorage.setItem('demoTotp', JSON.stringify({ attempt: 2, code: '408952' }));

    service.reset();

    expect(sessionStorage.getItem('demoPlan')).toBeNull();
    expect(sessionStorage.getItem('demoStepUpCode')).toBeNull();
    expect(sessionStorage.getItem('demoTotp')).toBeNull();
  });

  it('advance() walks every step and lands on the recap (done)', () => {
    service.start(companyScenario.key);
    for (let i = 0; i < companyScenario.steps.length; i++) service.advance();

    expect(service.state()?.done).toBe(true);
    expect(service.step()).toBeNull(); // recap — no current step
    expect(service.active()).toBe(true); // guide still visible for the recap
  });

  it('persists progress to sessionStorage (reload-resume contract)', () => {
    service.start(companyScenario.key);
    service.advance();

    const raw = sessionStorage.getItem('demoSandbox');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({ key: companyScenario.key, step: 1, done: false });
  });

  it('exit() clears state, signs the persona out and boots to the hub when the tour had signed it in', () => {
    const reload = jest
      .spyOn(service as unknown as { reload(url: string): void }, 'reload')
      .mockImplementation(() => undefined);
    service.start(companyScenario.key); // an app scenario: the persona is signed in
    sessionStorage.setItem('demoTotp', JSON.stringify({ attempt: 2, code: '408952' }));
    reload.mockClear();
    router.navigateByUrl.mockClear();

    service.exit();

    expect(service.active()).toBe(false);
    expect(sessionStorage.getItem('demoSandbox')).toBeNull();
    expect(sessionStorage.getItem('demoTotp')).toBeNull();
    expect(localStorage.getItem('demoSession')).toBe('0');
    // A session flip is a full boot — the session cache is primed at startup.
    expect(reload).toHaveBeenCalledWith('/demo');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('exit() from a signed-out tour is a plain hop, and carries its destination', () => {
    jest
      .spyOn(service as unknown as { reload(url: string): void }, 'reload')
      .mockImplementation(() => undefined);
    service.start('admin-2fa'); // plays on /auth/sign-in: the persona is signed out
    router.navigateByUrl.mockClear();

    service.exit('/technical-survey/security#auth-depth');

    expect(localStorage.getItem('demoSession')).toBe('0');
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/technical-survey/security#auth-depth');
  });

  it('reset() primes the persona for the start route — a replay from a signed-in recap boots signed out', () => {
    const reload = jest
      .spyOn(service as unknown as { reload(url: string): void }, 'reload')
      .mockImplementation(() => undefined);
    service.start('admin-2fa');
    for (let i = 0; i < 5; i++) service.advance();
    expect(service.state()?.done).toBe(true);
    localStorage.setItem('demoSession', '1'); // the tour signed the admin in
    reload.mockClear();

    service.reset();

    expect(localStorage.getItem('demoSession')).toBe('0');
    expect(reload).toHaveBeenCalledWith('/auth/sign-in');
    expect(service.state()).toMatchObject({ key: 'admin-2fa', step: 0, done: false });
  });

  it('notify() advances the current step on a matching id — manual steps included', () => {
    service.start(companyScenario.key);
    const before = service.state()?.step ?? 0;
    // A simulator's button IS the action a manual step describes: the click
    // must move the tour on, not leave the reader to press "Dalej" as well.
    service.notify(companyScenario.steps[0].id);
    expect(service.state()?.step).toBe(before + 1);
  });

  it('notify() ignores an id that is not the current step', () => {
    service.start(companyScenario.key);
    const before = service.state()?.step;
    service.notify('not-the-current-step');
    expect(service.state()?.step).toBe(before);
  });

  describe('next() — "Dalej" performs the step for the visitor', () => {
    it('advances a step without a recipe straight away', async () => {
      service.start('company-campaign');
      // to the last beat, which is display-only. Counted from the tour rather
      // than hard-coded: it was two advances until the day the campaign tour
      // grew a publish beat and a beat that holds on the published page.
      const last = (service.scenario()?.steps.length ?? 1) - 1;
      for (let i = 0; i < last; i++) service.advance();
      expect(service.step()?.perform).toBeUndefined();

      await service.next();

      expect(runner.run).not.toHaveBeenCalled();
      expect(service.state()?.done).toBe(true);
    });

    it('runs the recipe, then advances', async () => {
      service.start(companyScenario.key);
      const first = service.step()!;
      expect(first.perform?.length).toBeGreaterThan(0);

      await service.next();

      expect(runner.run).toHaveBeenCalledWith(first.perform);
      expect(service.state()?.step).toBe(1);
      expect(service.performing()).toBe(false);
    });

    it('does not advance twice when the recipe itself made the simulator notify', async () => {
      service.start('nip-to-ksef');
      service.advance();
      service.advance(); // → verify-mail (sim step)
      const step = service.step()!;
      expect(step.sim).toBe('inbox-verify');
      runner.run.mockImplementation(async () => {
        service.notify(step.id); // the inbox CTA reports the action
        return true;
      });

      await service.next();

      expect(service.state()?.step).toBe(3);
    });

    /**
     * The simulator's own button is what confirms a sim step — it calls
     * notify() when it fires. So a press whose click never landed is a step
     * that did not happen, and the tour used to carry on anyway: hiding
     * `ksef-sim-done` on the live demo and pressing once completed the whole
     * tour, narrating a KSeF registration that never took place.
     */
    it('a sim step whose simulator never fires stays put and says so', async () => {
      service.start('nip-to-ksef');
      service.advance();
      service.advance(); // → verify-mail (sim step, no `done`)
      const step = service.step()!;
      expect(step.sim).toBeTruthy();
      expect(step.done).toBeUndefined();
      runner.run.mockResolvedValue(true); // the recipe "ran" but nothing notified

      await service.next();

      expect(service.state()?.step).toBe(2);
      expect(service.stalled()).toBe(step.id);
    });

    it('a second press on a stalled sim step moves on regardless', async () => {
      service.start('nip-to-ksef');
      service.advance();
      service.advance();
      runner.run.mockResolvedValue(true);

      await service.next(); // stalls
      await service.next(); // the visitor insists

      expect(service.state()?.step).toBe(3);
      expect(service.stalled()).toBeNull();
    });

    it('the checkout step whose recipe did nothing holds and says why', async () => {
      service.start('nip-to-ksef');
      const def = scenarioByKey('nip-to-ksef')!;
      const at = def.steps.findIndex((st) => st.id === 'upgrade-confirm');
      for (let i = 0; i < at; i++) service.advance();
      runner.run.mockResolvedValue(false); // every click swallowed
      runner.isDone.mockReturnValue(false);

      await service.next();

      expect(service.state()?.step).toBe(at);
      expect(service.stalled()).toBe('upgrade-confirm');
    });

    /**
     * The one the fault sweep found. Every control the checkout recipe reaches
     * for is on screen, so swallowing all three clicks still leaves the runner
     * reporting success. Only the purchase is missing, and the stored plan is
     * what says so.
     */
    it('the checkout step whose recipe ran but changed nothing holds too', async () => {
      service.start('nip-to-ksef');
      const def = scenarioByKey('nip-to-ksef')!;
      const at = def.steps.findIndex((st) => st.id === 'upgrade-confirm');
      for (let i = 0; i < at; i++) service.advance();
      runner.run.mockResolvedValue(true); // every click landed on something
      runner.isDone.mockReturnValue(false); // no plan was ever stored

      await service.next();

      expect(service.state()?.step).toBe(at);
      expect(service.stalled()).toBe('upgrade-confirm');
    });

    it('a second press on the stalled checkout step goes through', async () => {
      service.start('nip-to-ksef');
      const def = scenarioByKey('nip-to-ksef')!;
      const at = def.steps.findIndex((st) => st.id === 'upgrade-confirm');
      for (let i = 0; i < at; i++) service.advance();
      runner.run.mockResolvedValue(true);
      runner.isDone.mockReturnValue(false);

      await service.next(); // stalls
      await service.next(); // the visitor insists

      expect(service.state()?.step).toBe(at + 1);
    });

    /** The reload path itself: whoever bought the tier, landing back with the
     *  plan stored means that beat is over. */
    it('the checkout step whose recipe worked stays advanced', async () => {
      service.start('nip-to-ksef');
      const def = scenarioByKey('nip-to-ksef')!;
      const at = def.steps.findIndex((st) => st.id === 'upgrade-confirm');
      for (let i = 0; i < at; i++) service.advance();
      runner.run.mockResolvedValue(true);

      await service.next();

      expect(service.state()?.step).toBe(at + 1);
      expect(service.stalled()).toBeNull();
    });

    /**
     * The mirror of the gate above, and the reason it has to be armed early.
     *
     * `decide-applicant` clicks Accept and then waits for the Accept button to
     * be gone. Asked after the recipe, the gate can never open — the button it
     * needs to have seen was removed by the very click it is confirming — so
     * the step stalled on its first press every time and only the retry escape
     * carried it. Watched from before the recipe, it sees the button, then sees
     * it go.
     */
    it('confirms a step whose own recipe removes the element it waits for', async () => {
      service.start('company-campaign');
      const def = scenarioByKey('company-campaign')!;
      const at = def.steps.findIndex((st) => st.done?.disappears);
      expect(at).toBeGreaterThan(-1);
      for (let i = 0; i < at; i++) service.advance();

      // present when the step arms, gone once the recipe has clicked it
      let present = true;
      runner.isDone.mockImplementation(() => !present);
      runner.doneWatcher.mockImplementation((done: unknown) => {
        let seen = false;
        return () => {
          if (!seen) {
            if (present) seen = true;
            return false;
          }
          return runner.isDone(done) as boolean;
        };
      });
      runner.run.mockImplementation(async () => {
        present = false;
        watchers.filter((w) => w.pred()).forEach((w) => w.onTrue());
        return true;
      });

      await service.next();

      expect(service.state()?.step).toBe(at + 1);
      expect(service.stalled()).toBeNull();
    });

    /**
     * A `disappears` clause is only meaningful once the element has been on
     * screen. `cascade-confirm` waits for the dialog its own recipe opens to go
     * away, so asked bluntly the answer is yes before anything has happened.
     * The watcher already gated that; the pill press has to use the same gate.
     */
    it('the pill press gates a done condition the same way the watcher does', async () => {
      service.start('admin-ops');
      const def = scenarioByKey('admin-ops')!;
      // by shape, not by counting: the tour gained a step when the cascade
      // preview was split off, and a hard-coded index would have quietly
      // pointed at a different beat
      const at = def.steps.findIndex((st) => st.done?.disappears);
      expect(at).toBeGreaterThan(0);
      for (let i = 0; i < at; i++) service.advance();
      const step = service.step()!;
      expect(step.done?.disappears).toBeDefined();

      await service.next();

      expect(runner.doneWatcher).toHaveBeenCalledWith(step.done);
    });

    it('waits for the app to confirm the step before advancing', async () => {
      service.start('nip-to-ksef'); // nip-lookup: done = the confirm card appears
      const step = service.step()!;
      expect(step.done).toBeDefined();
      // The confirmation is watched from before the recipe runs, so the arrival
      // of the company card is a watcher firing, not a predicate flipping under
      // a wait: the recipe finishes and the step is already confirmed.
      let confirmed = false;
      runner.isDone.mockImplementation(() => confirmed);
      runner.run.mockImplementation(async () => {
        confirmed = true; // the company card arrives while the recipe runs
        watchers.filter((w) => w.pred()).forEach((w) => w.onTrue());
        return true;
      });

      await service.next();

      expect(service.state()?.step).toBe(1);
    });

    it('shields the page for the typing only, not for the waiting', async () => {
      service.start('nip-to-ksef');
      const seen: { performing: boolean; awaiting: boolean }[] = [];
      runner.isDone.mockReturnValue(false);
      runner.run.mockImplementation(async () => {
        seen.push({ performing: service.performing(), awaiting: service.awaiting() });
        return true;
      });
      runner.waitUntil.mockImplementation(async (pred: () => boolean) => {
        seen.push({ performing: service.performing(), awaiting: service.awaiting() });
        return pred();
      });

      await service.next();

      expect(seen).toEqual([
        { performing: true, awaiting: false }, // typing: page held
        { performing: false, awaiting: true }, // waiting: page live again
      ]);
      expect(service.performing()).toBe(false);
      expect(service.awaiting()).toBe(false);
    });

    it('a step the application never confirms stays put and says so', async () => {
      service.start('nip-to-ksef'); // nip-lookup declares a done condition
      const step = service.step()!;
      runner.isDone.mockReturnValue(false);

      await service.next();

      expect(service.state()?.step).toBe(0); // the narration still matches the screen
      expect(service.stalled()).toBe(step.id);
    });

    it('a second attempt on a stalled step moves on regardless', async () => {
      service.start('nip-to-ksef');
      runner.isDone.mockReturnValue(false);

      await service.next(); // stalls
      await service.next(); // the visitor insists

      expect(service.state()?.step).toBe(1);
      expect(service.stalled()).toBeNull();
    });

    it('ignores a second press while a recipe is running', async () => {
      service.start(companyScenario.key);
      let release!: () => void;
      runner.run.mockImplementation(() => new Promise<boolean>((r) => (release = () => r(true))));

      const firstPress = service.next();
      await service.next(); // no-op: performing
      release();
      await firstPress;

      expect(runner.run).toHaveBeenCalledTimes(1);
      expect(service.state()?.step).toBe(1);
    });
  });

  describe('a step done by hand', () => {
    it('advances the tour without touching the guide', () => {
      runner.isDone.mockReturnValue(false); // nothing has happened yet
      service.start('nip-to-ksef');
      TestBed.tick(); // run the watcher effect
      expect(watchers.length).toBeGreaterThan(0);
      expect(service.state()?.step).toBe(0);

      runner.isDone.mockReturnValue(true);
      watchers[watchers.length - 1].onTrue(); // the confirm card appeared

      expect(service.state()?.step).toBe(1);
    });

    it('is not armed while the guide performs the step', () => {
      service.start('nip-to-ksef');
      TestBed.tick();
      const armed = watchers.length;
      service.performing.set(true);
      TestBed.tick();

      expect(watchers.length).toBe(armed); // no new watcher while busy
    });
  });

  it('boots again when the page comes back from the back-forward cache', () => {
    const again = jest
      .spyOn(service as unknown as { reloadInPlace(): void }, 'reloadInPlace')
      .mockImplementation(() => undefined);
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);
    expect(again).toHaveBeenCalledTimes(1);

    // an ordinary load fires pageshow too, and must not loop
    const fresh = new Event('pageshow');
    Object.defineProperty(fresh, 'persisted', { value: false });
    window.dispatchEvent(fresh);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('exit() closes any dialog the tour left open', () => {
    service.start(companyScenario.key);
    service.exit();
    expect(dialog.closeAll).toHaveBeenCalledTimes(1);
  });

  describe('a tour ends when the visitor leaves the app area', () => {
    it('landing on the marketing page drops the tour and closes dialogs', () => {
      service.start(companyScenario.key);
      router.events.next(new NavigationEnd(1, '/', '/'));
      expect(service.active()).toBe(false);
      expect(sessionStorage.getItem('demoSandbox')).toBeNull();
      expect(dialog.closeAll).toHaveBeenCalled();
    });

    it('the hub without a start link ends it; a start link and app routes keep it', () => {
      service.start(companyScenario.key);
      router.events.next(new NavigationEnd(2, '/collaborations/list', '/collaborations/list'));
      router.events.next(
        new NavigationEnd(3, '/demo?start=nip-to-ksef', '/demo?start=nip-to-ksef'),
      );
      expect(service.active()).toBe(true);
      router.events.next(new NavigationEnd(4, '/demo', '/demo'));
      expect(service.active()).toBe(false);
    });
  });

  it('a full load on the landing page with a stored tour drops it at construction', () => {
    sessionStorage.setItem(
      'demoSandbox',
      JSON.stringify({ key: companyScenario.key, step: 1, done: false }),
    );
    TestBed.resetTestingModule();
    const landed = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
      events: new Subject<unknown>(),
      navigated: true,
      url: '/',
    };
    TestBed.configureTestingModule({
      providers: [
        SandboxDirectorService,
        { provide: Router, useValue: landed },
        { provide: GuideRunnerService, useValue: runner },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fresh = TestBed.inject(SandboxDirectorService);
    expect(fresh.active()).toBe(false);
    expect(sessionStorage.getItem('demoSandbox')).toBeNull();
  });

  it('a full load on an app route keeps the stored tour', () => {
    sessionStorage.setItem(
      'demoSandbox',
      JSON.stringify({ key: companyScenario.key, step: 1, done: false }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SandboxDirectorService,
        {
          provide: Router,
          useValue: {
            navigateByUrl: jest.fn(),
            events: new Subject<unknown>(),
            navigated: true,
            url: '/collaborations/501/applicants',
          },
        },
        { provide: GuideRunnerService, useValue: runner },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    expect(TestBed.inject(SandboxDirectorService).active()).toBe(true);
  });
});
