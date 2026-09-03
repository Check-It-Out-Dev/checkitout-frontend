import type { APIRequestContext } from '@playwright/test';
import type { ActorProfile } from '../actor';
import { BE_URL } from '../../integration/_actor';
import { ApiHttp } from './http-client';

/** Minimal structural type for the Playwright worker fixture we consume. */
export type PlaywrightRequestFactory = {
  request: {
    newContext(options?: {
      baseURL?: string;
      ignoreHTTPSErrors?: boolean;
    }): Promise<APIRequestContext>;
  };
};

/**
 * Layer 1 — one authenticated actor session for the live-BE oracle tier.
 *
 * Owns an isolated APIRequestContext (its own cookie jar) seeded via
 * mock-session, plus the `/test` hooks that put the actor into a state the LIVE
 * persistent BE will accept. The hook catalog + why each is needed lives in the
 * test-hooks catalog; the short version:
 *   - grantEnterprisePlan(): fresh billing period resets the per-period campaign
 *     count so a COMPANY can keep creating opportunities across runs.
 *   - activate(): forces accountStatus ACTIVE (another oracle can leave an actor
 *     IN_VALIDATION) — order-independence.
 *   - seedInstagram(): a primary CONNECTED social connection with in-range
 *     followers, required for an INFLUENCER to apply and to post to Instagram.
 *
 * Reused by every BDD oracle, so the seeding contract is written once.
 */
export class TestSession {
  readonly api: ApiHttp;

  private constructor(
    private readonly ctx: APIRequestContext,
    readonly actor: ActorProfile,
  ) {
    this.api = new ApiHttp(ctx);
  }

  /**
   * The raw authenticated APIRequestContext — for interop with the
   * `_framework` helpers that accept a RequestLike (e.g. test-email's
   * clearInbox/waitForEmail). Prefer `api` for typed endpoint calls.
   */
  get raw(): APIRequestContext {
    return this.ctx;
  }

  /** Open an isolated context and seed the actor's mock-session cookie jar. */
  static async open(
    playwright: PlaywrightRequestFactory,
    actor: ActorProfile,
  ): Promise<TestSession> {
    const ctx = await playwright.request.newContext({ baseURL: BE_URL, ignoreHTTPSErrors: true });
    // mock-session is cookie-based (session + session_sig). Retry the transient
    // 409 the seed can throw when the same fixed actor is re-seeded back-to-back.
    let lastStatus = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await ctx.post('/api/test/auth/mock-session', {
        data: {
          email: actor.email,
          role: actor.role,
          partial: false,
          // Pins NEW rows to a real Firebase UID — see ActorProfile.firebaseUid.
          ...(actor.firebaseUid ? { firebaseUid: actor.firebaseUid } : {}),
        },
      });
      lastStatus = res.status();
      if (lastStatus < 400) return new TestSession(ctx, actor);
      if (lastStatus !== 409) break;
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
    await ctx.dispose();
    throw new Error(`mock-session failed for ${actor.email}: HTTP ${lastStatus}`);
  }

  /**
   * Open a session through the Instagram-OAuth SIMULATION instead of
   * mock-session: the BE reads the influencer's real Instagram token from
   * Firestore, KMS-decrypts it server-side, and issues the same production
   * session cookie pair an OAuth callback would. Use for oracles that need a
   * REAL OAuth-authenticated influencer (uid = Firestore instagramUsers/{uid}).
   */
  static async openViaOauthSimulation(
    playwright: PlaywrightRequestFactory,
    firebaseUid: string,
  ): Promise<TestSession> {
    const ctx = await playwright.request.newContext({ baseURL: BE_URL, ignoreHTTPSErrors: true });
    const res = await ctx.post('/api/test/auth/simulate-influencer-oauth', {
      data: { firebaseUid },
    });
    if (res.status() >= 400) {
      const body = await res.text().catch(() => '');
      await ctx.dispose();
      throw new Error(
        `simulate-influencer-oauth failed: HTTP ${res.status()} ${body.slice(0, 200)}`,
      );
    }
    return new TestSession(ctx, { id: firebaseUid, email: '', role: 'INFLUENCER' });
  }

  /**
   * Open an UNAUTHENTICATED context — for public /test staging hooks and for
   * scenarios that assert the anonymous contract (401s). No cookies are seeded.
   */
  static async openAnonymous(playwright: PlaywrightRequestFactory): Promise<TestSession> {
    const ctx = await playwright.request.newContext({ baseURL: BE_URL, ignoreHTTPSErrors: true });
    return new TestSession(ctx, { id: 'anonymous', email: '', role: 'COMPANY' });
  }

  /** GET /users/me → the authenticated user's numeric id. */
  async userId(): Promise<number> {
    const r = await this.api.get<{ id: number }>('/users/me');
    if (!r.ok) throw new Error(`GET /users/me failed: HTTP ${r.status}`);
    return r.json.id;
  }

  /** Force accountStatus ACTIVE (evicts cache). Order-independence across oracles. */
  async activate(): Promise<void> {
    const r = await this.api.post('/test/auth/set-account-status', {
      email: this.actor.email,
      status: 'ACTIVE',
    });
    if (!r.ok) throw new Error(`set-account-status ACTIVE failed: HTTP ${r.status}`);
  }

  /** Seed a primary CONNECTED Instagram connection (1500 followers, evicts cache). */
  async seedInstagram(): Promise<void> {
    const r = await this.api.post('/test/auth/seed-instagram-connection', {
      email: this.actor.email,
    });
    if (!r.ok) throw new Error(`seed-instagram-connection failed: HTTP ${r.status}`);
  }

  /**
   * Put the company on ENTERPRISE with a fresh billing period (resets campaign
   * count). CLEANUP CONTRACT: callers MUST restore with {@link restoreFreePlan}
   * when the scenario ends — the dev BE boots with app.payments.enabled=false,
   * and its PaymentsDisabledBootGuard refuses to start while ANY subscription
   * row sits in an in-flight PAID status. A leftover ENTERPRISE_ACTIVE row
   * crash-loops the next BE restart (hit live 2026-09-02).
   */
  async grantEnterprisePlan(): Promise<void> {
    const r = await this.api.post('/test/subscription/set-state', {
      email: this.actor.email,
      status: 'ENTERPRISE_ACTIVE',
      planName: 'ENTERPRISE',
    });
    if (!r.ok) throw new Error(`set-state ENTERPRISE_ACTIVE failed: HTTP ${r.status}`);
  }

  /** Restore the boot-safe FREE_ACTIVE subscription state (see grantEnterprisePlan). */
  async restoreFreePlan(): Promise<void> {
    const r = await this.api.post('/test/subscription/set-state', {
      email: this.actor.email,
      status: 'FREE_ACTIVE',
      planName: 'FREE',
    });
    if (!r.ok) throw new Error(`set-state FREE_ACTIVE failed: HTTP ${r.status}`);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}
