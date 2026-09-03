import {
  isBridgeAvailable,
  readTotpSecret,
  seedTotpSecret,
} from '../../_framework/firebase-admin-bridge';
import { ADMIN_TEST_TOTP_SECRET } from '../../_framework/totp';
import { Given, When, Then, expect, test } from './fixtures';

/**
 * KMS-decryption harness verification (admin-2fa-kms.feature). The BE's
 * admin-2FA login reads a TOTP secret from Firestore and KMS-DECRYPTS it to
 * validate the code; the FE test infra needs the SAME KMS round-trip to
 * provision + read those secrets (e2e-tests/_framework/firebase-admin-bridge.ts,
 * used by the integration tier's @admin @2fa @kms real-login spec).
 *
 * This oracle exercises that real GCP KMS path end-to-end: seed
 * (KMS ENCRYPT + Firestore write) then read back (KMS DECRYPT), asserting the
 * decrypted value equals the input. It is the runnable proof that KMS
 * decryption works in this environment — the same operation the BE performs
 * on /twofactor/verify. Gated on isBridgeAvailable() so a machine without
 * GCP service-account + KMS access reports skipped, not failed.
 *
 * The full mock-session-driven /twofactor/verify oracle needs the real
 * partial-session 2FA state (the endpoint 401s a mock session); that stays a
 * gated real-credential follow-up mirroring login-real.spec.ts.
 */

const PROBE_UID = 'e2e-bdd-kms-probe';

Given('the KMS-backed admin credential bridge is available', async ({ world }) => {
  test.skip(
    !isBridgeAvailable(),
    'Firebase Admin bridge unavailable (service-account.json / KMS) — see e2e-tests/.env.example',
  );
  world.adminUid = PROBE_UID;
});

When('a TOTP secret is provisioned through the KMS bridge', async ({ world }) => {
  // KMS ENCRYPT the well-known test vector and store it in Firestore under
  // the probe uid — exactly how the production provisioning script seeds an
  // admin's totpSecrets/{uid}.encryptedSecret.
  await seedTotpSecret(world.adminUid!, ADMIN_TEST_TOTP_SECRET);
});

Then('reading it back decrypts to the original secret', async ({ world }) => {
  // KMS DECRYPT — the same round-trip the BE runs to validate a 2FA code.
  const decrypted = await readTotpSecret(world.adminUid!);
  expect(decrypted, 'KMS-decrypted TOTP secret must match the provisioned value').toBe(
    ADMIN_TEST_TOTP_SECRET,
  );
});
