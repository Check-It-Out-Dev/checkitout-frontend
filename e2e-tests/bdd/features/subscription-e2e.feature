# Source of truth: checkitout-backend/src/test/resources/features/subscription/subscription-e2e.feature
#
# Adaptations (BE Cucumber → FE oracle), scenario-for-scenario otherwise:
# - The BE Background's real-Firebase logins (Admin password + KMS 2FA, SubCo
#   password) collapse to mock-session TestSessions: the BE issues the same
#   HttpOnly session cookie pair either way, so every /subscription
#   read/transition below observes the identical contract. The BE's real
#   Gmail-backed target user becomes the fixed mock actor company1@e2e.test —
#   "the company user" in these steps is that actor; admin steps act on its
#   email exactly like the BE glue acts on the literal Gmail address.
# - BE "target user is synced and has status ACTIVE and role COMPANY" →
#   mock-session seeding (creates/syncs the COMPANY user) +
#   /test/auth/set-account-status ACTIVE, folded into the company Given.
# - Admin state staging keeps the SAME /test/subscription/* hooks the BE glue
#   calls (reset / set-state / simulate-webhook / accept-terms / create-campaign);
#   all company-side checks go through the PRODUCTION endpoints via the typed
#   L1 service (SubscriptionApi → generated DTOs/enums), so BE contract drift
#   breaks this oracle at compile time.
# - @payments-gated scenarios (trial, downgrade, payment-failure, invoicing)
#   need app.payments.enabled=true: SubscriptionPaidController is bean-gated
#   and the invoice.* webhook handlers throw PaymentsDisabledException when
#   the toggle is off (dev default). A probe Given (GET /subscription/config
#   → 404 = off) self-skips them, mirroring the tier's BE-reachability guard;
#   they run fully against a payments-enabled BE (staging profile).
# - Scenario 6's "invoice SENT" additionally requires real Fakturownia
#   delivery (external sandbox creds; AFTER_COMMIT async send), so it is
#   @be-internal-gated behind FAKTUROWNIA_LIVE=true. The assertion reads the
#   PRODUCTION GET /subscription/invoices (typed InvoiceRecordDtoOut) instead
#   of the BE's admin-side /test/subscription/invoices — a strictly
#   FE-surface-truer equivalent — and polls briefly because the send is async.
# - Scenario 7: the BE's global enter-terms-pending hook flips EVERY active
#   subscription; safe inside the BE's rolled-back Cucumber transaction,
#   destructive on the live persistent dev DB this oracle shares. Adapted to
#   the equivalent single-user staging via set-state TERMS_PENDING +
#   previousStatus (BE commit a54c310b added previousStatus for exactly this);
#   the accept-terms hook and both production status assertions are unchanged.
@subscription
Feature: Subscription Module E2E Tests
  As a COMPANY user I want to manage my subscription plan
  So that I can create campaigns within my plan limits

  Background:
    Given the admin is signed in with a mock session
    And the subscription company user is signed in and active
    And the admin resets the company user subscription

  # ===========================================================================
  # SCENARIO 1: Trial lifecycle
  # ===========================================================================

  @subscription @trial-lifecycle @payments-gated
  Scenario: Company activates trial and gets Enterprise limits
    Given the paid subscription endpoints are enabled on this BE
    When the company user checks subscription status
    Then the subscription status should be "FREE_ACTIVE"
    And the subscription should have campaign limit 5
    And the subscription should be trial eligible

    When the company user activates the trial
    Then the response status should be 200

    When the company user checks subscription status
    Then the subscription status should be "TRIAL_ENTERPRISE"
    And the subscription should have campaign limit 10
    And the subscription should NOT be trial eligible

  # ===========================================================================
  # SCENARIO 2: Campaign limit enforcement on FREE plan
  # ===========================================================================

  @subscription @campaign-limit
  Scenario: FREE plan blocks campaign creation at limit 5
    When the company user checks subscription status
    Then the subscription status should be "FREE_ACTIVE"
    And the subscription should have campaign limit 5

    When the company user creates a test campaign named "Free Campaign 1"
    Then the response status should be 200

    When the company user creates a test campaign named "Free Campaign 2"
    Then the response status should be 200

    When the company user creates a test campaign named "Free Campaign 3"
    Then the response status should be 200

    When the company user creates a test campaign named "Free Campaign 4"
    Then the response status should be 200

    When the company user creates a test campaign named "Free Campaign 5"
    Then the response status should be 200

    When the company user creates a test campaign named "Free Campaign 6 Over Limit"
    Then the campaign creation should be blocked

  # ===========================================================================
  # SCENARIO 3: Upgrade via simulated webhook
  # ===========================================================================

  @subscription @upgrade-flow
  Scenario: Company upgrades from FREE to BUSINESS via webhook
    When the company user checks subscription status
    Then the subscription status should be "FREE_ACTIVE"

    When the admin simulates webhook "checkout.session.completed" for the company user with plan "BUSINESS"

    When the company user checks subscription status
    Then the subscription status should be "BUSINESS_ACTIVE"
    And the subscription should have plan "BUSINESS"
    And the subscription should have campaign limit 5

  # ===========================================================================
  # SCENARIO 4: Downgrade flow
  # ===========================================================================

  @subscription @downgrade-flow @payments-gated
  Scenario: Company downgrades from ENTERPRISE to FREE then cancels
    Given the paid subscription endpoints are enabled on this BE
    And the admin sets the company user subscription to plan "ENTERPRISE" with status "ENTERPRISE_ACTIVE"

    When the company user checks subscription status
    Then the subscription status should be "ENTERPRISE_ACTIVE"

    When the company user requests downgrade to plan "FREE"
    Then the response status should be 200

    When the company user checks subscription status
    Then the subscription status should be "DOWNGRADE_PENDING"

    When the company user cancels the pending downgrade
    Then the response status should be 200

    When the company user checks subscription status
    Then the subscription status should be "ENTERPRISE_ACTIVE"

  # ===========================================================================
  # SCENARIO 5: Payment failure and recovery
  # ===========================================================================

  @subscription @payment-failure @payments-gated
  Scenario: Payment fails then recovers
    Given the paid subscription endpoints are enabled on this BE
    And the admin sets the company user subscription to plan "BUSINESS" with status "BUSINESS_ACTIVE"

    When the admin simulates webhook "invoice.payment_failed" for the company user

    When the company user checks subscription status
    Then the subscription status should be "PAYMENT_FAILED"

    When the admin simulates webhook "invoice.paid" for the company user with amount 2900

    When the company user checks subscription status
    Then the subscription status should be "BUSINESS_ACTIVE"

  # ===========================================================================
  # SCENARIO 6: Invoice lifecycle via Fakturownia
  # ===========================================================================

  # @be-internal-gated: the SENT assertion depends on the BE-internal
  # InvoiceCreatedEvent AFTER_COMMIT outbox delivering to the EXTERNAL
  # Fakturownia API (real sandbox creds; dev BE runs invoicing off by flag) —
  # opt in with FAKTUROWNIA_LIVE=true against a payments-enabled BE (staging).
  @subscription @invoicing @payments-gated @be-internal-gated
  Scenario: Invoice created on payment and sent to Fakturownia
    Given the paid subscription endpoints are enabled on this BE
    And live Fakturownia invoicing is enabled on this BE
    And the admin sets the company user subscription to plan "BUSINESS" with status "BUSINESS_ACTIVE"

    # Verify company NIP via the scripted registries (GUS/CEIDG stubs) to populate CompanyData
    Given the company user verifies company NIP "8943264018"

    When the admin simulates webhook "invoice.paid" for the company user with amount 2900

    # InvoiceCreatedEvent fires AFTER_COMMIT → immediate Fakturownia send
    Then the company user should have a newest invoice with status "SENT"

  # ===========================================================================
  # SCENARIO 7: Terms versioning lifecycle
  # ===========================================================================

  @subscription @terms-versioning
  Scenario: Terms change moves company to TERMS_PENDING then restores on accept
    Given the admin sets the company user subscription to plan "BUSINESS" with status "BUSINESS_ACTIVE"

    # BE: 'When "Admin" triggers enter-terms-pending' (global flip) — adapted to
    # single-user staging on the live shared DB; see the header adaptation note.
    When the admin stages terms-pending for the company user with plan "BUSINESS" and previous status "BUSINESS_ACTIVE"

    When the company user checks subscription status
    Then the subscription status should be "TERMS_PENDING"

    When the admin accepts terms for the company user

    When the company user checks subscription status
    Then the subscription status should be "BUSINESS_ACTIVE"
