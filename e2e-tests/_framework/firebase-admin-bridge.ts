/**
 * Firebase Admin + KMS bridge for FE integration tests.
 *
 * THIS FILE LIVES ONLY UNDER `e2e-tests/_framework/`. It MUST NEVER be
 * imported from `src/app/**` (production code path) — it carries
 * service-account credentials and direct GCP service clients that
 * would compromise the cookies-only browser auth model.
 *
 * Capabilities (gated on a service-account.json being on disk):
 *   - Firestore Admin reads/writes — seed test state, fetch encrypted
 *     blobs (e.g. `totpSecrets/{firebaseUid}.encryptedSecret`).
 *   - KMS encrypt/decrypt — round-trip `instagram-tokens` keyring
 *     materials the BE produced.
 *   - Firebase Admin Auth — programmatic user create, custom-claim set,
 *     emailVerified toggle (exposed as needed by future callers).
 *
 * Architecture: the BE uses **plain KMS symmetric encrypt/decrypt** —
 * no envelope, no AAD, no manual AES. Ciphertext on the wire is Base64.
 * The plaintext for `totpSecrets` is a UTF-8 Base32 string consumed by
 * `currentTotpCode(base32)` from `./totp`.
 *
 * Configuration (precedence, highest first):
 *   1. `cfg.serviceAccountPath` argument
 *   2. `E2E_GCP_SERVICE_ACCOUNT_JSON_PATH` env
 *   3. `GOOGLE_APPLICATION_CREDENTIALS` env (standard GCP convention)
 *   4. `../checkitout-backend/src/main/resources/service-account.json`
 *      (relative to FE repo root — keeps the file cross-repo and
 *      mirrors BE's `GoogleCredentialsProvider` lookup pattern)
 *
 * Tests that need this bridge should branch on `isBridgeAvailable()`
 * + `test.skip(...)` so CI runs / dev machines without credentials
 * stay green. Same pattern as `real-login.ts`.
 *
 * Source-of-truth audit done 2026-05-12 — see commit message and the
 * opus-code-crawler design report archived in the iteration log.
 */
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { KeyManagementServiceClient } from '@google-cloud/kms';

const DEFAULT_PROJECT_ID = 'check-it-out-47c50';
const DEFAULT_KMS_LOCATION = 'europe-central2';
const DEFAULT_KMS_KEY_RING = 'instagram-tokens';
const DEFAULT_KMS_TOTP_KEY = 'totp-secrets-key';
const TOTP_SECRETS_COLLECTION = 'totpSecrets';

export class BridgeUnavailableError extends Error {
  readonly code = 'BRIDGE_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'BridgeUnavailableError';
  }
}

export class TotpSecretMissingError extends Error {
  readonly code = 'TOTP_DOC_MISSING';
  constructor(message: string) {
    super(message);
    this.name = 'TotpSecretMissingError';
  }
}

export class KmsPermissionError extends Error {
  readonly code = 'KMS_PERMISSION_DENIED';
  constructor(message: string) {
    super(message);
    this.name = 'KmsPermissionError';
  }
}

export interface AdminBridgeConfig {
  /** Override the path to service-account.json. */
  serviceAccountPath?: string;
  /** Defaults to FIREBASE_PROJECT_ID env or 'check-it-out-47c50'. */
  projectId?: string;
  /** Defaults to E2E_KMS_LOCATION env or 'europe-central2'. */
  kmsLocation?: string;
  /** Defaults to E2E_KMS_KEY_RING env or 'instagram-tokens'. */
  kmsKeyRing?: string;
  /** Defaults to E2E_KMS_TOTP_KEY env or 'totp-secrets-key'. */
  kmsTotpKey?: string;
}

function repoRoot(): string {
  // Dual-mode: under Jest (CJS) `__dirname` is this file's directory, so
  // walk up two levels to land at the FE repo root. Under `node --experimental-
  // strip-types` (ESM) `__dirname` is undefined, so fall back to
  // `process.cwd()` — both `node` and `playwright test` are invoked from
  // the FE repo root, so the default candidate path still resolves correctly.
  // Scripts that need a different anchor pass `cfg.serviceAccountPath`.
  if (typeof __dirname === 'string') {
    return path.resolve(__dirname, '..', '..');
  }
  return process.cwd();
}

