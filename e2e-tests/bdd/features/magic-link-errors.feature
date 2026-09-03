# Source of truth: checkitout-backend/src/test/resources/features/magic-link-errors.feature
#
# Adaptations (BE glue -> FE oracle):
# - Background "the application is running with real Redis" is dropped: Redis
#   is a BE-internal dependency the FE surface cannot observe; the shared
#   Before hook (fixtures.ts) already health-checks the live BE, and the
#   single-use tiers below PROVE the Redis-backed invalidation through the
#   public API contract.
# - Tier 1-2 run anonymously through an unauthenticated TestSession, same as
#   the BE (which staged only Redis). Docstring / raw bodies are posted
#   VERBATIM — no serialization — mirroring the BE glue's
#   sendPostWithDocString / sendPostWithRawBody.
# - Tier 3-5 login preamble ("... is synced from Firestore", real Firebase
#   login, token exchange, "the current email is ...") is collapsed to the
#   shared mock-session seeding on the REAL company account email ("the real
#   company user is signed in for magic-link testing", magic-link.steps.ts):
#   the BE issues the same HttpOnly session cookie either way, and the
#   magic-link machinery acts on the Firebase ACCOUNT, not on how the session
#   was minted. The corpus company UID stays pinned in the steps. These
#   scenarios are gated on real credentials (e2e-tests/.env) via
#   "real COMPANY credentials are available" — they self-skip without them.
# - "I send <endpoint> with the extracted oobCode" steps reuse the FE
#   phrasing already registered by the happy-path oracle ("the extracted
#   oobCode is applied via apply-action-code" etc.) — identical mechanics,
#   one shared implementation.
# - Cleanup "the Firebase user has password 'Janekmapsa66!ppp'" becomes the
#   shared "the original password is restored" step: the password comes from
#   e2e-tests/.env (never hardcoded in this repo) and the step additionally
#   proves the restored credentials still log in.
@authentication @magic-link @negative @be-suite:RunAuthenticationIT
Feature: Magic Link Error Handling
  As a security-conscious platform
  I want to return appropriate errors for invalid magic link operations
  So that users understand failures without exposing security details

  # ===========================================================================
  # TIER 1: DTO VALIDATION — apply-action-code & verify-reset-code
  # ===========================================================================

  @dto-validation
  Scenario Outline: <endpoint_name> rejects blank or missing oobCode (<case_name>)
    When I send a POST to "<endpoint>" with body:
      """
      <json_body>
      """
    Then the response status should be 400
    And the validation error for "oobCode" should be "Action code is required"

    Examples:
      | endpoint_name     | case_name     | endpoint                         | json_body      |
      | apply-action-code | blank oobCode | /auth/firebase/apply-action-code | {"oobCode":""} |
      | apply-action-code | missing field | /auth/firebase/apply-action-code | {}             |
      | verify-reset-code | blank oobCode | /auth/firebase/verify-reset-code | {"oobCode":""} |
      | verify-reset-code | missing field | /auth/firebase/verify-reset-code | {}             |

  # ===========================================================================
  # TIER 1: DTO VALIDATION — confirm-password-reset
  # ===========================================================================

  @dto-validation
  Scenario Outline: confirm-password-reset rejects invalid input: <case_name>
    When I send a POST to "/auth/firebase/confirm-password-reset" with body:
      """
      <json_body>
      """
    Then the response status should be 400
    And the validation error for "<field>" should contain "<expected_fragment>"

    Examples:
      | case_name           | json_body                                 | field       | expected_fragment        |
      | blank oobCode       | {"oobCode":"","newPassword":"ValidPass1"} | oobCode     | Action code is required  |
      | missing oobCode     | {"newPassword":"ValidPass1"}              | oobCode     | Action code is required  |
      | blank password      | {"oobCode":"x","newPassword":""}          | newPassword | password                 |
      | missing password    | {"oobCode":"x"}                           | newPassword | New password is required |
      | password too short  | {"oobCode":"x","newPassword":"Ab1"}       | newPassword | at least                 |
      | password no digits  | {"oobCode":"x","newPassword":"abcdefgh"}  | newPassword | letter and one digit     |
      | password no letters | {"oobCode":"x","newPassword":"12345678"}  | newPassword | letter and one digit     |

  @dto-validation
  Scenario: confirm-password-reset rejects password exceeding maximum length
    When I send confirm-password-reset with oobCode "x" and a password exceeding maximum length
    Then the response status should be 400

  @dto-validation
  Scenario: confirm-password-reset rejects completely empty body
    When I send a POST to "/auth/firebase/confirm-password-reset" with body:
      """
      {}
      """
    Then the response status should be 400
    And the validation error for "oobCode" should be "Action code is required"
    And the validation error for "newPassword" should be "New password is required"

  # ===========================================================================
  # TIER 1: MALFORMED JSON
  # ===========================================================================

  @dto-validation @malformed-json
  Scenario: Magic link endpoints reject malformed JSON (consolidated)
    # ----- TEST 1: apply-action-code -----
    When I send a POST to "/auth/firebase/apply-action-code" with raw body "{invalid json"
    Then the response status should be 400
    And the error message should contain "invalid JSON"

    # ----- TEST 2: confirm-password-reset -----
    When I send a POST to "/auth/firebase/confirm-password-reset" with raw body "not json"
    Then the response status should be 400
    And the error message should contain "invalid JSON"

  # ===========================================================================
  # TIER 2: FIREBASE ERROR — GARBAGE oobCode (consolidated)
  # ===========================================================================

  @firebase-error @consolidated
  Scenario: All magic link endpoints reject garbage oobCode (consolidated)
    # ----- TEST 1: apply-action-code with garbage oobCode -----
    When I send apply-action-code with oobCode "GARBAGE_E2E_INVALID_CODE_12345"
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"
    And the response should have a request ID

    # ----- TEST 2: verify-reset-code with garbage oobCode -----
    When I send verify-reset-code with oobCode "GARBAGE_E2E_INVALID_CODE_12345"
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"

    # ----- TEST 3: confirm-password-reset with garbage oobCode -----
    When I send confirm-password-reset with oobCode "GARBAGE_E2E_INVALID_CODE_12345" and newPassword "ValidPass1"
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"

  # ===========================================================================
  # TIER 3: ALREADY-USED VERIFICATION oobCode
  # (BE preamble uses a real Firebase login; collapsed here — see header)
  # ===========================================================================

  @firebase-error @oob-lifecycle @verification
  Scenario: apply-action-code fails when verification oobCode is already used
    Given real COMPANY credentials are available
    And the real company user is signed in for magic-link testing
    And the Firebase user has emailVerified set to false

    # Generate oobCode directly (bypasses email + Firebase rate limit)
    When I generate a verification oobCode via test endpoint

    # First use: apply the code (should succeed)
    When the extracted oobCode is applied via apply-action-code
    Then the response status should be 200

    # Second use: same code should fail (invalidated in Redis)
    When the extracted oobCode is applied via apply-action-code
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"

    # Cleanup: restore emailVerified to true
    And the Firebase user has emailVerified set to true

  # ===========================================================================
  # TIER 4: ALREADY-USED PASSWORD RESET oobCode (consolidated)
  # ===========================================================================

  @firebase-error @oob-lifecycle @password-reset
  Scenario: Password reset endpoints fail when oobCode is already consumed (consolidated)
    Given real COMPANY credentials are available
    And the real company user is signed in for magic-link testing
    And the Firebase user has emailVerified set to true
    And the password reset cooldown is cleared

    # Generate oobCode directly (bypasses email + Firebase rate limit)
    When I generate a password reset oobCode via test endpoint

    # First use: confirm password reset (should succeed)
    When the password is reset via confirm-password-reset to "NewSecureE2ePass1"
    Then the response status should be 200

    # ----- TEST 1: verify-reset-code with consumed oobCode -----
    When the extracted oobCode is checked via verify-reset-code
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"

    # ----- TEST 2: confirm-password-reset again with consumed oobCode -----
    When the password is reset via confirm-password-reset to "AnotherPass1"
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"

    # Cleanup: restore original password (from e2e-tests/.env, login-verified)
    And the original password is restored

  # ===========================================================================
  # TIER 5: CROSS-ENDPOINT oobCode MISUSE
  # ===========================================================================

  @firebase-error @oob-lifecycle @cross-endpoint
  Scenario: Verification oobCode rejected by password reset endpoints
    Given real COMPANY credentials are available
    And the real company user is signed in for magic-link testing
    And the Firebase user has emailVerified set to false
    When I generate a verification oobCode via test endpoint

    # ----- TEST 1: Use verification oobCode with verify-reset-code -----
    When the extracted oobCode is checked via verify-reset-code
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"

    # ----- TEST 2: Use verification oobCode with confirm-password-reset -----
    When the password is reset via confirm-password-reset to "ValidPass1"
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"

    # Cleanup: restore emailVerified to true
    And the Firebase user has emailVerified set to true

  @firebase-error @oob-lifecycle @cross-endpoint
  Scenario: Password reset oobCode rejected by apply-action-code
    Given real COMPANY credentials are available
    And the real company user is signed in for magic-link testing
    And the Firebase user has emailVerified set to true
    And the password reset cooldown is cleared
    When I generate a password reset oobCode via test endpoint

    # Use password reset oobCode with apply-action-code (wrong endpoint)
    # Password reset oobCode is NOT in the Redis verification store -> invalid
    When the extracted oobCode is applied via apply-action-code
    Then the response status should be 400
    And the response messageKey should be "error.auth.invalid_action_code"
