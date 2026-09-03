# Source of truth: checkitout-backend/src/test/resources/features/consent/consent-module.feature
#
# GDPR consent oracle vs the LIVE BE: public legal documents, anonymous
# cookie-banner records (HMAC cookie pair), pre-registration consent
# preparation, registration blocked without consents (and the
# missing-consents-before-email-duplicate ordering), the full consented
# registration with admin-side record verification, anonymous-record linking,
# the soft-block enforcement filter (X-Consent-Required on writes, reads
# allowed), the re-consent batch that unblocks, and the consent-status
# endpoint. One TestSession context carries the accumulating consent cookies
# through banner -> prepare -> register exactly like a browser. Registration
# emails are timestamped (the BE corpus runs on throwaway Testcontainers; the
# dev DB persists, so fixed emails would collide on re-runs).
@consent @be-suite:RunConsentModuleIT
Feature: Consent Module
  As a platform operator
  I want to enforce legal consent during registration and re-consent after terms update
  So that the platform is GDPR-compliant

  @consent @public-api
  Scenario: Get current legal documents
    When I request the current legal documents
    Then the response status should be 200
    And the response should contain legal documents with types
      | COOKIE_POLICY    |
      | TERMS_OF_SERVICE |
      | PRIVACY_POLICY   |

  @consent @cookie-banner
  Scenario: Record anonymous cookie banner consent
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    Then the response status should be 200
    And the response should contain a consent record ID
    And the response should set cookie "consent_cookie_policy"
    And the response should set cookie "consent_cookie_policy_sig"

  @consent @consent-prepare
  Scenario: Prepare consent cookies for Terms of Service
    When I prepare consent for document type "TERMS_OF_SERVICE" version 2
    Then the response status should be 200
    And the response should set cookie "consent_terms_of_service"
    And the response should set cookie "consent_terms_of_service_sig"

  @consent @consent-prepare
  Scenario: Prepare consent cookies for Privacy Policy
    When I prepare consent for document type "PRIVACY_POLICY" version 2
    Then the response status should be 200
    And the response should set cookie "consent_privacy_policy"
    And the response should set cookie "consent_privacy_policy_sig"

  @consent @registration-validation
  Scenario: Registration fails with 400 when consent cookies are missing
    When I attempt to register without consent cookies as a new COMPANY user
    Then the response status should be 400

  @consent @registration-validation
  Scenario: Missing consents error precedes email-already-used error
    Given a user already exists with email "consent-test-existing@e2e.test"
    When I attempt to register without consent cookies using email "consent-test-existing@e2e.test"
    Then the response status should be 400

  @consent @registration-happy-path
  Scenario: Full registration with all consent cookies succeeds
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    Then the response status should be 200
    And I store the anonymous consent record ID

    When I prepare consent for document type "TERMS_OF_SERVICE" version 2
    Then the response status should be 200
    When I prepare consent for document type "PRIVACY_POLICY" version 2
    Then the response status should be 200

    When I register a new COMPANY user with the accumulated consent cookies
    Then the response status should be 200
    And the registration should be successful

    Given the admin is signed in with a mock session
    When the admin queries consent records for the newly registered user
    Then the consent records should contain 4 entries
    And one record should have source "COOKIE_BANNER" with the user linked
    And one record should have document type "COOKIE_POLICY"
    And one record should have document type "TERMS_OF_SERVICE"
    And one record should have document type "PRIVACY_POLICY"

  @consent @anonymous-linking
  Scenario: Anonymous cookie consent record gets linked to user after registration
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    And I store the anonymous consent record ID

    Given the admin is signed in with a mock session
    When the admin checks orphaned anonymous consent records
    Then the orphaned records should contain the stored anonymous record ID

    When I prepare consent for document type "TERMS_OF_SERVICE" version 2
    And I prepare consent for document type "PRIVACY_POLICY" version 2
    And I register a new COMPANY user with the accumulated consent cookies
    Then the response status should be 200

    When the admin queries consent records for the newly registered user
    Then one record should have source "COOKIE_BANNER" with the user linked
    And the linked record ID should match the stored anonymous record ID

  @consent @enforcement
  Scenario: Blocked user gets 403 when creating new commitment (POST)
    Given a consent-blocked user with a valid session
    When the blocked user sends POST to "/partnership-opportunity" with an empty body
    Then the response status should be 403
    And the response should have header "x-consent-required"

  @consent @enforcement
  Scenario: Blocked user CAN browse (soft block allows read-only)
    Given a consent-blocked user with a valid session
    When the blocked user requests "/legal/current"
    Then the response status should be 200

  @consent @enforcement
  Scenario: Blocked user can access users me endpoint
    Given a consent-blocked user with a valid session
    When the blocked user requests "/users/me"
    Then the response status should be 200

  @consent @reconsent
  Scenario: Blocked user accepts updated terms and gets unblocked
    Given a consent-blocked user with a valid session
    When the blocked user records consent for all required documents
    And the blocked user refreshes their mock session
    Then the blocked user can access "/users/me"

  @consent @consent-status
  Scenario: User with all consents accepted sees accepted status
    Given a registered user with all consents accepted
    When the user checks their consent status
    Then the response status should be 200
    And the consent status should show newestConsentsAccepted is true

  @consent @admin-consent
  Scenario: Admin can view consent records for a user
    Given the admin is signed in with a mock session
    And a registered user with all consents accepted
    When the admin queries consent records for the newly registered user
    Then the response status should be 200
    And the consent records should contain at least 1 entry
