# Source of truth: checkitout-backend/src/test/resources/features/profile/validation-edge-cases.feature
#
# Adaptations vs the BE source:
# - Login collapses to mock-session seeding (same HttpOnly session pair —
#   see profile-critical-consolidated.feature header).
# - "refreshes their session token" becomes "the ... session remains valid
#   without refresh": the greenfield session is an HttpOnly cookie pair with
#   no client-side refresh surface, and the BE refresh was defensive legacy —
#   profile edits no longer invalidate sessions (proven by
#   profile-critical-consolidated.feature). The port asserts the refresh
#   step's post-condition instead: the SAME session still passes /users/me.
# - Email: format-only attempt, expected 400 (NOT the BE source's 401): the
#   step-up gate (validateTokenIfRequired) self-skips for principals without
#   a completed 2FA setup. The BE corpus actor has 2FA, so the missing
#   X-Step-Up-Token 401s before validation; this port's mock-session actor
#   has none, so entity @Email validation answers 400. Successful email
#   changes stay out (they would mutate real Firebase Auth — see the BE
#   source's FirebaseEmailRestoreIT poisoning note).
# - Invalid-value preference payloads (language "verylonglanguagecode",
#   communicationFrequency "INVALID") are sent through a deliberately
#   off-contract raw body; the steps first assert the value is genuinely NOT a
#   member of the generated enum, so if the BE ever legalises the value the
#   oracle breaks at the contract guard.
# - Soft assertions map to Playwright expect.soft; "all soft assertions
#   should pass" is the native soft-failure flush marker.
@validation-edge-cases @consolidated @be-suite:RunConsolidatedIT
Feature: Profile Validation Edge Cases (Consolidated)
  As a system
  I want to validate all profile field inputs
  So that data integrity is maintained

  This feature tests boundary conditions and validation rules for:
  - firstName, lastName (2-50 chars)
  - email (step-up gate fires before format validation)
  - phoneNumber (7-25 chars, allowed chars: digits, +, -, spaces, parentheses)
  - profilePicture (HTTPS URLs, max 2048 chars)
  - companyDescription (max 1000 chars)
  - nip/taxId (max 20 chars)
  - addresses (required fields, max lengths)
  - preferences (enum values, max lengths)

  @company @soft-assertions
  Scenario: Company profile validation - all edge cases (consolidated - 20+ assertions)
    Given the company actor is signed in for profile editing

    # ===== FIRSTNAME VALIDATION =====
    # ----- Too short (< 2 chars) -----
    When the company attempts to update firstName with value "A"
    Then soft assert response status is 400
    And soft assert error contains validation error for firstName

    # ----- Too long (> 50 chars) -----
    When the company attempts to update firstName with value that is 51 characters
    Then soft assert response status is 400
    And soft assert error contains validation error for firstName

    # ----- Valid boundary (exactly 2 chars) -----
    When the company attempts to update firstName with value "AB"
    Then soft assert response status is 200
    # Critical field updated successfully - session must survive without refresh
    And the company session remains valid without refresh

    # ----- Valid boundary (exactly 50 chars) -----
    When the company attempts to update firstName with value that is 50 characters
    Then soft assert response status is 200
    And the company session remains valid without refresh

    # ===== LASTNAME VALIDATION =====
    When the company attempts to update lastName with value "X"
    Then soft assert response status is 400

    # ===== EMAIL VALIDATION =====
    # Email format validation only - no actual email mutation.
    #
    # This step used to expect 400 and say the port diverged from the BE source
    # because a mock-session actor has no step-up setup. That stopped being true
    # on 2026-06-10, when TestAuthController started defaulting
    # initialAccountSetupCompleted to TRUE for oracle actors — its own comment
    # names this scenario as what an unset flag had been silently breaking.
    #
    # So step-up IS required for this actor, validateTokenIfRequired does not
    # self-skip, and the missing X-Step-Up-Token is refused before @Email
    # validation ever runs. 401 is the correct answer and the BE corpus has
    # expected it all along; the port was asserting a precondition it no longer
    # had. Specs that genuinely need an incomplete setup pass setupCompleted
    # false explicitly.
    When the company attempts to update email with value "not-an-email"
    Then soft assert response status is 401

    # ===== PHONE NUMBER VALIDATION =====
    # ----- Invalid format -----
    When the company attempts to update phoneNumber with value "abc123"
    Then soft assert response status is 400

    # ----- Too short (< 7 chars) -----
    When the company attempts to update phoneNumber with value "12345"
    Then soft assert response status is 400

    # ----- Too long (> 25 chars) -----
    When the company attempts to update phoneNumber with value "+12345678901234567890123456"
    Then soft assert response status is 400

    # ----- Valid international format -----
    When the company attempts to update phoneNumber with value "+48-123-456-789"
    Then soft assert response status is 200
    And the company session remains valid without refresh

    # ----- Valid with parentheses -----
    When the company attempts to update phoneNumber with value "+1(555)123-4567"
    Then soft assert response status is 200
    And the company session remains valid without refresh

    # ===== PROFILE PICTURE — uploadId-only (pentest 3.1) =====
    # The avatar is set ONLY from a tracked upload the caller made (uploadId
    # resolved against the file_uploads ownership table). A raw URL — foreign
    # OR own-bucket — is not a valid uploadId and is rejected, so the client
    # cannot point the avatar at any other file in the bucket. The happy path
    # (real upload → uploadId → 200) is the signed-URL round-trip scenario in
    # profile-non-critical-consolidated.feature.
    # ----- foreign http URL -----
    When the company attempts to update profilePicture with value "http://example.com/photo.jpg"
    Then soft assert response status is 400

    # ----- foreign https URL -----
    When the company attempts to update profilePicture with value "https://example.com/photo.jpg"
    Then soft assert response status is 400

    # ----- an own-bucket URL is STILL rejected (not a tracked owned upload) -----
    When the company attempts to update profilePicture with value "https://firebasestorage.googleapis.com/v0/b/check-it-out-47c50.firebasestorage.app/o/content%2Fsomeone-else%2Fphoto.jpg"
    Then soft assert response status is 400

    # ----- oversized value -----
    When the company attempts to update profilePicture with URL of 2049 characters
    Then soft assert response status is 400

    # ===== COMPANY DESCRIPTION VALIDATION =====
    # ----- Too long (> 1000 chars) -----
    When the company attempts to update companyDescription with value that is 1001 characters
    Then soft assert response status is 400

    # ----- Valid at boundary (1000 chars) -----
    When the company attempts to update companyDescription with value that is 1000 characters
    Then soft assert response status is 200
    # companyDescription is non-critical, no refresh needed

    # ===== NIP VALIDATION =====
    # ----- Too long (> 20 chars) -----
    When the company attempts to update nip with value "123456789012345678901"
    Then soft assert response status is 400

    # ----- Valid at boundary (20 chars) -----
    When the company attempts to update nip with value "12345678901234567890"
    Then soft assert response status is 200
    And the company session remains valid without refresh

    # ===== ADDRESS VALIDATION =====
    # ----- Missing required field (street) -----
    When the company attempts to create address without street
    Then soft assert response status is 400

    # ----- Missing required field (city) -----
    When the company attempts to create address without city
    Then soft assert response status is 400

    # ----- Missing required field (country) -----
    When the company attempts to create address without country
    Then soft assert response status is 400

    # ----- Street too long (> 255 chars) -----
    When the company attempts to create address with street of 256 characters
    Then soft assert response status is 400

    # ----- Valid complete address -----
    When the company creates valid address with all fields
    Then soft assert address creation status is 200 or 201
    # Cleanup
    When the company deletes the created address

    # ----- FINAL -----
    Then all soft assertions should pass

  @company @preferences @soft-assertions
  Scenario: Preferences validation - all edge cases (consolidated - 10+ assertions)
    Given the company actor is signed in for profile editing

    # ===== LANGUAGE VALIDATION =====
    # ----- Valid value -----
    When the company updates preferences with language en
    Then soft assert response status is 200

    When the company updates preferences with language pl
    Then soft assert response status is 200

    # ----- Too long (> 10 chars) -----
    When the company attempts to update preferences with language "verylonglanguagecode"
    Then soft assert response status is 400

    # ===== TIMEZONE VALIDATION =====
    # ----- Valid value -----
    When the company updates preferences with timezone Europe/Warsaw
    Then soft assert response status is 200

    # ----- Too long (> 50 chars) -----
    When the company attempts to update preferences with timezone of 51 characters
    Then soft assert response status is 400

    # ===== COMMUNICATION FREQUENCY VALIDATION =====
    When the company updates preferences with communicationFrequency IMMEDIATE
    Then soft assert response status is 200

    When the company updates preferences with communicationFrequency HOURLY_DIGEST
    Then soft assert response status is 200

    When the company updates preferences with communicationFrequency DAILY_DIGEST
    Then soft assert response status is 200

    When the company updates preferences with communicationFrequency WEEKLY_DIGEST
    Then soft assert response status is 200

    # ----- Invalid enum value -----
    When the company attempts to update preferences with communicationFrequency "INVALID"
    Then soft assert response status is 400

    # ===== BOOLEAN TOGGLES =====
    When the company updates preferences with gdprMarketingConsent true
    Then soft assert response status is 200

    When the company updates preferences with sharePhoneForPayments false
    Then soft assert response status is 200

    # ----- FINAL -----
    Then all soft assertions should pass
