import { environment } from '../../../environments/environment';

/** Demo roles the floating switcher + scenarios can play as. */
export type DemoRole = 'COMPANY' | 'INFLUENCER' | 'ADMIN';

const ROLE_KEY = 'demoRole';
const SESSION_KEY = 'demoSession';

/**
 * The persona, as opposed to the run. Both begin with `demo`, so a sweep that
 * wipes the demo's own leftovers between tours has to be told to leave these
 * two alone — the director sets them deliberately for the scenario it is about
 * to start, and clearing them mid-start would sign the visitor out of the tour
 * they just asked for.
 */
export const DEMO_PERSONA_KEYS: readonly string[] = [ROLE_KEY, SESSION_KEY];

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

/**
 * Whether the persona is signed in. A fresh visitor starts signed OUT —
 * like production — so "Zaloguj się" / "Dołącz za darmo" reach the real
 * sign-in and sign-up screens instead of bouncing into the dashboard. The
 * demo sign-in/sign-up forms, a guided scenario that plays inside the app,
 * and sign-out flip it; the /users/me fixture reads it on every probe.
 */
export function isDemoSignedIn(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the session flag; callers decide whether to reload. */
export function setDemoSignedIn(signedIn: boolean): void {
  try {
    localStorage.setItem(SESSION_KEY, signedIn ? '1' : '0');
  } catch {
    // SSR / storage disabled — the persona simply stays signed out.
  }
}
