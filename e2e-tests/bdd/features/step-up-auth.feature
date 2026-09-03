# Source of truth: checkitout-backend/src/test/resources/features/step-up-auth.feature
#
# Adaptations (every divergence also commented at its step):
# - The BE Background's three REAL-Firebase logins (company password login,
#   admin password + KMS-2FA, influencer Instagram OAuth) collapse to
#   per-scenario mock-session TestSessions — the BE mints the same HttpOnly
#   session cookie pair either way, and the login flows have their own
#   oracles (login.feature / admin-2fa-kms.feature / login-errors.feature).
# - company1/influencer1/pendingAdmin1 are FRESH per-scenario throwaway users
#   (stepup-<name>-<ts>@e2e.test): the email-changing scenarios must not leak
#   state into the shared fixed actors on the persistent dev DB. admin1 stays
#   the FIXED shared admin (stable uid → the Firestore totpSecrets/{uid} doc
#   is reused across runs, not accumulated).
# - "has emailVerified / initialAccountSetupCompleted set to X" go through the
#   SAME uid-keyed /test/registry hooks the BE glue calls; the Firebase half
#   of the BE's emailVerified toggle is skipped — mock-session uids do not
#   exist in the real Firebase project, and PG is what step-up reads.
# - Email-PATCH steps that assert 200 in the BE are swapped for step-up-filter
#   acceptance asserts (NOT 401; 200 or 502): with mock-session uids the BE's
#   downstream Firebase Auth email update 502s AFTER the step-up filter has
#   already accepted/consumed the token — semantics proven live by the
#   integration tier (e2e-tests/integration/flows/step-up-email-required.spec.ts).
# - Admin TOTP: the BE verifier KMS-decrypts Firestore totpSecrets/{uid}; this
#   port provisions that doc for the mock admin uid through the SAME KMS
#   bridge (read-first, seed-if-missing) and self-skips without
#   service-account/KMS access. PENDING_ADMIN self-skips when this BE
#   profile's mock-session rejects the role.
# - GreenMail is read over HTTP via TestEmailController (/api/test/email); the
#   "requests step-up code" step purges the inbox first, mirroring the BE
#   glue's greenMail.reset(). "restores … email to original value" cleanup
#   steps are no-ops: throwaway actors make the BE's Firebase-side restore
#   (update-firebase-user + sync-user-from-firestore, real-uid-only) moot.
# - The BE source asserts only statuses + required/challengeType/token fields,
#   never localized message text, so the messageKey rule is vacuously
#   satisfied — no EN-literal swaps were needed.
@step-up-auth @multi-actor @soft-assertions @be-suite:RunStepUpAuthIT
Feature: Step-Up Authentication for Email Change
  As a platform user
  I want to verify my identity before changing my email
  So that a stolen session cannot hijack my account

  # ============================================================================
  # HAPPY PATH: Company user full email change with step-up code
  # ============================================================================
  Scenario: COMPANY user completes full step-up email change flow
    # Adaptation: collapsed Background — mock-session seeding instead of real logins.
    Given "company1" is signed in via mock session
    And "admin1" is signed in via mock session
    And "company1" has emailVerified set to true
    And "company1" has initialAccountSetupCompleted set to true
    And "company1" stores their original profile values

    # Step 1: Check → EMAIL_CODE required
    When "company1" checks step-up requirement for "EMAIL_CHANGE"
    Then soft assert step-up status is 200
    And soft assert step-up challengeType is "EMAIL_CODE"

    # Step 2: Request code → email captured by GreenMail
    When "company1" requests step-up code for "EMAIL_CHANGE"
    Then soft assert step-up status is 200
    And GreenMail should have received at least 1 email(s) within 5 seconds
    And "company1" extracts the 6-digit code from the last GreenMail email

    # Step 3: Verify code → get one-time token
    When "company1" verifies step-up code for "EMAIL_CHANGE"
    Then soft assert step-up status is 200
    And soft assert step-up response contains token

    # Step 4: PATCH email with token
    When "company1" updates their email to "e2e-stepup-changed@test.com" with step-up token
    # Adaptation: BE asserts "update status is 200" — with a mock-session uid
    # the downstream Firebase email update can 502 after the step-up filter
    # accepted the token; the contract under test is NOT-401 (∈ {200, 502}).
    Then soft assert the email update was accepted by the step-up filter

    # Cleanup: restore original email via admin
    # Adaptation: no-op — the BE restore hooks need a REAL Firebase uid;
    # this scenario's company is a throwaway per-scenario user.
    When "admin1" restores user "company1" email to original value
    And all soft assertions should pass

  # ============================================================================
  # NEGATIVE: Email change without token → 401
  # ============================================================================
  Scenario: Email change without step-up token is rejected
    Given "company1" is signed in via mock session
    And "company1" has initialAccountSetupCompleted set to true
    When "company1" updates their email to "no-token@test.com"
    Then soft assert update status is 401
    And all soft assertions should pass

  # ============================================================================
  # POSITIVE: Non-email field does NOT require step-up
  # ============================================================================
  Scenario: Non-email field change succeeds without step-up
    Given "company1" is signed in via mock session
    And "admin1" is signed in via mock session
    And "company1" stores their original profile values
    When "company1" updates their firstName to "StepUpNotNeeded"
    Then soft assert update status is 200
    When "admin1" updates user "company1" firstName to original value
    And all soft assertions should pass

  # ============================================================================
  # NEGATIVE: PENDING_ADMIN — email change blocked
  # ============================================================================
  Scenario: PENDING_ADMIN cannot change email at all
    Given "pendingAdmin1" logs in as PENDING_ADMIN via mock session
    When "pendingAdmin1" checks step-up requirement for "EMAIL_CHANGE"
    Then soft assert step-up status is 403
    And all soft assertions should pass

  # ============================================================================
  # POSITIVE: Incomplete setup — step-up skipped, email change allowed
  # ============================================================================
  Scenario: Company user with incomplete setup can change email without step-up
    Given "company1" is signed in via mock session
    And "company1" has initialAccountSetupCompleted set to false
    When "company1" checks step-up requirement for "EMAIL_CHANGE"
    Then soft assert step-up status is 200
    And soft assert step-up required is false
    # Restore
    Given "company1" has initialAccountSetupCompleted set to true
    And all soft assertions should pass

  # ============================================================================
  # POSITIVE: INFLUENCER with incomplete setup — full email change without step-up
  # ============================================================================
  Scenario: INFLUENCER with incomplete setup can change email without step-up
    # Adaptation: the BE's real Instagram-OAuth influencer collapses to a
    # fresh mock-session INFLUENCER (OAuth has its own oracle: login.feature).
    Given "influencer1" is signed in via mock session
    And "admin1" is signed in via mock session
    And "influencer1" has initialAccountSetupCompleted set to false
    And "influencer1" stores their original profile values

    # Step 1: Check → required=false (setup incomplete, skip step-up)
    When "influencer1" checks step-up requirement for "EMAIL_CHANGE"
    Then soft assert step-up status is 200
    And soft assert step-up required is false

    # Step 2: PATCH email without token → should succeed
    When "influencer1" updates their email to "e2e-influencer-changed@test.com" without step-up token
    # Adaptation: BE asserts "update status is 200" — mock-session uids can 502
    # downstream in Firebase; the contract is "no step-up refusal (401/403/412)".
    Then soft assert the email update was not blocked by step-up

    # Cleanup: restore via admin + reset setup flag
    # Adaptation: restore is a no-op for the throwaway actor (see happy path).
    When "admin1" restores user "influencer1" email to original value
    Given "influencer1" has initialAccountSetupCompleted set to true
    And all soft assertions should pass

  # ============================================================================
  # HAPPY PATH: Admin email change via TOTP
  # ============================================================================
  Scenario: ADMIN user verifies via TOTP for email change
    # Adaptation: the BE Background's real admin (password + KMS-2FA) collapses
    # to the FIXED mock-session admin; the Firestore totpSecrets/{uid} doc the
    # BE verifier KMS-decrypts is provisioned through the SAME KMS bridge
    # (read-first, seed-if-missing). Self-skips without service-account/KMS.
    Given "admin1" is signed in via mock session
    And "admin1" has a KMS-provisioned TOTP secret for step-up
    When "admin1" checks step-up requirement for "EMAIL_CHANGE"
    Then soft assert step-up status is 200
    And soft assert step-up challengeType is "TOTP"

    When "admin1" verifies step-up with TOTP code
    Then soft assert step-up status is 200
    And soft assert step-up response contains token
    And all soft assertions should pass

  # ============================================================================
  # NEGATIVE: Token is one-time use
  # ============================================================================
  Scenario: Step-up token cannot be reused
    Given "company1" is signed in via mock session
    And "admin1" is signed in via mock session
    And "company1" has emailVerified set to true
    And "company1" has initialAccountSetupCompleted set to true
    And "company1" stores their original profile values

    When "company1" completes full step-up flow for "EMAIL_CHANGE"
    And "company1" updates their email to "reuse-test-1@test.com" with step-up token
    # Adaptation: BE asserts "update status is 200" — see the happy-path note
    # (token consumed either way; 200 or 502, never 401).
    Then soft assert the email update was accepted by the step-up filter

    # Email change incremented tokenVersion — refresh session to get fresh JWT
    # Adaptation: the BE's fresh password login collapses to re-seeding the
    # mock session on the same cookie jar (same email + role, flags untouched).
    When "company1" re-authenticates

    # Same step-up token again → should fail (token already consumed from Redis)
    When "company1" updates their email to "reuse-test-2@test.com" with step-up token
    Then soft assert update status is 401

    # Cleanup
    # Adaptation: no-op restore for the throwaway actor (see happy path).
    When "admin1" restores user "company1" email to original value
    And all soft assertions should pass

  # ============================================================================
  # NEGATIVE: Brute force — 5 wrong codes → cooldown
  # ============================================================================
  Scenario: Five wrong codes triggers cooldown
    Given "company1" is signed in via mock session
    And "company1" has emailVerified set to true
    And "company1" has initialAccountSetupCompleted set to true
    When "company1" requests step-up code for "EMAIL_CHANGE"
    Then soft assert step-up status is 200

    When "company1" submits wrong step-up code "000000" for "EMAIL_CHANGE"
    And "company1" submits wrong step-up code "000001" for "EMAIL_CHANGE"
    And "company1" submits wrong step-up code "000002" for "EMAIL_CHANGE"
    And "company1" submits wrong step-up code "000003" for "EMAIL_CHANGE"
    And "company1" submits wrong step-up code "000004" for "EMAIL_CHANGE"
    Then soft assert step-up status is 429
    And all soft assertions should pass
