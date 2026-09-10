# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ../.features-gen/e2e-tests/bdd/features/influencer-verification-password.feature.spec.js >> Influencer email verification with password setup >> Influencer receives ACCOUNT_ACTIVATED notification after verification
- Location: .features-gen/e2e-tests/bdd/features/influencer-verification-password.feature.spec.js:42:7

# Error details

```
Error: simulate-influencer-oauth failed: HTTP 500 {"error":"Simulation failed","message":"error.network.external_service","type":"NetworkTranslatableException"}
```

# Test source

```ts
  1   | import type { APIRequestContext } from '@playwright/test';
  2   | import type { ActorProfile } from '../actor';
  3   | import { BE_URL } from '../../integration/_actor';
  4   | import { ApiHttp } from './http-client';
  5   | 
  6   | /** Minimal structural type for the Playwright worker fixture we consume. */
  7   | export type PlaywrightRequestFactory = {
  8   |   request: {
  9   |     newContext(options?: {
  10  |       baseURL?: string;
  11  |       ignoreHTTPSErrors?: boolean;
  12  |     }): Promise<APIRequestContext>;
  13  |   };
  14  | };
  15  | 
  16  | /**
  17  |  * Layer 1 — one authenticated actor session for the live-BE oracle tier.
  18  |  *
  19  |  * Owns an isolated APIRequestContext (its own cookie jar) seeded via
  20  |  * mock-session, plus the `/test` hooks that put the actor into a state the LIVE
  21  |  * persistent BE will accept. The hook catalog + why each is needed lives in the
  22  |  * test-hooks catalog; the short version:
  23  |  *   - grantEnterprisePlan(): fresh billing period resets the per-period campaign
  24  |  *     count so a COMPANY can keep creating opportunities across runs.
  25  |  *   - activate(): forces accountStatus ACTIVE (another oracle can leave an actor
  26  |  *     IN_VALIDATION) — order-independence.
  27  |  *   - seedInstagram(): a primary CONNECTED social connection with in-range
  28  |  *     followers, required for an INFLUENCER to apply and to post to Instagram.
  29  |  *
  30  |  * Reused by every BDD oracle, so the seeding contract is written once.
  31  |  */
  32  | export class TestSession {
  33  |   readonly api: ApiHttp;
  34  | 
  35  |   private constructor(
  36  |     private readonly ctx: APIRequestContext,
  37  |     readonly actor: ActorProfile,
  38  |   ) {
  39  |     this.api = new ApiHttp(ctx);
  40  |   }
  41  | 
  42  |   /**
  43  |    * The raw authenticated APIRequestContext — for interop with the
  44  |    * `_framework` helpers that accept a RequestLike (e.g. test-email's
  45  |    * clearInbox/waitForEmail). Prefer `api` for typed endpoint calls.
  46  |    */
  47  |   get raw(): APIRequestContext {
  48  |     return this.ctx;
  49  |   }
  50  | 
  51  |   /** Open an isolated context and seed the actor's mock-session cookie jar. */
  52  |   static async open(
  53  |     playwright: PlaywrightRequestFactory,
  54  |     actor: ActorProfile,
  55  |   ): Promise<TestSession> {
  56  |     const ctx = await playwright.request.newContext({ baseURL: BE_URL, ignoreHTTPSErrors: true });
  57  |     // mock-session is cookie-based (session + session_sig). Retry the transient
  58  |     // 409 the seed can throw when the same fixed actor is re-seeded back-to-back.
  59  |     let lastStatus = 0;
  60  |     for (let attempt = 0; attempt < 4; attempt++) {
  61  |       const res = await ctx.post('/api/test/auth/mock-session', {
  62  |         data: {
  63  |           email: actor.email,
  64  |           role: actor.role,
  65  |           partial: false,
  66  |           // Pins NEW rows to a real Firebase UID — see ActorProfile.firebaseUid.
  67  |           ...(actor.firebaseUid ? { firebaseUid: actor.firebaseUid } : {}),
  68  |         },
  69  |       });
  70  |       lastStatus = res.status();
  71  |       if (lastStatus < 400) return new TestSession(ctx, actor);
  72  |       if (lastStatus !== 409) break;
  73  |       await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
  74  |     }
  75  |     await ctx.dispose();
  76  |     throw new Error(`mock-session failed for ${actor.email}: HTTP ${lastStatus}`);
  77  |   }
  78  | 
  79  |   /**
  80  |    * Open a session through the Instagram-OAuth SIMULATION instead of
  81  |    * mock-session: the BE reads the influencer's real Instagram token from
  82  |    * Firestore, KMS-decrypts it server-side, and issues the same production
  83  |    * session cookie pair an OAuth callback would. Use for oracles that need a
  84  |    * REAL OAuth-authenticated influencer (uid = Firestore instagramUsers/{uid}).
  85  |    */
  86  |   static async openViaOauthSimulation(
  87  |     playwright: PlaywrightRequestFactory,
  88  |     firebaseUid: string,
  89  |   ): Promise<TestSession> {
  90  |     const ctx = await playwright.request.newContext({ baseURL: BE_URL, ignoreHTTPSErrors: true });
  91  |     const res = await ctx.post('/api/test/auth/simulate-influencer-oauth', {
  92  |       data: { firebaseUid },
  93  |     });
  94  |     if (res.status() >= 400) {
  95  |       const body = await res.text().catch(() => '');
  96  |       await ctx.dispose();
> 97  |       throw new Error(
      |             ^ Error: simulate-influencer-oauth failed: HTTP 500 {"error":"Simulation failed","message":"error.network.external_service","type":"NetworkTranslatableException"}
  98  |         `simulate-influencer-oauth failed: HTTP ${res.status()} ${body.slice(0, 200)}`,
  99  |       );
  100 |     }
  101 |     return new TestSession(ctx, { id: firebaseUid, email: '', role: 'INFLUENCER' });
  102 |   }
  103 | 
  104 |   /**
  105 |    * Open an UNAUTHENTICATED context — for public /test staging hooks and for
  106 |    * scenarios that assert the anonymous contract (401s). No cookies are seeded.
  107 |    */
  108 |   static async openAnonymous(playwright: PlaywrightRequestFactory): Promise<TestSession> {
  109 |     const ctx = await playwright.request.newContext({ baseURL: BE_URL, ignoreHTTPSErrors: true });
  110 |     return new TestSession(ctx, { id: 'anonymous', email: '', role: 'COMPANY' });
  111 |   }
  112 | 
  113 |   /** GET /users/me → the authenticated user's numeric id. */
  114 |   async userId(): Promise<number> {
  115 |     const r = await this.api.get<{ id: number }>('/users/me');
  116 |     if (!r.ok) throw new Error(`GET /users/me failed: HTTP ${r.status}`);
  117 |     return r.json.id;
  118 |   }
  119 | 
  120 |   /** Force accountStatus ACTIVE (evicts cache). Order-independence across oracles. */
  121 |   async activate(): Promise<void> {
  122 |     const r = await this.api.post('/test/auth/set-account-status', {
  123 |       email: this.actor.email,
  124 |       status: 'ACTIVE',
  125 |     });
  126 |     if (!r.ok) throw new Error(`set-account-status ACTIVE failed: HTTP ${r.status}`);
  127 |   }
  128 | 
  129 |   /** Seed a primary CONNECTED Instagram connection (1500 followers, evicts cache). */
  130 |   async seedInstagram(): Promise<void> {
  131 |     const r = await this.api.post('/test/auth/seed-instagram-connection', {
  132 |       email: this.actor.email,
  133 |     });
  134 |     if (!r.ok) throw new Error(`seed-instagram-connection failed: HTTP ${r.status}`);
  135 |   }
  136 | 
  137 |   /**
  138 |    * Put the company on ENTERPRISE with a fresh billing period (resets campaign
  139 |    * count). CLEANUP CONTRACT: callers MUST restore with {@link restoreFreePlan}
  140 |    * when the scenario ends — the dev BE boots with app.payments.enabled=false,
  141 |    * and its PaymentsDisabledBootGuard refuses to start while ANY subscription
  142 |    * row sits in an in-flight PAID status. A leftover ENTERPRISE_ACTIVE row
  143 |    * crash-loops the next BE restart (hit live 2026-09-02).
  144 |    */
  145 |   async grantEnterprisePlan(): Promise<void> {
  146 |     const r = await this.api.post('/test/subscription/set-state', {
  147 |       email: this.actor.email,
  148 |       status: 'ENTERPRISE_ACTIVE',
  149 |       planName: 'ENTERPRISE',
  150 |     });
  151 |     if (!r.ok) throw new Error(`set-state ENTERPRISE_ACTIVE failed: HTTP ${r.status}`);
  152 |   }
  153 | 
  154 |   /** Restore the boot-safe FREE_ACTIVE subscription state (see grantEnterprisePlan). */
  155 |   async restoreFreePlan(): Promise<void> {
  156 |     const r = await this.api.post('/test/subscription/set-state', {
  157 |       email: this.actor.email,
  158 |       status: 'FREE_ACTIVE',
  159 |       planName: 'FREE',
  160 |     });
  161 |     if (!r.ok) throw new Error(`set-state FREE_ACTIVE failed: HTTP ${r.status}`);
  162 |   }
  163 | 
  164 |   async dispose(): Promise<void> {
  165 |     await this.ctx.dispose();
  166 |   }
  167 | }
  168 | 
```