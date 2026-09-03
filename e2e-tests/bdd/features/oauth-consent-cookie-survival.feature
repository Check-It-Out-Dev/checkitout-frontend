# Source of truth: checkitout-backend/src/test/resources/features/consent/oauth-consent-cookie-survival.feature
#
# Adaptations (BE Cucumber -> FE playwright-bdd oracle):
# - Background "the application is running with real Redis" dropped: the BDD
#   tier's global Before hook (steps/fixtures.ts) already skips every scenario
#   when the live BE (https://localhost:8080/api) is unreachable — same
#   precondition, enforced in one place.
# - "I simulate OAuth callback ..." keeps the BE's own stand-in: the BE glue
#   (ConsentSteps.java) does NOT hit the real Instagram callback either — it
#   POSTs /test/auth/register-without-firebase (userType INFLUENCER) with or
#   without the accumulated consent cookies, exercising the same
#   validateConsentCookiesPresent() path the OAuth callback runs. The FE port
#   drives the same endpoint through ConsentApi; "with consent cookies" rides
#   the accumulating anonymous TestSession jar (or the tampered jar, below),
#   "without" uses a fresh cookie-less context.
# - '"Admin" logs in as ADMIN with mock session' and '"Admin" queries consent
#   records for the newly registered user' collapsed to the FE corpus's
#   existing phrasings ("the admin is signed in with a mock session" / "the
#   admin queries consent records for the newly registered user",
#   consent.steps.ts) — same mock-session seeding, same admin endpoint.
# - Scenario 4's registration email from the data table is timestamped by the
#   step: the BE corpus runs on throwaway Testcontainers, while this oracle's
#   dev DB persists, so the BE's fixed email would collide with
#   email-already-used on the second run. The re-login step reuses whatever
#   email the registration actually sent.
# - "I tamper with the consent cookie ..." flips the last character of the
#   cookie VALUE (X <-> Y, exactly like the BE glue) via a storageState
#   round-trip into a fresh request context — Playwright's API cookie jar is
#   immutable in place. The matching _sig cookie stays untouched, so the HMAC
#   check is what rejects the callback.
@consent @oauth @cookie-survival @be-suite:RunConsentIT
Feature: OAuth Redirect Consent Cookie Survival
  As a platform operator
  I want consent cookies (SameSite=Lax) to survive OAuth redirect chains
  So that influencer registrations comply with GDPR even through third-party redirects

  # ===========================================================================
  # SCENARIO 1: Consent cookies present -> OAuth registration succeeds
  # Banner + ToS + PP cookies accumulate in one jar, ride into the simulated
  # OAuth callback, the BE creates the user + consent records, admin verifies.
  # ===========================================================================
  @consent @oauth @happy-path
  Scenario: OAuth influencer registration succeeds when consent cookies survive redirect
    # ===== PHASE 1: SET CONSENT COOKIES (simulates FE pre-OAuth) =====
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    Then the response status should be 200
    And the response should set cookie "consent_cookie_policy"
    And the response should set cookie "consent_cookie_policy_sig"

    When I prepare consent for document type "TERMS_OF_SERVICE" version 2
    Then the response status should be 200
    And the response should set cookie "consent_terms_of_service"
    And the response should set cookie "consent_terms_of_service_sig"

    When I prepare consent for document type "PRIVACY_POLICY" version 2
    Then the response status should be 200
    And the response should set cookie "consent_privacy_policy"
    And the response should set cookie "consent_privacy_policy_sig"

    # ===== PHASE 2: OAUTH CALLBACK WITH CONSENT COOKIES =====
    # SameSite=Lax allows cookies on top-level navigation redirects (GET);
    # here the accumulated jar rides into the callback stand-in endpoint.
    When I simulate OAuth callback for a new influencer with consent cookies
    Then the response status should be 200
    And the registration should be successful

    # ===== PHASE 3: ADMIN VERIFIES CONSENT RECORDS =====
    # Note: the test endpoint records REGISTRATION source; real OAuth uses
    # SOCIAL_REGISTRATION. The key assertion is that all 3 document types
    # have consent records linked to the new user.
    Given the admin is signed in with a mock session
    When the admin queries consent records for the newly registered user
    Then the consent records should contain 4 entries
    And one record should have source "COOKIE_BANNER" with the user linked
    And one record should have document type "COOKIE_POLICY"
    And one record should have document type "TERMS_OF_SERVICE"
    And one record should have document type "PRIVACY_POLICY"

  # ===========================================================================
  # SCENARIO 2: Missing consent cookies -> OAuth registration fails
  # Cookies expired / blocked / stripped -> the BE rejects the registration.
  # ===========================================================================
  @consent @oauth @missing-cookies
  Scenario: OAuth callback fails when consent cookies are missing
    # No consent cookies set — go straight to OAuth callback
    When I simulate OAuth callback for a new influencer without consent cookies
    Then the response should indicate consent required error
    And no user should be created from the OAuth callback

  # ===========================================================================
  # SCENARIO 3: Partial consent cookies -> OAuth registration fails
  # Only cookie banner accepted, but ToS/PP not checked. BE requires all 3.
  # ===========================================================================
  @consent @oauth @partial-cookies
  Scenario: OAuth callback fails when only cookie banner consent is present
    # Only accept cookie banner — skip ToS and Privacy Policy
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    Then the response status should be 200

    When I simulate OAuth callback for a new influencer with consent cookies
    Then the response should indicate consent required error

  # ===========================================================================
  # SCENARIO 4: Existing user OAuth login does NOT require consent cookies
  # Consent was already given at registration; handleExistingUser() does not
  # call validateConsentCookiesPresent(), so re-auth bypasses the check.
  # ===========================================================================
  @consent @oauth @existing-user
  Scenario: Existing influencer re-login succeeds without consent cookies
    # First create a fully consented user via normal registration
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    And I prepare consent for document type "TERMS_OF_SERVICE" version 2
    And I prepare consent for document type "PRIVACY_POLICY" version 2
    And I register with consent cookies
      | email    | oauth-existing-user-test@e2e.test |
      | password | TestPassword123!                  |
      | userType | INFLUENCER                        |
    Then the response status should be 200

    # Simulate re-login: create a mock session WITHOUT consent cookies.
    When the registered user creates a mock session without consent cookies
    Then the response status should be 200
    And the user should be able to access "/users/me"

  # ===========================================================================
  # SCENARIO 5: Cookie attributes verification (SameSite=Lax, HttpOnly)
  # The attributes that make redirect survival possible in a real browser.
  # ===========================================================================
  @consent @oauth @cookie-attributes
  Scenario: Consent cookies have correct SameSite=Lax attribute for redirect survival
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    Then the response status should be 200
    And the cookie "consent_cookie_policy" should have SameSite "Lax"
    And the cookie "consent_cookie_policy" should be HttpOnly
    And the cookie "consent_cookie_policy_sig" should have SameSite "Lax"
    And the cookie "consent_cookie_policy_sig" should be HttpOnly

    When I prepare consent for document type "TERMS_OF_SERVICE" version 2
    Then the response status should be 200
    And the cookie "consent_terms_of_service" should have SameSite "Lax"
    And the cookie "consent_terms_of_service" should be HttpOnly

    When I prepare consent for document type "PRIVACY_POLICY" version 2
    Then the response status should be 200
    And the cookie "consent_privacy_policy" should have SameSite "Lax"
    And the cookie "consent_privacy_policy" should be HttpOnly

  # ===========================================================================
  # SCENARIO 6: HMAC signature validation on consent cookies
  # Tampered cookies must be rejected — HMAC prevents forgery.
  # ===========================================================================
  @consent @oauth @hmac-tamper
  Scenario: OAuth callback rejects tampered consent cookies
    When I accept the cookie banner for document "cookie_policy_v2_pl.pdf"
    And I prepare consent for document type "TERMS_OF_SERVICE" version 2
    And I prepare consent for document type "PRIVACY_POLICY" version 2
    And I tamper with the consent cookie "consent_terms_of_service"
    When I simulate OAuth callback for a new influencer with consent cookies
    Then the response should indicate consent required error
