import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SandboxDirectorService } from './sandbox-director.service';
import { SCENARIOS } from './scenario-registry';

describe('SandboxDirectorService', () => {
  let service: SandboxDirectorService;
  let router: { navigateByUrl: jest.Mock };

  /** A scenario whose role matches the default persona (COMPANY) — start()
   *  must NOT take the full-reload role-switch branch in tests. */
  const companyScenario = SCENARIOS.find((s) => s.role === 'COMPANY')!;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    router = { navigateByUrl: jest.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [SandboxDirectorService, { provide: Router, useValue: router }],
    });
    service = TestBed.inject(SandboxDirectorService);
  });

  it('is idle until started', () => {
    expect(service.active()).toBe(false);
    expect(service.scenario()).toBeNull();
    expect(service.step()).toBeNull();
  });

  it('start() enters step 0 and navigates to its route', () => {
    service.start(companyScenario.key);

    expect(service.active()).toBe(true);
    expect(service.step()?.id).toBe(companyScenario.steps[0].id);
    expect(router.navigateByUrl).toHaveBeenCalledWith(companyScenario.steps[0].route);
  });

  it('start() resets per-tour story state (upgrade plan + step-up code)', () => {
    sessionStorage.setItem('demoPlan', 'ENTERPRISE');
    sessionStorage.setItem('demoStepUpCode', '123456');

    service.start(companyScenario.key);

    expect(sessionStorage.getItem('demoPlan')).toBeNull();
    expect(sessionStorage.getItem('demoStepUpCode')).toBeNull();
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

  it('exit() clears state and returns to the hub', () => {
    service.start(companyScenario.key);
    service.exit();

    expect(service.active()).toBe(false);
    expect(sessionStorage.getItem('demoSandbox')).toBeNull();
    expect(router.navigateByUrl).toHaveBeenLastCalledWith('/demo');
  });

  it('notify() only advances event steps with a matching id', () => {
    service.start(companyScenario.key);
    const before = service.state()?.step;
    // slice-C registry ships manual steps only — notify must be a no-op.
    service.notify(companyScenario.steps[0].id);
    expect(service.state()?.step).toBe(before);
  });
});
