# Source of truth: checkitout-backend/src/test/resources/features/profile/profile-critical-consolidated.feature
#
# Adaptations vs the BE source (scenario-for-scenario otherwise):
# - Login variants collapse to mock-session seeding: the BE's real-Firebase
#   COMPANY password login, INFLUENCER Instagram-OAuth login and ADMIN
#   password+KMS-2FA login all end in the SAME HttpOnly session cookie pair,
#   and this oracle only exercises what happens to that session AFTER profile
#   edits. Login fidelity itself is proven by login.feature / admin-2fa-kms.feature.
# - "stores their current token as original_token" + "using stored token ...
#   calling /users/me should return 200" become session-cookie continuity:
#   the greenfield FE holds no client-readable token, so the faithful check is
#   that the SAME TestSession cookie jar minted at sign-in still passes
#   GET /users/me after each critical-field edit (an invalidation would surface
#   as 401/419 — see integration/flows/profile-critical-fields.spec.ts).
# - BE actor aliases ("company1"/"admin1") become roles bound to the fixed
#   mock-session actors (company1@e2e.test, influencer1@e2e.test, admin1@e2e.test).
# - The "Firebase Login Limit: 150/hr" Background comment is dropped —
#   mock-session consumes no Firebase logins.
# - Soft assertions map to Playwright expect.soft; the closing "all soft
#   assertions should pass" is the native soft-failure flush marker.
# - The BE title says "token invalidation" but its body proves the OPPOSITE
#   (edits keep the session valid and the account ACTIVE — UserService: "Profile
#   field edits no longer trigger status transitions"). Title kept verbatim.
@profile-critical @token-invalidation @consolidated @be-suite:RunConsolidatedIT
Feature: Profile Field Changes Without Status Penalty (Consolidated)
  As a user (Company or Influencer)
  I want to edit my profile fields without losing my ACTIVE status
  So that I can correct typos and update my information freely

  Profile field edits are validated (format, length, etc.) but do NOT
  change account status or invalidate sessions. Users stay ACTIVE.

  @company @multi-actor @soft-assertions
  Scenario: Company critical field changes with token invalidation (consolidated - 12+ assertions)
    Given the company actor is signed in for profile editing
    And the company stores their original profile values
    And the admin actor is signed in for profile cleanup

    # ----- TEST 1: FIRSTNAME CHANGE -> STAYS ACTIVE (no session invalidation) -----
    When the company updates their firstName to "E2EUpdatedFirst"
    Then soft assert update status is 200
    # Session should still be valid (no invalidation on profile edit)
    Then the company original session calling "/users/me" should return 200
    And soft assert the company accountStatus is "ACTIVE"

    # ----- TEST 2: LASTNAME CHANGE -> STAYS ACTIVE -----
    When the company updates their lastName to "E2EUpdatedLast"
    Then soft assert update status is 200
    And soft assert the company accountStatus is "ACTIVE"
    Then the company original session calling "/users/me" should return 200

    # ----- TEST 3: PHONENUMBER CHANGE -----
    When the company updates their phoneNumber to "+48123456789"
    Then soft assert update status is 200

    # ----- TEST 4: NAME (BUSINESS NAME) CHANGE -----
    When the company updates their name to "E2E Test Company Updated"
    Then soft assert update status is 200

    # ----- TEST 5: NIP CHANGE -----
    When the company updates their nip to "1234567890"
    Then soft assert update status is 200

    # ----- CLEANUP: RESTORE ORIGINAL VALUES -----
    When the admin updates the company firstName to original value
    And the admin updates the company lastName to original value
    Then the company can see their account status as "ACTIVE"

    # ----- FINAL -----
    Then all soft assertions should pass

  @influencer @multi-actor @soft-assertions
  Scenario: Influencer critical field changes with token invalidation (consolidated - 8+ assertions)
    Given the influencer actor is signed in for profile editing
    And the influencer stores their original profile values
    And the admin actor is signed in for profile cleanup

    # ----- TEST 1: FIRSTNAME CHANGE -> STAYS ACTIVE (no session invalidation) -----
    When the influencer updates their firstName to "InfluencerUpdated"
    Then soft assert update status is 200
    # Session should still be valid (no invalidation on profile edit)
    Then the influencer original session calling "/users/me" should return 200
    And soft assert the influencer accountStatus is "ACTIVE"

    # ----- TEST 2: ADDITIONAL CHANGES -> STAYS ACTIVE -----
    When the influencer updates their lastName to "UpdatedLast"
    Then soft assert update status is 200
    Then the influencer original session calling "/users/me" should return 200
    When the influencer updates their phoneNumber to "+48987654321"
    Then soft assert update status is 200

    # ----- CLEANUP -----
    When the admin restores the influencer original profile values
    Then the influencer can see their account status as "ACTIVE"

    Then all soft assertions should pass
