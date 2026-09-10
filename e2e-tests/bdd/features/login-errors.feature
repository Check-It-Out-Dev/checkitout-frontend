# Source of truth: checkitout-backend/src/test/resources/features/login-errors.feature
#
# Negative-path auth oracle vs the LIVE BE. The credential scenarios drive the
# REAL sign-in form: bad credentials fail at /api/auth/firebase/login (the BE's
# Identity-Toolkit proxy) with the anti-enumeration 401 "Invalid credentials
# provided" (same message for unknown email and wrong password), and the form
# must surface its error state. The consolidated invalid-TOTP scenario performs
# ONE real admin login (mirrors the BE's quota-conscious consolidation), then
# submits three invalid codes through the TwoFactorVerifyDialog — each must be
# rejected with 400 "Invalid verification code" and keep the dialog open. The
# OAuth/token error scenarios assert the BE's 400 contracts directly.
# ADAPTATION (2026-09-02, fresh-DB dictionary): the BE localizes `message`
# through the DB dictionary (returned Polish once the Liquibase-seeded rows
# came back), so the EN literals from the BE source are locale-fragile in
# this oracle. We assert the `messageKey` contract field instead — the
# stable, locale-independent identifier the FE itself keys translations on.
@authentication @login @error @negative @be-suite:RunAuthenticationIT
Feature: Authentication Error Handling
  As a security-conscious platform
  I want to return appropriate error messages for invalid credentials
  So that users understand authentication failures without exposing security details

  @company @invalid-credentials
  Scenario Outline: Company login fails with invalid credentials
    When the user attempts to sign in with email "<email>" and password "<password>"
    Then the sign-in attempt is rejected with status 401 and message "error.auth.invalid_credentials"
    And the sign-in form shows the error state

    Examples:
      | email                              | password          |
      | nonexistent.user@example.com       | AnyPassword123!   |
      | e2e.company@test.com | WrongPassword123! |

  @admin @invalid-credentials
  Scenario Outline: Admin login fails with invalid credentials
    When the user attempts to sign in with email "<email>" and password "<password>"
    Then the sign-in attempt is rejected with status 401 and message "error.auth.invalid_credentials"
    And the sign-in form shows the error state

    Examples:
      | email                         | password          |
      | nonexistent.admin@example.com | AnyPassword123!   |
      | e2e.admin@test.com | WrongPassword123! |

  @admin @invalid-totp @2fa @kms @consolidated
  Scenario: Admin 2FA fails with all invalid TOTP codes (consolidated)
    Given real ADMIN credentials are available
    When the ADMIN user signs in through the sign-in form
    Then a two-factor challenge should be presented
    When the admin submits an invalid TOTP code "000000"
    Then the two-factor verification is rejected with "error.auth.2fa_invalid_code"
    When the admin submits an invalid TOTP code "123456"
    Then the two-factor verification is rejected with "error.auth.2fa_invalid_code"
    When the admin submits an invalid TOTP code "999999"
    Then the two-factor verification is rejected with "error.auth.2fa_invalid_code"

  @influencer @invalid-token @oauth
  Scenario: Influencer OAuth fails with non-existent Firebase UID
    When the influencer attempts the Instagram OAuth simulation with Firebase UID "NONEXISTENT_UID_12345"
    Then the response status should be 400
    And the error message should contain "Instagram"

  @influencer @invalid-token @oauth
  Scenario: Token exchange fails with a missing Firebase token
    When a token exchange is attempted without an idToken
    Then the response status should be 400
    And the error message should contain "required"
