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

/**
 * Where Identity Toolkit is, for this run.
 *
 * The emulator serves the production API under a path prefix and accepts any API key, which is what
 * lets the 2FA specs sign in for real with no Google project in reach. The backend has had exactly
 * this redirect since its e2e tier moved to the emulator (see its FirebaseEmulator component); this
 * is the test side of the same idea, keyed off the same variable, so a run has either both halves
 * pointed at the emulator or neither.
 */
function identityToolkitBase(): string {
  const host = process.env['FIREBASE_AUTH_EMULATOR_HOST']?.trim();
  return host
    ? `http://${host}/identitytoolkit.googleapis.com/v1`
    : 'https://identitytoolkit.googleapis.com/v1';
}

/** True when this run signs in against the emulator rather than a Google project. */
export function usingAuthEmulator(): boolean {
  return Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST']?.trim());
}

/**
 * The emulator ignores the API key entirely: it is in the URL because the production endpoint
 * requires one, not because anything checks it. A literal keeps the shape of the call identical in
 * both modes rather than branching the request itself.
 */
const EMULATOR_API_KEY = 'emulator-ignores-this';

function resolveCredentials(role: ActorRole): ResolvedCredentials {
  const apiKey =
    process.env['FIREBASE_API_KEY'] ?? (usingAuthEmulator() ? EMULATOR_API_KEY : undefined);
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
  apiKey: string = process.env['FIREBASE_API_KEY'] ?? (usingAuthEmulator() ? EMULATOR_API_KEY : ''),
): Promise<string> {
  if (!apiKey) {
    throw new MissingCredentialsError('FIREBASE_API_KEY not set.');
  }
  const url = `${identityToolkitBase()}/accounts:signInWithPassword?key=${apiKey}`;
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
  options: { viaProxyLogin?: boolean } = {},
): Promise<void> {
  const { email, password, apiKey } = resolveCredentials(profile.role);
  const idToken = await mintFirebaseIdToken(context, email, password, apiKey);

  // `viaProxyLogin` adds the step the sign-in screen takes and this helper skips.
  //
  // SignInComponent posts to /auth/firebase/login and THEN to /auth/exchange-token; this shortcut
  // has always gone straight to the exchange, which is equivalent for every role that gets a full
  // session on the first call. It is not equivalent for ADMIN: the exchange issues a PARTIAL
  // session, and the re-exchange after 2FA posts an empty body because the backend re-reads the ID
  // token from the FirebaseIdToken cookie pair -- and only /auth/firebase/login sets that pair
  // (FirebaseAuthProxyController:132). Without it the re-exchange answers 400, "ID token is null
  // or empty", and the backend is right: nothing ever gave it one.
  if (options.viaProxyLogin) {
    const loginRes = await context.request.post(`${origin}/api/auth/firebase/login`, {
      data: { email, password },
      ignoreHTTPSErrors: true,
    });
    if (!loginRes.ok()) {
      throw new Error(
        `firebase/login failed at ${origin} for ${email}: ${loginRes.status()} ${await loginRes.text()}`,
      );
    }
  }

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
  // The API key is a production requirement, not an emulator one: against the emulator the accounts
  // and their passwords come from the seeder, so having the credentials IS having them.
  if (!process.env['FIREBASE_API_KEY'] && !usingAuthEmulator()) return false;
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
