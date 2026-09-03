# Source of truth: checkitout-backend/src/test/resources/features/notification/account-activation-e2e.feature
#
# Adaptations for the FE oracle:
# - BE Background "the application is running with real Redis" collapses into
#   the fixtures.ts BE-reachability guard.
# - The registry staging steps ("registry stubs are reset", KRS stub, the fresh
#   throwaway COMPANY user, emailVerified) reuse the registry-company-flow
#   oracle's steps verbatim — "the user has emailVerified set to true" becomes
#   the existing registry-scoped wording "the registry user has emailVerified
#   set to true" (same /test/registry/set-email-verified PG-side toggle).
# - "the user account status is set to ..." → /test/auth/set-account-status on
#   the fresh user's email (the BE glue flips the same column server-side).
# - "the user refreshes their session after activation" → dispose + re-open the
#   mock-session for the same email: activation bumped tokenVersion, and a fresh
#   session cookie is the FE-visible equivalent of the BE's token refresh.
# - The unread-count / notifications-contain-type assertions run through the
#   typed NotificationsApi against the generated NotificationType enum.
@notification-e2e @account-activation
Feature: Account Activation Notifications (NTF-003)
  Tests that account activation triggers ACCOUNT_ACTIVATED notifications.

  # ===========================================================================
  # SCENARIO: Company auto-activation via email verified + company data
  # Flow: Company authenticates → email verified → confirm NIP data → ACTIVE → notification
  # ===========================================================================
  @company
  Scenario: Company receives ACCOUNT_ACTIVATED notification after email verified and company data confirmed
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    # TestRegistryController sets ACTIVE when emailVerified=true — force back to IN_VALIDATION
    # so confirmCompanyData() triggers the auto-activation path with AccountActivatedEvent
    And the registry user account status is set to "IN_VALIDATION"

    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 200

    When the user confirms company data for NIP "5261040828"
    Then the response status should be 200
    And the confirm response activated should be true
    And the confirm response accountStatus should be "ACTIVE"

    # Refresh session after activation (tokenVersion was incremented)
    When the registry user refreshes their session after activation

    # Verify ACCOUNT_ACTIVATED notification was created
    When the registry user checks unread notification count
    Then the unread count should be at least 1
    When the registry user fetches notifications page 0 size 10
    Then the response status should be 200
    And the notifications response should contain type "ACCOUNT_ACTIVATED"