function defaultServiceAccountCandidates(): string[] {
  const explicit = [
    process.env['E2E_GCP_SERVICE_ACCOUNT_JSON_PATH'],
    process.env['GOOGLE_APPLICATION_CREDENTIALS'],
  ].filter((p): p is string => !!p);
  const conventional = [
    path.resolve(
      repoRoot(),
      '..',
      'checkitout-backend',
      'src',
      'main',
      'resources',
      'service-account.json',
    ),
  ];
  return [...explicit, ...conventional];
}

function resolveServiceAccountPath(cfg: AdminBridgeConfig): string | null {
  const candidates = cfg.serviceAccountPath
    ? [cfg.serviceAccountPath, ...defaultServiceAccountCandidates()]
    : defaultServiceAccountCandidates();
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Cheap probe — true when a service-account.json is reachable. No
 * network calls, no SDK init. Callers use it to decide whether to
 * `test.skip(...)` so the test pass stays green on machines without
 * credentials (same pattern as real-login.ts `hasRealCredentialsFor`).
 */
export function isBridgeAvailable(cfg: AdminBridgeConfig = {}): boolean {
  return resolveServiceAccountPath(cfg) !== null;
}

let firebaseApp: App | null = null;
let firestoreClient: Firestore | null = null;
let kmsClient: KeyManagementServiceClient | null = null;
let authClient: Auth | null = null;
let activeServiceAccountPath: string | null = null;

function lazyInit(cfg: AdminBridgeConfig): void {
  const saPath = resolveServiceAccountPath(cfg);
  if (!saPath) {
    throw new BridgeUnavailableError(
      'No service-account.json found. Set E2E_GCP_SERVICE_ACCOUNT_JSON_PATH or place the file at checkitout-backend/src/main/resources/service-account.json. See e2e-tests/.env.example.',
    );
  }

  // The Firebase Admin SDK is a global singleton. Initialize once per
  // process; subsequent callers reuse the same app + Firestore + Auth.
  if (!firebaseApp) {
    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        credential: cert(saPath),
        projectId: cfg.projectId ?? process.env['FIREBASE_PROJECT_ID'] ?? DEFAULT_PROJECT_ID,
      });
    } else {
      firebaseApp = getApps()[0]!;
    }
    activeServiceAccountPath = saPath;
  }

  firestoreClient ??= getFirestore(firebaseApp);
  authClient ??= getAuth(firebaseApp);
  // KMS client needs its own credentials object — same key file as Admin SDK.
  kmsClient ??= new KeyManagementServiceClient({ keyFilename: saPath });
}

function totpCryptoKeyPath(cfg: AdminBridgeConfig): string {
  return kmsClient!.cryptoKeyPath(
    cfg.projectId ?? process.env['FIREBASE_PROJECT_ID'] ?? DEFAULT_PROJECT_ID,
    cfg.kmsLocation ?? process.env['E2E_KMS_LOCATION'] ?? DEFAULT_KMS_LOCATION,
    cfg.kmsKeyRing ?? process.env['E2E_KMS_KEY_RING'] ?? DEFAULT_KMS_KEY_RING,
    cfg.kmsTotpKey ?? process.env['E2E_KMS_TOTP_KEY'] ?? DEFAULT_KMS_TOTP_KEY,
  );
}

function isKmsPermissionDenied(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string };
  if (e == null) return false;
  return (
    String(e.code) === '7' ||
    /PERMISSION_DENIED/i.test(e.message ?? '') ||
    /Permission .* denied/i.test(e.message ?? '')
  );
}

/**
 * Read + KMS-decrypt the test admin's stored TOTP secret.
 *
 * Returns the Base32 secret string. Feed to `currentTotpCode(secret)`
 * from `./totp` to produce a 6-digit code valid for the current 30s
 * window. Mirrors the BE round-trip via
 * `TotpFirestoreService.getTotpSecret` (lines 87-115 of that file).
 *
 * Throws:
 *   - `BridgeUnavailableError` — no service-account.json on disk
 *   - `TotpSecretMissingError` — `totpSecrets/{uid}` doc absent or
 *     `encryptedSecret` empty (admin has never enrolled 2FA)
 *   - `KmsPermissionError` — service account lacks
 *     `cloudkms.cryptoKeyVersions.useToDecrypt` on `totp-secrets-key`
 */
