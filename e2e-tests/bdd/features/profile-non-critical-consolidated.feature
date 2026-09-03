# Source of truth: checkitout-backend/src/test/resources/features/profile/profile-non-critical-consolidated.feature
#
# Adaptations vs the BE source:
# - Login variants collapse to mock-session seeding (same rationale as
#   profile-critical-consolidated.feature: identical HttpOnly session pair).
# - TEST 1 of each BE scenario (signed-URL profile-picture upload) is split
#   into its own @be-internal-gated scenario below: the dev BE usually boots
#   WITHOUT Firebase Storage (SignedUrlService is @ConditionalOnBean, so
#   /upload/** 404s) and the PUT goes to real storage.googleapis.com. The
#   gated scenarios self-skip when GET /upload/limits returns 404 and run the
#   FULL round-trip (request -> PUT -> confirm -> PATCH profilePicture) when
#   storage is configured. The avatar is uploadId-only since pentest 3.1
#   (a raw URL — foreign or own-bucket — is rejected), so the main scenarios
#   assert the REJECTION of the old raw-URL shortcut, and the gated
#   round-trip sends the captured uploadId for the 200 path.
# - The BE glue sends addressType "Test Address" (a free-string the endpoint
#   tolerates); this port stays on the generated contract enum
#   (AddressDtoInAddressTypeEnum.SECONDARY — non-primary, deletable).
# - Soft assertions map to Playwright expect.soft; "all soft assertions
#   should pass" is the native soft-failure flush marker.
@profile-non-critical @consolidated @be-suite:RunConsolidatedIT
Feature: Profile Non-Critical Field Changes (Consolidated)
  As a user (Company or Influencer)
  I want to update non-critical profile fields
  So that I can keep my profile information current without token invalidation

  Non-critical fields that do NOT trigger token version increment:
  - profilePicture
  - companyDescription
  - addresses (create, update, delete)
  - preferences (language, timezone, communication settings)

  @company @soft-assertions
  Scenario: Company profile - all non-critical field changes (consolidated - 10+ assertions)
    Given the company actor is signed in for profile editing

    # ----- TEST 1: PROFILE PICTURE is uploadId-only (pentest 3.1) -----
    # The avatar accepts ONLY a tracked uploadId the caller owns; a raw URL
    # (the old collapsed shortcut) is rejected. The positive path
    # (upload -> confirm -> PATCH uploadId -> 200) is the @be-internal-gated
    # round-trip scenario below.
    When the company updates their profilePicture to "https://example.com/test-photo.jpg"
    Then soft assert profile update status is 400

    # ----- TEST 2: COMPANY DESCRIPTION -----
    When the company updates their companyDescription to "E2E Test Description - Updated at timestamp"
    Then soft assert status 200 for description update
    And soft assert GET /users/me returns updated description

    # ----- TEST 3: ADD ADDRESS -----
    When the company creates address with street "E2E Test Street" city "Warsaw" postalCode "00-001" country "Poland"
    Then soft assert address creation status is 200 or 201
    And soft assert address appears in user addresses

    # ----- TEST 4: UPDATE ADDRESS -----
    When the company updates the created address city to "Kraków"
    Then soft assert address update status is 200

    # ----- TEST 5: DELETE NON-PRIMARY ADDRESS -----
    When the company deletes the created test address
    Then soft assert address deletion status is 200 or 204

    # ----- TEST 6: UPDATE PREFERENCES (LANGUAGE) -----
    When the company updates preferences with language pl
    Then soft assert preferences update status is 200

    # ----- TEST 7: UPDATE PREFERENCES (PRIVACY) -----
    When the company updates preferences with sharePhoneForPayments false
    Then soft assert preferences update status is 200

    # ----- TEST 8: BATCH PATCH REJECTS ATOMICALLY (uploadId-only avatar) -----
    # A batch carrying a raw-URL profilePicture is rejected as a whole: the
    # companyDescription in the same PATCH must NOT land. The follow-up GET
    # proves the description is still TEST 2's value (atomic rejection).
    When the company updates profilePicture and companyDescription together
    Then soft assert batch update status is 400
    And soft assert GET /users/me returns updated description

    # ----- FINAL VERIFICATION -----
    Then all soft assertions should pass

  @influencer @soft-assertions
  Scenario: Influencer profile - all non-critical field changes (consolidated - 8+ assertions)
    Given the influencer actor is signed in for profile editing

    # ----- TEST 1: PROFILE PICTURE is uploadId-only (pentest 3.1) -----
    # Raw URL rejected; positive path = @be-internal-gated round-trip below.
    When the influencer updates their profilePicture to "https://example.com/influencer-photo.png"
    Then soft assert profile update status is 400

    # ----- TEST 2: ADD ADDRESS -----
    When the influencer creates address with street "Influencer Street" city "Gdansk" postalCode "80-001" country "Poland"
    Then soft assert address creation status is 200 or 201

    # ----- TEST 3: UPDATE PREFERENCES -----
    When the influencer updates preferences with language "en" and sharePhoneForPayments true
    Then soft assert preferences update status is 200

    # ----- CLEANUP -----
    When the influencer deletes the created test address

    # ----- FINAL VERIFICATION -----
    Then all soft assertions should pass

  # @be-internal-gated: needs real Firebase Storage on the BE (SignedUrlService
  # bean absent in the default dev profile -> /upload/** 404) + outbound
  # network to storage.googleapis.com; self-skips via the availability Given.
  @company @soft-assertions @be-internal-gated
  Scenario: Company profile picture via signed URL (gated full round-trip of TEST 1)
    Given the company actor is signed in for profile editing
    And signed-url uploads are available on this stack
    When the company requests signed URL for file "test-photo.jpg" type "image/jpeg" size 500000
    Then soft assert signed URL response is successful
    When the company uploads file to signed URL
    Then soft assert upload succeeds
    When the company confirms upload
    Then soft assert confirm succeeds
    When the company updates their profilePicture to the uploaded URL
    Then soft assert profile update status is 200
    Then all soft assertions should pass

  # @be-internal-gated: same Firebase Storage + network gate as above.
  @influencer @soft-assertions @be-internal-gated
  Scenario: Influencer profile picture via signed URL (gated full round-trip of TEST 1)
    Given the influencer actor is signed in for profile editing
    And signed-url uploads are available on this stack
    When the influencer requests signed URL for file "influencer-photo.png" type "image/png" size 300000
    Then soft assert signed URL response is successful
    When the influencer uploads file to signed URL
    And the influencer confirms upload
    And the influencer updates their profilePicture to the uploaded URL
    Then soft assert profile update status is 200
    Then all soft assertions should pass
