# Source of truth: checkitout-backend/src/test/resources/features/admin/admin-inactive-flow-consolidated.feature
#
# Adaptations (every divergence from the BE source):
# - LOGIN COLLAPSE: the BE's real Firebase password login (company1), Instagram
#   OAuth login (influencer1) and password + KMS-2FA login (admin1) all collapse
#   to mock-session TestSessions. The BE alias names are KEPT ("company1",
#   "influencer1", "admin1") but the two mutated targets are DISPOSABLE
#   unique-email users — NOT the shared company1/influencer1 fixture actors —
#   because this scenario bumps their tokenVersion repeatedly and would break
#   the order-independence of every other oracle. The OAuth collapse is sound
#   here because the flow only exercises status + tokenVersion semantics, which
#   are identical for any authenticated session; the OAuth-specific contract is
#   owned by login.feature / influencer-verification-password.feature. No
#   uid-keyed /test hooks remain, so no ActorProfile.firebaseUid pinning.
# - STORED TOKENS: '"X" stores their current token as "T"' snapshots the
#   actor's HttpOnly cookie jar (session + session_sig) via storageState();
#   probes replay the frozen jar from a throwaway request context — the FE
#   analogue of the BE glue's raw-cookie storedTokens map.
# - 401 vs 419: the BE source distinguishes 401 (INACTIVE account cannot
#   authenticate at all) from 419 (stale tokenVersion on an otherwise-valid
#   account) for REAL JWT-minted sessions. Under the mock-session collapse the
#   two signals collapse into one stale/blocked-session class; the integration
#   tier documented the 401<->419 mapping drift live
#   (e2e-tests/integration/flows/admin-inactive-flow.spec.ts). The feature text
#   keeps the BE's exact code for line-by-line diffability against the source;
#   the stored-token step asserts the {401,419} class and its failure message
#   carries the BE-expected code.
# - REFRESH FAILURE: 'soft assert "X" refresh fails with
#   "error.auth.account_disabled"' asserts the status class {401,403,419} —
#   exactly what the BE glue asserts (ProfileUpdateSteps.softAssertActorRefreshFails
#   never checks the key) — PLUS the messageKey WHEN the response body carries
#   one (the live BE loses it at the Spring Security auth-failure boundary).
#   messageKey only, never localized message text (this DB answers Polish).
# - REFRESH SUCCESS: POST /auth/refresh-session succeeds only for sessions
#   minted from a real Firebase idToken; mock-session UIDs hit Firebase
#   USER_NOT_FOUND inside createRefreshedSession. '"X" refreshes their session
#   token' therefore re-establishes the session via a fresh mock-session seed
#   (same email) — the same post-condition as a successful refresh: a NEW valid
#   cookie pair at the current tokenVersion while every stored old token stays
#   dead. The REAL refresh-success contract is the @be-internal-gated scenario
#   at the bottom.
# - BACKGROUND: the BE Background is a comment-only Firebase-budget note; the
#   FE tier's BE-reachability Before hook (steps/fixtures.ts) plays the guard
#   role. Zero /auth/firebase/* calls are made here (auth-limiter budget).
@admin-inactive-flow @multi-actor @consolidated @consolidated-suite
Feature: Admin INACTIVE/ACTIVE Status Flow (Consolidated)
  As an admin
  I want to set users to INACTIVE or BANNED status
  So that I can control user access and enforce policies

  This feature tests the complete status lifecycle:
  - Admin sets user to INACTIVE -> user's token invalidated
  - INACTIVE user cannot refresh session (account_disabled error)
  - Admin reactivates user -> user can refresh and access API
  - Ban/Unban cycles with token version tracking

  @soft-assertions
  Scenario: Admin INACTIVE/ACTIVE status flow - Company and Influencer (consolidated - 20+ assertions)
    # ----- SETUP: ALL ACTORS LOGIN ONCE (BE: real-credential logins; FE: mock-session) -----
    Given "company1" is provisioned as a disposable COMPANY target
    And "company1" stores their current token as "company_active_token"
    And "influencer1" is provisioned as a disposable INFLUENCER target
    And "influencer1" stores their current token as "influencer_active_token"
    And "admin1" is signed in as the administrator

    # =========== COMPANY INACTIVE FLOW ===========

    # ----- PHASE 1: ADMIN SETS COMPANY TO INACTIVE -----
    When "admin1" sets user "company1" status to "INACTIVE"
    # BE expects exactly 401 (INACTIVE users cannot authenticate at all);
    # mock-session collapse accepts the {401,419} stale/blocked class — see header.
    Then soft assert "company1" using stored token "company_active_token" calling "/users/me" returns 401

    # ----- PHASE 2: COMPANY CANNOT REFRESH (INACTIVE = CANNOT AUTHENTICATE) -----
    When "company1" attempts to refresh their session token
    Then soft assert "company1" refresh fails with "error.auth.account_disabled"

    # ----- PHASE 3: ADMIN REACTIVATES COMPANY -----
    When "admin1" sets user "company1" status to "ACTIVE"
    # Now refresh should work (FE collapse: fresh mock-session re-seed — see header)
    When "company1" refreshes their session token
    Then soft assert refresh succeeds
    And soft assert "company1" can access "/users/me" with status 200
    And soft assert "company1" accountStatus is "ACTIVE"

    # Store new token for next phase
    And "company1" stores their current token as "company_reactivated_token"

    # ----- PHASE 4: VERIFY ORIGINAL TOKEN STILL BLOCKED -----
    # BE expects exactly 419 (token-version mismatch on a now-ACTIVE account).
    Then soft assert "company1" using stored token "company_active_token" calling "/users/me" returns 419

    # =========== INFLUENCER INACTIVE FLOW ===========

    # ----- PHASE 5: ADMIN SETS INFLUENCER TO INACTIVE -----
    When "admin1" sets user "influencer1" status to "INACTIVE"
    # INACTIVE users cannot authenticate at all - should get 401
    Then soft assert "influencer1" using stored token "influencer_active_token" calling "/users/me" returns 401

    # ----- PHASE 6: INFLUENCER CANNOT REFRESH -----
    When "influencer1" attempts to refresh their session token
    Then soft assert "influencer1" refresh fails with "error.auth.account_disabled"

    # ----- PHASE 7: ADMIN REACTIVATES INFLUENCER -----
    When "admin1" sets user "influencer1" status to "ACTIVE"
    When "influencer1" refreshes their session token
    Then soft assert refresh succeeds
    And soft assert "influencer1" can access "/users/me" with status 200
    And soft assert "influencer1" accountStatus is "ACTIVE"

    # =========== MULTIPLE STATUS CYCLES ===========

    # ----- PHASE 8: COMPANY BAN/UNBAN CYCLE WITH TOKEN TRACKING -----
    And "company1" stores their current token as "before_ban_token"
    When "admin1" bans user "company1" with reason "E2E test ban cycle"
    Then soft assert "company1" using "before_ban_token" returns 419
    # BE: banned users CAN authenticate (limited surface) — the re-seeded session
    # reads /users/me and sees BANNED, mirroring the BE's refresh-while-banned.
    When "company1" refreshes their session token
    And "company1" stores their current token as "banned_token"
    Then soft assert "company1" accountStatus is "BANNED"

    When "admin1" unbans user "company1"
    Then soft assert "company1" using "banned_token" returns 419
    When "company1" refreshes their session token
    Then soft assert "company1" accountStatus is "ACTIVE"
    And soft assert "company1" can access "/partnership-opportunity/paged" with status 200

    # ----- PHASE 9: VERIFY ALL OLD TOKENS BLOCKED AFTER MULTIPLE CYCLES -----
    Then soft assert "company1" using "company_active_token" returns 419
    Then soft assert "company1" using "company_reactivated_token" returns 419
    Then soft assert "company1" using "before_ban_token" returns 419
    Then soft assert "company1" using "banned_token" returns 419

    # ----- FINAL -----
    And all soft assertions should pass

  # @be-internal-gated: the SUCCESS half of POST /auth/refresh-session requires a
  # session minted from a REAL Firebase idToken — TokenExchangeService.
  # createRefreshedSession performs Firebase Admin lookups that fail with
  # USER_NOT_FOUND for mock-session UIDs (confirmed live; investigation in
  # e2e-tests/integration/flows/admin-inactive-flow.spec.ts). The main scenario
  # above re-proves the post-condition through the mock-session collapse; this
  # gated scenario pins the real-path contract itself. Unlock: real-credentials
  # sign-in (login.steps.ts 'real {word} credentials are available' gate +
  # ActorProfile.firebaseUid pinning) or a firebase-admin-bridge minted idToken.
  @soft-assertions @be-internal-gated @real-firebase
  Scenario: Reactivated user succeeds through the REAL /auth/refresh-session path
    Given the real-Firebase session refresh path is exercisable on this stack
    And "companyReal" is provisioned as a disposable COMPANY target
    And "adminReal" is signed in as the administrator
    When "adminReal" sets user "companyReal" status to "INACTIVE"
    And "adminReal" sets user "companyReal" status to "ACTIVE"
    And "companyReal" attempts to refresh their session token
    Then soft assert refresh succeeds
    And all soft assertions should pass
