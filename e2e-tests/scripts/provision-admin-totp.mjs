#!/usr/bin/env node
/**
 * One-time provisioning: seed the well-known test TOTP secret
 * (`JBSWY3DPEHPK3PXP`) into Firestore for the test admin actor,
 * KMS-encrypted exactly the way the BE produces the blob.
 *
 * After this runs once per environment, all admin-2FA integration
 * specs that read `totpSecrets/{adminFirebaseUid}.encryptedSecret`
 * via the Firebase Admin bridge can decrypt + generate codes via
 * `currentTotpCode(JBSWY3DPEHPK3PXP)` and exercise the BE's
 * `POST /twofactor/verify` flow end-to-end against the live BE.
 *
 * Idempotent: re-running re-encrypts the same plaintext + writes
 * with `merge:true`. The `enabled: true` flag is set so BE's
 * `is2FAEnabled` check returns true on next admin login.
 *
 * Usage:
 *   node e2e-tests/scripts/provision-admin-totp.mjs
 *   node e2e-tests/scripts/provision-admin-totp.mjs <firebaseUid>
 *
 * Reads:
 *   ADMIN_FIREBASE_UID         — defaults to 85VJgS6shAWTqby4rHypN355RWv2
 *   E2E_GCP_SERVICE_ACCOUNT_JSON_PATH — bridge config (see e2e-tests/.env.example)
 *
 * Requires bridge config to resolve a service-account.json with
 * `cloudkms.cryptoKeyVersions.useToEncrypt` on
 * `projects/check-it-out-47c50/.../cryptoKeys/totp-secrets-key`.
 */
import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '..', '.env') });

const WELL_KNOWN_TEST_SECRET = 'JBSWY3DPEHPK3PXP'; // RFC 4226/6238 standard vector

async function main() {
  // Resolve service-account path explicitly here so the bridge stays
  // ESM-agnostic. Bridge uses __dirname internally (works under Jest's
  // CJS); when invoked from this ESM script via --experimental-strip-
  // types, `__dirname` is undefined inside the bridge module — so we
  // pass `cfg.serviceAccountPath` directly to short-circuit the
  // default-resolution path entirely.
  const candidates = [
    process.env['E2E_GCP_SERVICE_ACCOUNT_JSON_PATH'],
    process.env['GOOGLE_APPLICATION_CREDENTIALS'],
    path.resolve(__dirname, '..', '..', '..', 'checkitout-backend', 'src', 'main', 'resources', 'service-account.json'),
  ].filter(Boolean);

  const fs = await import('node:fs');
  const serviceAccountPath = candidates.find((c) => fs.existsSync(c));
  if (!serviceAccountPath) {
    console.error(
      '[provision-admin-totp] service-account.json not found. Tried:\n  ' +
        candidates.join('\n  '),
    );
    process.exit(2);
  }
  console.log(`[provision-admin-totp] Using service-account: ${serviceAccountPath}`);

  // Dynamic import after dotenv load so the bridge sees env vars.
  const { seedTotpSecret, readTotpSecret, BridgeUnavailableError } = await import(
    '../_framework/firebase-admin-bridge.ts'
  );

  const adminUid =
    process.argv[2] ?? process.env['ADMIN_FIREBASE_UID'] ?? '85VJgS6shAWTqby4rHypN355RWv2';
  console.log(`[provision-admin-totp] Target admin firebaseUid: ${adminUid}`);
  console.log(`[provision-admin-totp] Plaintext secret: ${WELL_KNOWN_TEST_SECRET}`);

  try {
    const ciphertext = await seedTotpSecret(adminUid, WELL_KNOWN_TEST_SECRET, {
      serviceAccountPath,
    });
    console.log(
      `[provision-admin-totp] KMS-encrypted ciphertext (${ciphertext.length} chars base64) written to totpSecrets/${adminUid}.encryptedSecret`,
    );

    // Round-trip verification — decrypt should return the same plaintext.
    const decrypted = await readTotpSecret(adminUid, { serviceAccountPath });
    if (decrypted !== WELL_KNOWN_TEST_SECRET) {
      console.error(
        `[provision-admin-totp] ROUND-TRIP MISMATCH: wrote "${WELL_KNOWN_TEST_SECRET}" but decrypt returned "${decrypted}". KMS key drift OR Firestore write didn't persist.`,
      );
      process.exit(3);
    }
    console.log(
      `[provision-admin-totp] ✓ Round-trip verified: KMS decrypt of stored blob matches plaintext.`,
    );
    console.log(`[provision-admin-totp] ✓ Provisioning complete. Admin-2FA tests can now run.`);
  } catch (err) {
    if (err instanceof BridgeUnavailableError) {
      console.error(`[provision-admin-totp] Bridge unavailable: ${err.message}`);
      process.exit(2);
    }
    console.error(`[provision-admin-totp] Failed: ${err.message ?? err}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
