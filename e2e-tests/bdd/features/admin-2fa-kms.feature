# FE-only: KMS decryption harness verification (test infrastructure, no BE
# Cucumber source — the BE consumes this same round-trip on /twofactor/verify,
# covered by the integration tier's @admin @2fa @kms login-real spec).
#
# The BE's admin-2FA login reads a TOTP secret from Firestore and KMS-decrypts
# it to validate the code. The FE test infra provisions + reads those secrets
# through e2e-tests/_framework/firebase-admin-bridge.ts (real GCP KMS). This
# scenario is the runnable proof that the KMS encrypt→decrypt round-trip works
# in this environment. The full mock-session /twofactor/verify oracle needs
# real partial-session 2FA state and stays a gated real-credential follow-up.
@admin @2fa @kms
Feature: KMS-decryption harness for admin TOTP secrets

  @kms-roundtrip
  Scenario: A TOTP secret provisioned via the KMS bridge decrypts back to the original
    Given the KMS-backed admin credential bridge is available
    When a TOTP secret is provisioned through the KMS bridge
    Then reading it back decrypts to the original secret
