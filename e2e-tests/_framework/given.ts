import type { Browser } from '@playwright/test';
import { ACTORS, type Actor, ActorRegistry } from './actor';

/**
 * `given.*` — preconditions for a scenario. Each function is async and
 * idempotent within a single test. Mirrors the BE step pattern
 * `Given a company user "FashionCo" is logged in`.
 *
 * The functions take `ActorRegistry` (and sometimes `Browser`) explicitly
 * rather than reading from a hidden TestBed — keeps the dependencies in
 * the call site so a reader of the spec doesn't have to chase imports to
 * understand what's being set up.
 */
export const given = {
  /**
   * `Given a <role> user "<name>" is logged in`.
   *
   * Creates a fresh `BrowserContext`, authenticates via mock-session,
   * registers the actor, and makes them the current actor.
   */
  async userIsLoggedIn(
    reg: ActorRegistry,
    name: string,
    actorKey: keyof typeof ACTORS,
  ): Promise<Actor> {
    const profile = ACTORS[actorKey];
    if (!profile) {
      throw new Error(`Unknown actor key "${actorKey}". Known: ${Object.keys(ACTORS).join(', ')}`);
    }
    return reg.register(name, profile);
  },

  /**
   * Convenience for the most common case: a single anonymous browser context
   * with no actor (sign-in / sign-up screens). Returns the page so the
   * caller can drive form filling directly.
   */
  async anonymousVisitor(browser: Browser) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    return { context, page };
  },
};
