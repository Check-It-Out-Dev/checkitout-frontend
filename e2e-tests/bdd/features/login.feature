# Source of truth: checkitout-backend/src/test/resources/features/login.feature
#
# The BE Cucumber suite proves the full REAL auth chain (real Firebase + KMS):
# company password login, admin TOTP 2FA with the secret KMS-decrypted from
# Firestore, and influencer Instagram-OAuth with a KMS-decrypted token. This FE
# oracle ports all three against the LIVE BE, driven through the greenfield UI
# where a UI exists:
#   - company + admin scenarios drive the real /auth/sign-in form (the
#     production code path: SignInComponent.submit -> signIn ->
#     exchangeTokenForSession -> optional 2FA dialog -> session.probe ->
#     router.navigate). No Identity Toolkit key exists FE-side — the BE proxies
#     it — so the form IS the only real-login path, gated on
#     FIREBASE_TEST_{ROLE}_{EMAIL,PASSWORD} in e2e-tests/.env.
#   - the admin scenario decrypts the REAL TOTP secret from Firestore through
#     the GCP KMS bridge (mirrors the BE step "I decrypt the admin TOTP secret
#     from Firestore via KMS"), falling back to E2E_ADMIN_TOTP_SECRET.
#   - the influencer scenario uses the BE's OAuth simulation hook, which reads
#     the influencer's real Instagram token from Firestore and KMS-decrypts it
#     server-side (tokenValid:true), then issues the same session cookies as a
#     production OAuth callback.
# The BE's admin user-state sync preamble is covered by the FE test hooks
# (set-account-status) used across the oracle tier.
@authentication @login @multi-actor @be-suite:RunAuthenticationIT
Feature: User Login
  As a user of CheckItOut platform
  I want to log in with my account
  So that I can access platform features

  @company @full-auth
  Scenario: Company user logs in through the real sign-in form
    Given real COMPANY credentials are available
    When the COMPANY user signs in through the sign-in form
    Then the token exchange should return 200
    And the browser should hold the session cookie pair
    And the authenticated user should have role "COMPANY"

  @admin @full-auth @2fa @kms
  Scenario: Admin completes the full 2FA login with a KMS-decrypted TOTP secret
    Given real ADMIN credentials are available
    When the ADMIN user signs in through the sign-in form
    Then a two-factor challenge should be presented
    When the admin submits the current TOTP code from the KMS-decrypted secret
    Then the two-factor verification should succeed
    And the browser should hold the session cookie pair
    And the authenticated user should have role "ADMIN"

  @influencer @oauth @kms
  Scenario: Influencer logs in via OAuth with the Instagram token from Firestore
    When the influencer authenticates via the Instagram OAuth simulation
    Then the response status should be 200
    And the OAuth response should contain Instagram user data
    And the browser should hold the session cookie pair
    And the authenticated user should have role "INFLUENCER"