export async function readTotpSecret(
  firebaseUid: string,
  cfg: AdminBridgeConfig = {},
): Promise<string> {
  lazyInit(cfg);
  const snap = await firestoreClient!.collection(TOTP_SECRETS_COLLECTION).doc(firebaseUid).get();
  if (!snap.exists) {
    throw new TotpSecretMissingError(
      `No totpSecrets/${firebaseUid} doc — admin has no 2FA enrolled (call seedTotpSecret to provision).`,
    );
  }
  const data = snap.data();
  const encryptedBase64 = data?.['encryptedSecret'] as string | undefined;
  if (!encryptedBase64) {
    throw new TotpSecretMissingError(
      `totpSecrets/${firebaseUid}.encryptedSecret is empty/missing (have keys: ${Object.keys(data ?? {}).join(', ')}).`,
    );
  }

  const name = totpCryptoKeyPath(cfg);
  try {
    const [response] = await kmsClient!.decrypt({
      name,
      ciphertext: Buffer.from(encryptedBase64, 'base64'),
    });
    const plaintext = response.plaintext;
    if (!plaintext) {
      throw new Error(`KMS decrypt returned no plaintext for totpSecrets/${firebaseUid}`);
    }
    return Buffer.from(plaintext as Uint8Array).toString('utf8');
  } catch (err) {
    if (isKmsPermissionDenied(err)) {
      throw new KmsPermissionError(
        'Service account lacks cloudkms.cryptoKeyVersions.useToDecrypt on totp-secrets-key. Grant it via Cloud Console IAM.',
      );
    }
    throw err;
  }
}

/**
 * KMS-encrypt a plaintext Base32 secret + write the resulting blob to
 * `totpSecrets/{firebaseUid}.encryptedSecret`, mirroring the BE's
 * `TotpFirestoreService.storeTotpSecret` pattern (without backup codes
 * for now — tests that need backup codes can add them as a follow-up).
 *
 * Idempotent: callers can re-seed; the doc gets `set()` with merge=true
 * so a re-seed of the same secret is a no-op at the data level.
 *
 * Used by the one-time provisioning script + by tests that want to
 * re-encrypt a known secret (e.g., the well-known test vector
 * `JBSWY3DPEHPK3PXP`) for reproducible admin-2FA flows.
 *
 * Returns the Base64 ciphertext written to Firestore (for assertions
 * + audit logging).
 */
export async function seedTotpSecret(
  firebaseUid: string,
  plaintextBase32: string,
  cfg: AdminBridgeConfig = {},
): Promise<string> {
  lazyInit(cfg);
  const name = totpCryptoKeyPath(cfg);
  let ciphertextBase64: string;
  try {
    const [response] = await kmsClient!.encrypt({
      name,
      plaintext: Buffer.from(plaintextBase32, 'utf8'),
    });
    if (!response.ciphertext) {
      throw new Error(`KMS encrypt returned no ciphertext for ${firebaseUid}`);
    }
    ciphertextBase64 = Buffer.from(response.ciphertext as Uint8Array).toString('base64');
  } catch (err) {
    if (isKmsPermissionDenied(err)) {
      throw new KmsPermissionError(
        'Service account lacks cloudkms.cryptoKeyVersions.useToEncrypt on totp-secrets-key.',
      );
    }
    throw err;
  }

  await firestoreClient!.collection(TOTP_SECRETS_COLLECTION).doc(firebaseUid).set(
    {
      encryptedSecret: ciphertextBase64,
      enabled: true,
      setupAt: new Date(),
    },
    { merge: true },
  );
  return ciphertextBase64;
}

/**
 * Expose the underlying Firestore + Auth + KMS clients for tests that
 * need finer-grained operations (e.g., user-level custom-claim writes,
 * Firebase Storage signed URLs). Callers should prefer the higher-level
 * helpers above when possible.
 */
export function bridgeInternals(cfg: AdminBridgeConfig = {}): {
  firestore: Firestore;
  auth: Auth;
  kms: KeyManagementServiceClient;
  serviceAccountPath: string;
} {
  lazyInit(cfg);
  return {
    firestore: firestoreClient!,
    auth: authClient!,
    kms: kmsClient!,
    serviceAccountPath: activeServiceAccountPath!,
  };
}
