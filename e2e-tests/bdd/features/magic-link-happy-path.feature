# Source of truth: checkitout-backend/src/test/resources/features/magic-link-happy-path.feature
#
# Real-email magic-link oracle vs the LIVE BE: a verification / password-reset
# email is actually SENT (BE -> GreenMail SMTP), the oobCode is extracted from
# the captured message, and the production endpoints consume it. The BE source
# performs a real Firebase login first; this oracle binds the session with the
# test-infra mock-session on the SAME real account email (the magic-link
# machinery acts on the Firebase account, not on how the session was minted).
# Firebase state (emailVerified, password, reset cooldown) is staged and
# restored through the /test hooks exactly like the BE glue does.
@authentication @magic-link @happy-path @be-suite:RunAuthenticationIT
Feature: Magic Link Happy Path
  As a user
  I want to verify my email and reset my password using magic links
  So that I can manage my account securely

  @verification
  Scenario: Email verification succeeds with valid oobCode
    Given real COMPANY credentials are available
    And the real company user is signed in for magic-link testing
    And the Firebase user has emailVerified set to false
    And the GreenMail inbox is cleared

    When the user requests a verification email
    Then a magic-link email arrives within 10 seconds
    And the oobCode is extracted from the email

    When the extracted oobCode is applied via apply-action-code
    Then the response status should be 200

    # Cleanup: restore the original verified state
    And the Firebase user has emailVerified set to true

  @password-reset
  Scenario: Password reset succeeds with valid oobCode
    Given real COMPANY credentials are available
    And the real company user is signed in for magic-link testing
    And the Firebase user has emailVerified set to true
    And the password reset cooldown is cleared
    And the GreenMail inbox is cleared

    When the user requests a password reset email
    Then a magic-link email arrives within 10 seconds
    And the oobCode is extracted from the email

    When the extracted oobCode is checked via verify-reset-code
    Then the response status should be 200
    When the password is reset via confirm-password-reset to "NewSecureE2ePass1"
    Then the response status should be 200
    And the user can log in with password "NewSecureE2ePass1"

    # Cleanup: restore the original password
    And the original password is restored
