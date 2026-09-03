import { expect, type Page } from '@playwright/test';
import type { Actor } from './actor';

/**
 * `then.*` — assertions on outcome state. Mirrors BE Cucumber `Then …`
 * steps. Each function picks a single observable signal (URL, visible
 * element, request log) and asserts on it; build complex assertions by
 * chaining several `then.*` calls.
 *
 * Use `expect.poll` / Playwright auto-waiting wherever possible — never
 * wrap an assertion in a manual `waitForTimeout` unless the BE has a
 * known fixed delay (it doesn't, in test profile).
 */
export const then = {
  /** `Then <actor> sees the URL match <pattern>`. */
  async actorSeesUrl(actor: Actor, pattern: RegExp | string): Promise<void> {
    await expect(actor.page).toHaveURL(pattern);
  },

  /** `Then the visitor sees the URL match <pattern>` (anonymous). */
  async pageHasUrl(page: Page, pattern: RegExp | string): Promise<void> {
    await expect(page).toHaveURL(pattern);
  },

  /** `Then <actor> sees text "<snippet>"`. */
  async actorSeesText(actor: Actor, snippet: string | RegExp): Promise<void> {
    await expect(actor.page.getByText(snippet)).toBeVisible();
  },

  /** `Then the visitor sees text "<snippet>"`. */
  async pageHasText(page: Page, snippet: string | RegExp): Promise<void> {
    await expect(page.getByText(snippet)).toBeVisible();
  },

  /**
   * `Then <actor> is authenticated` — verifies the user landed on an
   * authenticated route (i.e., the `authGuard` did NOT bounce them to
   * `/auth/sign-in`).
   *
   * Cookie-only auth means we can't read the session token from the page
   * (HttpOnly), so the assertion is "the guard didn't reject us". Combine
   * with `actorSeesUrl(/expected-route/)` for stronger landing checks.
   */
  async actorIsAuthenticated(actor: Actor): Promise<void> {
    expect(actor.page.url(), 'page should not be on /auth/sign-in').not.toMatch(/\/auth\/sign-in/);
  },
};
