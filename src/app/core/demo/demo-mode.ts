import { environment } from '../../../environments/environment';

/** Demo roles the floating switcher + scenarios can play as. */
export type DemoRole = 'COMPANY' | 'INFLUENCER' | 'ADMIN';

const ROLE_KEY = 'demoRole';

/** True in the demo build (environment.demo.ts via fileReplacements). */
export function isDemoMode(): boolean {
  return environment.demo;
}

/** The active demo persona — localStorage-backed so a reload keeps it. */
export function currentDemoRole(): DemoRole {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return r === 'INFLUENCER' || r === 'ADMIN' ? r : 'COMPANY';
  } catch {
    return 'COMPANY';
  }
}

/** Persist the persona; callers decide whether to reload. */
export function setDemoRole(role: DemoRole): void {
  localStorage.setItem(ROLE_KEY, role);
}
