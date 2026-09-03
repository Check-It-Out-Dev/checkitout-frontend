# Source of truth: checkitout-backend/src/test/resources/features/logout.feature
#
# The BE source drives three real-Firebase / OAuth / KMS-2FA login variants
# before logging out. This FE oracle collapses them to mock-session seeding:
# the BE issues the SAME HttpOnly session cookie either way, so the logout
# post-condition (session cleared, /users/me 401) is identical. The
# real-Firebase / admin-2FA / influencer-OAuth login variants become gated
# follow-up scenarios (hasRealCredentialsFor / firebase-admin-bridge) — see
# the S6 port plan.
@authentication @logout
Feature: User Logout
  As a user of CheckItOut platform
  I want to log out from my account
  So that my session is terminated and I cannot access protected resources

  @company
  Scenario: Company user logs out and the session is cleared
    Given a company user is signed in
    And the user can access "/users/me"
    When I sign out from the application
    Then the user cannot access "/users/me"

  @influencer
  Scenario: Influencer logs out and the session is cleared
    Given a influencer user is signed in
    And the user can access "/users/me"
    When I sign out from the application
    Then the user cannot access "/users/me"

  @admin
  Scenario: Admin logs out and the session is cleared
    Given a admin user is signed in
    And the user can access "/users/me"
    When I sign out from the application
    Then the user cannot access "/users/me"
