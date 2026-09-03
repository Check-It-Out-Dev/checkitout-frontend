# Source of truth: checkitout-backend/src/test/resources/features/consent/consent-lifecycle.feature
#
# Full consent lifecycle vs the LIVE BE: grace period, enforcement cron,
# soft-block restrictions, re-consent, and the end-to-end publish→block→
# re-consent→unblock arc. Every scenario is exercisable from the FE test
# runner — the BE's own Cucumber glue drives these flows over HTTP through
# the `/test/legal` hooks of TestLegalController (set-published-at,
# publish-document-version, trigger-enforcement, reset-consents,
# user-consent-status), which the live e2e-profile BE exposes exactly like
# the `/test/auth/mock-session` hook the whole oracle tier already rides —
# so no scenario is @be-internal-gated.
#
# Adaptations vs the BE source:
# - Background "the application is running with real Redis" dropped: the
#   shared fixtures Before pings /api/public-config and self-skips when the
#   live stack (BE + Redis) is down; Redis reality is a stack property here,
#   not a step.
# - Endpoint texts drop the "/api" prefix (the typed ApiHttp transport owns
#   the base path) — same convention as consent-module.feature / logout.feature.
# - "a registered <ROLE> user ... with all consents accepted" seeds
#   idempotently: ensure-user + mock-session + POST /legal/consent/record-batch
#   (the REAL re-consent surface) instead of register-without-firebase. The BE
#   corpus runs on throwaway Testcontainers; our dev DB persists, so the fixed
#   @lifecycle.test emails would 400 (email already used) on every re-run of
#   the one-shot registration endpoint. End state is identical: user exists,
#   ACTIVE, newestConsentsAccepted=true. The consent-cookie registration path
#   itself is already covered by consent-module.feature.
# - "a session exists for X as ROLE" mirrors the BE glue
#   (ConsentLifecycleSteps.sessionExistsForUser): mock-session, then re-stage
#   BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS when the user's consents are not
#   accepted (mock-session JWTs claim ACTIVE; the ConsentEnforcementFilter
#   reads DB/cache). The BE glue's extra /auth/refresh-session hop is dropped:
#   mock-session now embeds the user's CURRENT tokenVersion
#   (TestAuthController), so a fresh session never carries a stale version.
# - "refreshes their mock session" = a fresh mock-session, exactly like the BE
#   glue's refreshMockSession (which POSTs /test/auth/mock-session again).
# - Cleanup mirrors the BE @After("@consent-lifecycle") + RunConsentIT
#   hygiene: after EVERY scenario the steps delete documents above v2, reset
#   published_at to now, and restore enforcement-blocked users to ACTIVE —
#   enforcement is GLOBAL on the persistent dev DB and a leaked 40-days-ago
#   published_at (or v3 document) would poison the consent-module oracle and
#   every later suite's mock-sessions.
@consent-lifecycle @be-suite:RunConsentIT
Feature: Consent Lifecycle E2E Tests
  As a platform operator
  I want to verify the full consent lifecycle: grace period, enforcement, blocking, and re-consent
  So that the platform correctly enforces legal compliance

  # =========================================================================
  # A: CRON JOB SIMULATION
  # =========================================================================

  @enforcement-cron
  Scenario: Users blocked after grace period expires
    Given a COMPANY user "cron-block-1@lifecycle.test" with consents not accepted
    And a COMPANY user "cron-block-2@lifecycle.test" with consents not accepted
    When all document published_at dates are set to "40" days ago
    And consent enforcement is triggered
    Then user "cron-block-1@lifecycle.test" should have account status "BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS"
    And user "cron-block-2@lifecycle.test" should have account status "BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS"

  @enforcement-cron
  Scenario: Users NOT blocked during grace period
    Given a COMPANY user "cron-safe-1@lifecycle.test" with consents not accepted
    And a COMPANY user "cron-safe-2@lifecycle.test" with consents not accepted
    When all document published_at dates are set to "10" days ago
    And consent enforcement is triggered
    Then user "cron-safe-1@lifecycle.test" should have account status "ACTIVE"
    And user "cron-safe-2@lifecycle.test" should have account status "ACTIVE"

  @enforcement-cron
  Scenario: Only ACTIVE and IN_VALIDATION users get blocked
    Given a COMPANY user "cron-active@lifecycle.test" with consents not accepted
    And a COMPANY user "cron-banned@lifecycle.test" with status "BANNED"
    And a COMPANY user "cron-already-blocked@lifecycle.test" with status "BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS"
    When all document published_at dates are set to "40" days ago
    And consent enforcement is triggered
    Then user "cron-active@lifecycle.test" should have account status "BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS"
    And user "cron-banned@lifecycle.test" should have account status "BANNED"
    And user "cron-already-blocked@lifecycle.test" should have account status "BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS"

  # =========================================================================
  # B: GRACE PERIOD & DAYS REMAINING
  # =========================================================================

  @grace-period
  Scenario: Days remaining computed correctly within grace period
    Given a registered COMPANY user "grace-period-check@lifecycle.test" with all consents accepted
    When all document published_at dates are set to "10" days ago
    And user "grace-period-check@lifecycle.test" consents are reset
    And a session exists for "grace-period-check@lifecycle.test" as COMPANY
    Then GET "/legal/consent/my" should return newestConsentsAccepted false
    And GET "/legal/consent/my" should return daysToAcceptNewTerms approximately 28

  @grace-period
  Scenario: Days remaining is 0 when grace period expired
    Given a registered COMPANY user "grace-expired-check@lifecycle.test" with all consents accepted
    When all document published_at dates are set to "40" days ago
    And user "grace-expired-check@lifecycle.test" consents are reset
    And a session exists for "grace-expired-check@lifecycle.test" as COMPANY
    Then GET "/legal/consent/my" should return newestConsentsAccepted false
    And GET "/legal/consent/my" should return daysToAcceptNewTerms approximately 0

  # =========================================================================
  # C: BLOCKED USER RESTRICTIONS
  # =========================================================================

  @blocked-restrictions
  Scenario: Blocked COMPANY user cannot create campaign
    Given a COMPANY user "blocked-company-campaign@lifecycle.test" with consents not accepted
    And a session exists for "blocked-company-campaign@lifecycle.test" as COMPANY
    When the user sends POST to "/partnership-opportunity" with empty body
    Then the response status should be 403
    And the response should have header "X-Consent-Required"

  @blocked-restrictions
  Scenario: Blocked INFLUENCER cannot apply to partnership
    Given an INFLUENCER user "blocked-influencer-apply@lifecycle.test" with consents not accepted
    And a session exists for "blocked-influencer-apply@lifecycle.test" as INFLUENCER
    When the user sends POST to "/applied-opportunity" with empty body
    Then the response status should be 403
    And the response should have header "X-Consent-Required"

  @blocked-restrictions
  Scenario Outline: Blocked user CAN access standard endpoints (soft block)
    Given a COMPANY user "blocked-whitelist@lifecycle.test" with consents not accepted
    And a session exists for "blocked-whitelist@lifecycle.test" as COMPANY
    When the user requests "<endpoint>"
    Then the response status should be 200

    Examples:
      | endpoint          |
      | /users/me         |
      | /legal/current    |
      | /legal/consent/my |

  @blocked-restrictions
  Scenario: Blocked user CAN browse campaigns (soft block allows read-only)
    Given a COMPANY user "blocked-browse@lifecycle.test" with consents not accepted
    And a session exists for "blocked-browse@lifecycle.test" as COMPANY
    When the user requests "/partnership-opportunity/paged"
    Then the response status should be 200

  # =========================================================================
  # D: RE-CONSENT RESTORES ACCESS
  # =========================================================================

  @reconsent-restore
  Scenario: Blocked COMPANY re-consents and regains access
    Given a COMPANY user "reconsent-company@lifecycle.test" with consents not accepted
    And a session exists for "reconsent-company@lifecycle.test" as COMPANY
    When the user sends POST to "/partnership-opportunity" with empty body
    Then the response status should be 403
    And the response should have header "X-Consent-Required"
    When the user records consent for all required documents
    And the user "reconsent-company@lifecycle.test" refreshes their mock session as COMPANY
    And the user requests "/users/me"
    Then the response status should be 200
    And the response body field "accountStatus" should be "ACTIVE"

  @reconsent-restore
  Scenario: Blocked INFLUENCER re-consents and regains access
    Given an INFLUENCER user "reconsent-influencer@lifecycle.test" with consents not accepted
    And a session exists for "reconsent-influencer@lifecycle.test" as INFLUENCER
    When the user sends POST to "/applied-opportunity" with empty body
    Then the response status should be 403
    And the response should have header "X-Consent-Required"
    When the user records consent for all required documents
    And the user "reconsent-influencer@lifecycle.test" refreshes their mock session as INFLUENCER
    And the user requests "/users/me"
    Then the response status should be 200
    And the response body field "accountStatus" should be "ACTIVE"

  # =========================================================================
  # E: FULL LIFECYCLE
  # =========================================================================

  @full-lifecycle
  Scenario: Complete lifecycle - publish, block, re-consent, unblock
    # Step 1: A user whose consents are currently all accepted
    Given a registered COMPANY user "lifecycle-full@lifecycle.test" with all consents accepted

    # Step 2: Simulate new terms published 40 days ago
    When a new version 3 of "TERMS_OF_SERVICE" is published with published_at "40" days ago
    And a new version 3 of "PRIVACY_POLICY" is published with published_at "40" days ago
    And all document published_at dates are set to "40" days ago

    # Step 3: Reset consents and trigger enforcement
    And user "lifecycle-full@lifecycle.test" consents are reset
    And consent enforcement is triggered
    Then user "lifecycle-full@lifecycle.test" should have account status "BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS"

    # Step 4: Verify blocked user gets 403
    Given a session exists for "lifecycle-full@lifecycle.test" as COMPANY
    When the user sends POST to "/partnership-opportunity" with empty body
    Then the response status should be 403
    And the response should have header "X-Consent-Required"

    # Step 5: Re-consent and verify unblocked
    When the user records consent for all required documents
    And the user "lifecycle-full@lifecycle.test" refreshes their mock session as COMPANY
    And the user requests "/users/me"
    Then the response status should be 200
    And the response body field "accountStatus" should be "ACTIVE"
