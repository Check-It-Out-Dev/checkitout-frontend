import type { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Per-actor wrapper around an isolated Playwright `BrowserContext` + `Page`.
 *
 * Mirrors the BE's `Actor` (`checkitout-backend/.../e2e/multiuser/actor/Actor.java`):
 * each actor carries their own auth state (HttpOnly session cookies; greenfield
 * has no client-side token storage) AND a `createdResources` map so a scenario
 * can stash per-actor IDs without leaking across actors.
 *
 * Actors are created via `ActorRegistry.register(...)` — never directly.
 */
export type ActorRole = 'COMPANY' | 'INFLUENCER' | 'ADMIN';

export interface ActorProfile {
  readonly id: string;
  readonly email: string;
  readonly role: ActorRole;
  /**
   * Pin the BE user row to a specific Firebase UID at mock-session seed
   * time. REQUIRED for actors whose scenarios later stage state through
   * uid-keyed /test hooks or exchange a REAL Firebase idToken: without
   * it the BE mints a mock uid for new rows — fine on a long-lived dev
   * DB (the row already carries the real uid from historical logins),
   * broken on a fresh one (uid-keyed hooks 400, exchange-token 401).
   * Found when the postgres volume was recreated 2026-09-02.
   */
  readonly firebaseUid?: string;
}

/** The real Firebase company account's UID (BE corpus login.feature Examples). */
export const REAL_COMPANY_FIREBASE_UID = 'WWXA9DehxZghyLq849TpyE4vYzZ2';

export const ACTORS: Readonly<Record<string, ActorProfile>> = Object.freeze({
  company1: { id: 'company1', email: 'company1@e2e.test', role: 'COMPANY' },
  influencer1: { id: 'influencer1', email: 'influencer1@e2e.test', role: 'INFLUENCER' },
  admin1: { id: 'admin1', email: 'admin1@e2e.test', role: 'ADMIN' },
});

export class Actor {
  readonly createdResources = new Map<string, unknown>();

  constructor(
    readonly profile: ActorProfile,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {}

  get name(): string {
    return this.profile.id;
  }

  get role(): ActorRole {
    return this.profile.role;
  }

  async navigate(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'networkidle' });
  }

  remember<T>(key: string, value: T): T {
    this.createdResources.set(key, value);
    return value;
  }

  recall<T>(key: string): T | undefined {
    return this.createdResources.get(key) as T | undefined;
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

/**
 * Per-test registry of `Actor` instances. Mirrors the BE
 * `ActorRegistry` (`@ScenarioScope`): named lookup, a notion of a current
 * actor, and a `closeAll` that tears down every browser context after the
 * scenario.
 *
 * Usage from a `test()` body:
 *
 *   const reg = new ActorRegistry(browser);
 *   const company = await reg.register('FashionCo', ACTORS.company1);
 *   const anna    = await reg.register('Anna',     ACTORS.influencer1);
 *   reg.switchTo('Anna');                  // updates currentActor
 *   await reg.current().navigate('/...');
 *   ...
 *   await reg.closeAll();                   // teardown — call in afterEach
 */
export class ActorRegistry {
  private readonly actors = new Map<string, Actor>();
  private currentName: string | null = null;

  constructor(private readonly browser: Browser) {}

  async register(name: string, profile: ActorProfile): Promise<Actor> {
    if (this.actors.has(name)) {
      await this.actors.get(name)!.close();
      this.actors.delete(name);
    }
    const context = await this.browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const { authenticate } = await import('./auth');
    await authenticate(context, page, profile);
    const actor = new Actor(profile, context, page);
    this.actors.set(name, actor);
    this.currentName = name;
    return actor;
  }

  get(name: string): Actor {
    const actor = this.actors.get(name);
    if (!actor) {
      throw new Error(
        `No actor named "${name}". Registered: ${[...this.actors.keys()].join(', ') || '<none>'}`,
      );
    }
    return actor;
  }

  current(): Actor {
    if (!this.currentName) {
      throw new Error('No current actor — call register() or switchTo() first');
    }
    return this.get(this.currentName);
  }

  switchTo(name: string): Actor {
    const actor = this.get(name);
    this.currentName = name;
    return actor;
  }

  async closeAll(): Promise<void> {
    const all = [...this.actors.values()];
    this.actors.clear();
    this.currentName = null;
    await Promise.all(all.map((a) => a.close()));
  }
}
