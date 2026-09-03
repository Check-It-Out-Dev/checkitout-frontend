# Source of truth: checkitout-backend/src/test/resources/features/influencer-verification-password.feature
#
# Influencer onboarding gate vs the LIVE BE: when an influencer clicks their
# verification link they verify email AND set a password in ONE atomic step
# (complete-verification), so every activated influencer can log in with
# email+password even if Instagram OAuth is revoked. The BE source stages the
# actor with a real admin-2FA login + OAuth; this oracle uses the OAuth
# simulation (real Firestore Instagram token, server-side KMS decrypt — same
# hook the login oracle uses) and the /test reset hook, then drives the REAL
# email round-trip (GreenMail capture, QP-decode, oobCode) through the
# production endpoints. Final step restores the influencer's .env password so
# repeated runs and other real-credential oracles stay stable.
@influencer-verification @be-suite:RunInfluencerVerificationIT
Feature: Influencer email verification with password setup

  Background:
    Given the real influencer is signed in via the Instagram OAuth simulation

  @happy-path @influencer
  Scenario: Influencer verifies email and sets password via complete-verification
    Given the influencer is reset for verification
    And the GreenMail inbox is cleared
    When the influencer requests a verification email
    Then a magic-link email arrives within 10 seconds
    And the oobCode is extracted from the email

    When complete-verification is called with the extracted oobCode and password "TestPass1"
    Then the response status should be 200
    And the verification response should contain userType "INFLUENCER"
    And the influencer account status is "ACTIVE" after re-login
    And the influencer password is restored

  @happy-path @influencer
  Scenario: Influencer can re-verify after reset
    Given the influencer is reset for verification
    And the GreenMail inbox is cleared
    When the influencer requests a verification email
    Then a magic-link email arrives within 10 seconds
    And the oobCode is extracted from the email
    When complete-verification is called with the extracted oobCode and password "FirstPass1"
    Then the response status should be 200

    Given the influencer is reset for verification
    And the GreenMail inbox is cleared
    When the influencer requests a verification email
    Then a magic-link email arrives within 10 seconds
    And the oobCode is extracted from the email
    When complete-verification is called with the extracted oobCode and password "SecondPass1"
    Then the response status should be 200
    And the influencer account status is "ACTIVE" after re-login
    And the influencer password is restored

  @happy-path @influencer @account-activation
  Scenario: Influencer receives ACCOUNT_ACTIVATED notification after verification
    Given an admin enables all notification preferences for the influencer
    And the influencer is reset for verification
    And the GreenMail inbox is cleared
    When the influencer requests a verification email
    Then a magic-link email arrives within 10 seconds
    And the oobCode is extracted from the email
    When complete-verification is called with the extracted oobCode and password "NotifTest1"
    Then the response status should be 200

    And the influencer account status is "ACTIVE" after re-login
    Then the influencer has at least 1 unread notification
    And the newest notification has type "ACCOUNT_ACTIVATED"
    And the influencer password is restored

  @error @influencer
  Scenario: Invalid oobCode returns error
    When complete-verification is called with oobCode "TOTALLY_INVALID_CODE" and password "TestPass1"
    Then the response status should be 400
    And the response should contain messageKey "error.auth.invalid_action_code"
