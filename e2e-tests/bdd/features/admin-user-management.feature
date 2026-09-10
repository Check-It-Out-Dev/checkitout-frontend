# Source of truth: checkitout-backend/src/test/resources/features/admin-user-management.feature
#
# Adaptations (every divergence from the BE source):
# - LOGIN COLLAPSE: the BE's 'Given "Admin" logs in as ADMIN with Firebase UID
#   "85VJgS6..." email "..." password "..." and completes 2FA' collapses to a
#   mock-session TestSession (partial:false mints the FULL session, bypassing
#   the KMS-TOTP upgrade). The real password + 2FA path is owned by
#   login.feature / admin-2fa-kms.feature. The BE's session-claim assertions
#   translate to their FE-visible consequences: '"Admin" should be
#   authenticated' -> GET /users/me is 200 with userType ADMIN; '"Admin"
#   should have 2FA verified' -> an ADMIN-only endpoint (GET /users/paged)
#   answers 200 — a partial (2FA-pending) session is rejected there, so the
#   200 is exactly what a verified-2FA session buys on the FE surface.
# - TARGETS: the BE operates on the two REAL prod-account Firebase UIDs
#   ("E2E_COMPANY_001" company / "E2E_INFLUENCER_001"
#   influencer) "synced from Firestore" via the uid-keyed
#   /test/auth/sync-user-from-firestore hook. The FE oracle provisions
#   DISPOSABLE mock-session users (unique @e2e.test emails) under the aliases
#   "companyTarget" / "influencerTarget" instead: banning or deactivating the
#   SHARED fixture actors would bump their tokenVersion and break the
#   order-independence of every other oracle in the suite. After this
#   collapse no uid-keyed /test hooks remain, so no ActorProfile.firebaseUid
#   pinning is needed. Same pattern proven live by
#   e2e-tests/integration/flows/admin-user-management.spec.ts.
# - 'synced and has status X and role Y' (BE: /test/auth/force-firebase-claims
#   + Firestore sync + admin PATCH) -> idempotent provision + an admin PATCH
#   pinning accountStatus. The role is fixed at mock-session provisioning; the
#   step contract-guards that the requested role matches the provisioned one.
# - BACKGROUND: 'the application is running with real Redis' is a BE-internal
#   Spring-context probe; its FE analogue is the BE-reachability Before hook
#   in steps/fixtures.ts (skips the whole tier when the stack is down).
# - BAN REASON is client-side context only — logged, never stored — exactly
#   like the BE glue (AdminUserManagementSteps.adminBansUser).
# - Status names are contract-guarded against the generated AccountStatus
#   enum; only status codes and enum values are asserted, never localized
#   message text (the BE dictionary answers Polish on this DB).
# - The BANNED / IN_VALIDATION transitions require the BE soft-skip flag for
#   Firebase claim updates on mock users (BE commits afb31f1c + 7cec6433,
#   app.firebase.claim-updates.soft-skip-missing-user=true in the dev profile).
@admin-ops @user-management
Feature: Admin User Management (CONSOLIDATED)
  As an admin with verified 2FA
  I want to manage platform users (ban/unban, view, change status)
  So that I can maintain platform health and safety

  # ===========================================================================
  # SUPER CONSOLIDATED SCENARIO: ALL ADMIN OPERATIONS
  # BE consolidation rationale (1 login for 12 ops) maps to 1 admin TestSession.
  # ===========================================================================

  @ban-user @unban-user @status-change @view-users @consolidated
  Scenario: Admin performs all user management operations (super consolidated)
    # Single admin session for ALL operations (BE: single Firebase + 2FA login)
    Given "Admin" is signed in as the administrator
    Then the administrator session is authenticated
    And the administrator session has admin-only access

    # ========== SECTION 1: USER LISTING AND VIEWING ==========

    # ----- VIEW PAGINATED USER LIST -----
    When the admin views the user list
    Then the response status should be 200
    And the response should contain a list of users
    And the response should contain pagination info

    # ----- VIEW COMPANY USER PROFILE -----
    # BE: the target user "E2E_COMPANY_001" is synced from Firestore
    Given the target user "companyTarget" is provisioned as a disposable COMPANY user
    When the admin views user "companyTarget" profile
    Then the response status should be 200
    And the response should contain the user's email
    And the response should contain the user's account status

    # ----- VIEW INFLUENCER USER PROFILE -----
    # BE: the target user "E2E_INFLUENCER_001" is synced from Firestore
    Given the target user "influencerTarget" is provisioned as a disposable INFLUENCER user
    When the admin views user "influencerTarget" profile
    Then the response status should be 200
    And the response should contain the user's email
    And the response should contain the user's account status

    # ========== SECTION 2: COMPANY USER MANAGEMENT ==========

    # ----- BAN COMPANY USER -----
    Given the target user "companyTarget" is provisioned and has status "ACTIVE" and role "COMPANY"
    When the admin bans user "companyTarget" with reason "Terms of service violation"
    Then the response status should be 200
    And the user "companyTarget" should have status "BANNED"

    # ----- UNBAN COMPANY USER -----
    When the admin unbans user "companyTarget"
    Then the response status should be 200
    And the user "companyTarget" should have status "ACTIVE"

    # ----- DEACTIVATE COMPANY USER -----
    When the admin sets user "companyTarget" status to "INACTIVE"
    Then the response status should be 200
    And the user "companyTarget" should have status "INACTIVE"

    # ----- REACTIVATE COMPANY USER -----
    When the admin sets user "companyTarget" status to "ACTIVE"
    Then the response status should be 200
    And the user "companyTarget" should have status "ACTIVE"

    # ----- SET IN_VALIDATION STATUS -----
    When the admin sets user "companyTarget" status to "IN_VALIDATION"
    Then the response status should be 200
    And the user "companyTarget" should have status "IN_VALIDATION"

    # ----- RESTORE COMPANY TO ACTIVE -----
    When the admin sets user "companyTarget" status to "ACTIVE"
    Then the response status should be 200
    And the user "companyTarget" should have status "ACTIVE"

    # ========== SECTION 3: INFLUENCER USER MANAGEMENT ==========

    # ----- BAN INFLUENCER USER -----
    Given the target user "influencerTarget" is provisioned and has status "ACTIVE" and role "INFLUENCER"
    When the admin bans user "influencerTarget" with reason "Spam activity detected"
    Then the response status should be 200
    And the user "influencerTarget" should have status "BANNED"

    # ----- UNBAN INFLUENCER USER -----
    When the admin unbans user "influencerTarget"
    Then the response status should be 200
    And the user "influencerTarget" should have status "ACTIVE"

    # ========== FINAL CLEANUP ==========
    # BE keeps this to restore the shared prod-account targets; kept here for
    # scenario parity even though the FE targets are disposable rows.
    When the admin sets user "companyTarget" status to "ACTIVE"
    Then the response status should be 200
    When the admin sets user "influencerTarget" status to "ACTIVE"
    Then the response status should be 200
