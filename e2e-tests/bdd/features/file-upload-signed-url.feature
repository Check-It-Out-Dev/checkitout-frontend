# Source of truth: checkitout-backend/src/test/resources/features/files/file-upload-signed-url.feature
#
# Adaptations (BE Cucumber → FE oracle), scenario-for-scenario otherwise:
# - Real-Firebase logins collapse to mock-session TestSessions (S6 port rule):
#   the BE's COMPANY password login (UID WWXA9Deh…, Gmail address, password)
#   and the INFLUENCER OAuth login (UID SEWgdux…) both end in the same
#   HttpOnly session cookie pair the mock-session hook mints, and nothing in
#   this feature reads uid-keyed /test hooks or Instagram data — so the fixed
#   company1/influencer1 mock actors observe the identical /upload + /users
#   contract. The BE Background (Firebase 150-logins/hr budget note) is
#   comments-only and moot here: this port makes ZERO /auth/firebase/* calls.
# - Both scenarios are gated by an added probe Given ("signed-url uploads are
#   available to this actor"): FileUploadController is
#   @ConditionalOnBean(SignedUrlService.class), so on a BE without Firebase
#   Storage config every /upload/** route 404s and the scenarios self-skip
#   (precedent: profile-non-critical-consolidated / profile.steps.ts).
# - Step renames vs the BE source (same semantics; the profile oracle already
#   owns the BE-literal texts, bound to ITS scenario state):
#     '"X" confirms upload'                          → 'the X confirms the upload'
#     '"X" updates their profilePicture to the uploaded URL'
#       and '"X" updates profilePicture to publicUrl'
#                                → 'the X sets their profilePicture to the
#                                   uploaded public URL'
#   Quoted actor names ("company1") become 'the company' / 'the influencer',
#   the repo's BDD convention (actor identity lives in the Given).
# - 'uploads test webp image to signed URL': the BE glue silently converts
#   WebP→PNG before signing and uploading (Java ImageIO cannot encode WebP).
#   The FE port uploads REAL WebP bytes (RIFF/WEBP magic) under the image/webp
#   type the signed URL was minted for — strictly truer to the product
#   contract than the BE glue's substitution.
# - The validation Thens ('upload error contains validation for X') assert
#   exactly what the BE glue asserted: HTTP 400, nothing else. No message-text
#   assertions anywhere — the BE dictionary answers Polish on this DB and the
#   BE glue never read the error body.
# - Soft assertions ride Playwright expect.soft; 'all soft assertions should
#   pass' is the flush marker (profile oracle precedent).
@file-upload @signed-url @consolidated @consolidated-suite
Feature: File Upload via Signed URLs (Consolidated)
  As a user (Company or Influencer)
  I want to upload files using signed URLs
  So that I can securely upload content to Firebase Storage

  The upload flow:
  1. Request signed URL from backend (/upload/signed-url)
  2. Upload file directly to Firebase Storage (PUT to signed URL)
  3. Confirm upload with backend (/upload/confirm/{uploadId})
  4. Use the public URL in profile or content

  Supported formats: JPEG, PNG, WebP, GIF
  Max file size: 5MB (5,242,880 bytes)

  @company @soft-assertions @signed-url-gated
  Scenario: Company file upload - all scenarios via signed URL (consolidated - 15+ assertions)
    Given the company actor is signed in for file uploads
    And signed-url uploads are available to this actor

    # ----- TEST 1: SUCCESSFUL PROFILE PHOTO UPLOAD -----
    When the company requests a signed URL for file:
      | filename    | test-profile.jpg |
      | contentType | image/jpeg       |
      | fileSize    | 500000           |
      | uploadType  | PROFILE_PHOTO    |
    Then soft assert signed URL response status is 200
    And soft assert response contains uploadUrl
    And soft assert response contains publicUrl
    And soft assert response contains uploadId
    And soft assert uploadUrl starts with "https://storage.googleapis.com"

    When the company uploads test image (500KB) to the signed URL using PUT
    Then soft assert Firebase upload response is success (200-299)

    When the company confirms upload with uploadId and filePath
    Then soft assert confirm response status is 200

    When the company sets their profilePicture to the uploaded public URL
    Then soft assert profile update status is 200
    And soft assert GET /users/me shows the new profilePicture URL

    # ----- TEST 2: CONTENT UPLOAD (NON-PROFILE) -----
    When the company requests a signed URL for file:
      | filename    | campaign-image.png |
      | contentType | image/png          |
      | fileSize    | 1000000            |
      | uploadType  | CONTENT            |
    Then soft assert signed URL response status is 200
    When the company uploads test image (1MB) to the signed URL using PUT
    Then soft assert upload succeeds
    When the company confirms the upload
    Then soft assert confirm succeeds

    # ----- TEST 3: FILE TOO LARGE (> 10MB) - VALIDATION ERROR -----
    When the company requests a signed URL for file:
      | filename    | huge-image.jpg |
      | contentType | image/jpeg     |
      | fileSize    | 15000000       |
      | uploadType  | CONTENT        |
    Then soft assert response status is 400
    And soft assert upload error contains validation for fileSize

    # ----- TEST 4: INVALID CONTENT TYPE -----
    When the company requests a signed URL for file:
      | filename    | document.pdf    |
      | contentType | application/pdf |
      | fileSize    | 500000          |
    Then soft assert response status is 400
    And soft assert upload error contains validation for contentType

    # ----- TEST 5: FILE SIZE AT BOUNDARY (exactly 5MB) -----
    When the company requests a signed URL for file:
      | filename    | max-size.jpg |
      | contentType | image/jpeg   |
      | fileSize    | 5242880      |
      | uploadType  | CONTENT      |
    Then soft assert signed URL response status is 200

    # ----- TEST 6: FILE SIZE OVER BOUNDARY (5MB + 1 byte) -----
    When the company requests a signed URL for file:
      | filename    | over-max.jpg |
      | contentType | image/jpeg   |
      | fileSize    | 5242881      |
    Then soft assert response status is 400

    # ----- TEST 7: INVALID FILENAME PATTERN -----
    When the company requests a signed URL for file:
      | filename    | file with spaces.jpg |
      | contentType | image/jpeg           |
      | fileSize    | 500000               |
    Then soft assert response status is 400
    And soft assert upload error contains validation for filename

    # ----- TEST 8: WEBP FORMAT UPLOAD -----
    When the company requests a signed URL for file:
      | filename    | modern-image.webp |
      | contentType | image/webp        |
      | fileSize    | 200000            |
    Then soft assert signed URL response status is 200
    When the company uploads test webp image to signed URL
    Then soft assert upload succeeds

    # ----- FINAL -----
    And all soft assertions should pass


  @influencer @soft-assertions @signed-url-gated
  Scenario: Influencer file upload - profile photo with rate limit info (consolidated)
    Given the influencer actor is signed in for file uploads
    And signed-url uploads are available to this actor

    # ----- TEST 1: PROFILE PHOTO WITH RATE LIMIT INFO -----
    When the influencer requests a signed URL for file:
      | filename    | influencer-avatar.jpg |
      | contentType | image/jpeg            |
      | fileSize    | 300000                |
      | uploadType  | PROFILE_PHOTO         |
    Then soft assert signed URL response status is 200
    And soft assert response contains rateLimitInfo
    And soft assert rateLimitInfo.remainingHourly is present
    And soft assert rateLimitInfo.remainingDaily is present

    When the influencer uploads test image to signed URL
    And the influencer confirms the upload
    And the influencer sets their profilePicture to the uploaded public URL
    Then soft assert profile update succeeds

    # ----- TEST 2: GIF FORMAT -----
    When the influencer requests a signed URL for file:
      | filename    | animated.gif |
      | contentType | image/gif    |
      | fileSize    | 800000       |
    Then soft assert signed URL response status is 200

    # ----- FINAL -----
    And all soft assertions should pass
