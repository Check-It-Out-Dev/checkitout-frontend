import type { BrowserContext } from '@playwright/test';
import type { ActorProfile, ActorRole } from './actor';
import { GREENFIELD_URL } from './auth';

/**
 * Real-Firebase login recipe for Playwright. Mints a real Firebase ID token
 * via the Identity Toolkit REST API (signInWithPassword), then exchanges it
 * for the same HttpOnly session cookies the BE issues at production sign-in
 * (POST /api/auth/exchange-token).
 *
 * Use this for tests that exercise the full auth flow end-to-end:
 *   - login.feature happy-path (real Firebase, real exchange-token)
 *   - admin TOTP partial→full upgrade (mock-session bypasses TOTP)
 *   - tokenVersion-driven session-revocation flows that need a real Firebase
 *     claim payload
 *
 * For mock-session flows (fast path with full role claims, no Firebase
 * round-trip), see `auth.ts`. The two helpers coexist: mock-session for
 * speed, real-login for fidelity.
 *
 * Setup:
 *   1. Copy `e2e-tests/.env.example` → `e2e-tests/.env`
 *   2. Fill in FIREBASE_API_KEY + FIREBASE_PROJECT_ID + per-role test creds
 *   3. `playwright.config.ts` auto-loads `.env` via `dotenv`
 *
 * Self-skipping: when `.env` is absent OR the role's credentials are blank,
 * `realLogin()` throws `MissingCredentialsError`. Tests should branch on
 * `hasRealCredentialsFor(role)` and call `test.skip(...)` with a message so
 * the run remains green on machines that don't have the test secrets.
 */

export class MissingCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingCredentialsError';
  }
}

const CREDENTIALS_BY_ROLE: Readonly<Record<ActorRole, { emailEnv: string; passwordEnv: string }>> =
  Object.freeze({
    COMPANY: {
      emailEnv: 'FIREBASE_TEST_COMPANY_EMAIL',
      passwordEnv: 'FIREBASE_TEST_COMPANY_PASSWORD',
    },
    INFLUENCER: {
      emailEnv: 'FIREBASE_TEST_INFLUENCER_EMAIL',
      passwordEnv: 'FIREBASE_TEST_INFLUENCER_PASSWORD',
    },
    ADMIN: {
      emailEnv: 'FIREBASE_TEST_ADMIN_EMAIL',
      passwordEnv: 'FIREBASE_TEST_ADMIN_PASSWORD',
    },
  });

interface SignInWithPasswordResponse {
  readonly idToken: string;
  readonly localId: string;
  readonly email: string;
  readonly expiresIn: string;
  readonly refreshToken: string;
}

interface ResolvedCredentials {
  readonly email: string;
  readonly password: string;
  readonly apiKey: string;
}

function resolveCredentials(role: ActorRole): ResolvedCredentials {
  const apiKey = process.env['FIREBASE_API_KEY'];
  if (!apiKey) {
    throw new MissingCredentialsError(
      'FIREBASE_API_KEY not set. Copy e2e-tests/.env.example to e2e-tests/.env and fill in.',
    );
  }
  const slot = CREDENTIALS_BY_ROLE[role];
  if (!slot) {
    throw new Error(`Unknown role for real-login: ${role}`);
  }
  const email = process.env[slot.emailEnv];
  const password = process.env[slot.passwordEnv];
  if (!email || !password) {
    throw new MissingCredentialsError(
      `Missing ${slot.emailEnv} or ${slot.passwordEnv} — see e2e-tests/.env.example`,
    );
  }
  return { email, password, apiKey };
}

/**
 * Mint a real Firebase ID token by calling Identity Toolkit's
 * signInWithPassword REST endpoint directly. Exposed separately so tests
 * that need raw tokens (e.g., to assert token-version claims, or to drive
 * the partial-session-then-TOTP-verify chain) can use it without going
 * through the full exchange.
 */
export async function mintFirebaseIdToken(
  context: BrowserContext,
  email: string,
  password: string,
  apiKey: string = process.env['FIREBASE_API_KEY'] ?? '',
): Promise<string> {
  if (!apiKey) {
    throw new MissingCredentialsError('FIREBASE_API_KEY not set.');
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  const res = await context.request.post(url, {
    data: { email, password, returnSecureToken: true },
    ignoreHTTPSErrors: true,
  });
  if (!res.ok()) {
    throw new Error(
      `Firebase signInWithPassword failed for ${email}: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as SignInWithPasswordResponse;
  if (!body.idToken) {
    throw new Error(`Firebase signInWithPassword returned no idToken: ${JSON.stringify(body)}`);
  }
  return body.idToken;
}

/**
 * Full real-Firebase login: mints a Firebase ID token, then POSTs it to
 * /api/auth/exchange-token. After this returns, the BrowserContext has the
 * same `session` + `session_sig` HttpOnly cookies a production browser
 * would have after sign-in. Subsequent `page.goto(...)` calls authenticate
 * automatically via `withCredentials=true`.
 *
 * For ADMIN with 2FA: the BE returns a PARTIAL session cookie + `requires2FA`
 * in the response body. Pass `expirationDays` to control session lifetime
 * (default 7, max 30 — capped server-side).
 *
 * Throws `MissingCredentialsError` when `.env` is absent or the role lacks
 * credentials; tests should branch on `hasRealCredentialsFor(role)`.
 */
export async function realLogin(
  context: BrowserContext,
  profile: ActorProfile,
  origin: string = GREENFIELD_URL,
  expirationDays?: number,
): Promise<void> {
  const { email, password, apiKey } = resolveCredentials(profile.role);
  const idToken = await mintFirebaseIdToken(context, email, password, apiKey);
  const body: { idToken: string; expirationDays?: number } = { idToken };
  if (expirationDays !== undefined) {
    body.expirationDays = expirationDays;
  }
  const exchangeRes = await context.request.post(`${origin}/api/auth/exchange-token`, {
    data: body,
    ignoreHTTPSErrors: true,
  });
  if (!exchangeRes.ok()) {
    throw new Error(
      `exchange-token failed at ${origin} for ${email}: ${exchangeRes.status()} ${await exchangeRes.text()}`,
    );
  }
}

/**
 * Whether real-Firebase credentials are present for the given role in
 * process.env. Tests that need real-login should call this first and
 * `test.skip(!hasRealCredentialsFor(role), 'real credentials missing — see e2e-tests/.env.example')`
 * so missing-secrets runs stay green.
 */
export function hasRealCredentialsFor(role: ActorRole): boolean {
  if (!process.env['FIREBASE_API_KEY']) return false;
  return hasUiCredentialsFor(role);
}

/**
 * Credentials-only gate for UI-driven real sign-in specs. The greenfield
 * sign-in form posts to the BE, which proxies Identity Toolkit with a
 * service-account OAuth bearer — no FE-side web API key exists anywhere
 * in this project (the BE .env documents its removal). Requiring
 * FIREBASE_API_KEY here would permanently skip the whole UI-real class.
 * Direct-Identity-Toolkit helpers (mintIdToken) keep their own API-key
 * checks and throw MissingCredentialsError at the call site.
 */
export function hasUiCredentialsFor(role: ActorRole): boolean {
  const slot = CREDENTIALS_BY_ROLE[role];
  if (!slot) return false;
  return !!process.env[slot.emailEnv] && !!process.env[slot.passwordEnv];
}
