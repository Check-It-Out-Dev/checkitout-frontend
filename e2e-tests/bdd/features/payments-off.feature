# Source of truth: checkitout-backend/src/test/resources/features/payments_off/payments-off.feature
#
# Adaptations (BE Cucumber → FE oracle), scenario-for-scenario otherwise:
# - The BE suite boots its own context with app.payments.enabled=false, so its
#   paymentsEnabled=false and bean-gated-404 assertions are unconditional. This
#   oracle runs against the live shared BE where the toggle is an environment
#   fact (dev default OFF, payments-enabled staging ON). Scenarios 1 and 3
#   assert the toggle-DEPENDENT half of the contract, so each carries an added
#   probe Given ("payments are disabled on this BE" — GET /public-config via
#   the generated PublicConfigDto) that self-skips when the toggle is ON,
#   mirroring subscription-e2e.feature's @payments-gated probe, inverted.
# - Scenario 2's 401s are toggle-INDEPENDENT (Spring Security's
#   .authenticated() catch-all fires before handler dispatch — the BE source's
#   own note, kept below), so it runs ungated in both toggle states.
# - The BE feature's literal JSON body strings go out byte-for-byte as Buffers
#   (PaymentsConfigApi.postRaw): Playwright would otherwise JSON-re-serialize
#   a string body under the json content type, mangling what the BE sends.
# - The FREE-plan campaign-limit=5 preamble note is exercised by
#   subscription-e2e.feature Scenario 2, not here (same split as the BE corpus).
@payments-off
Feature: Payments toggle OFF — paying infrastructure is hidden
  When app.payments.enabled = false the public-config endpoint advertises the toggle
  state, paid endpoints return 404, and the Stripe webhook is unreachable. The FREE plan
  campaign limit is 5 (DB-seeded; not toggle-coupled).

  # =========================================================================
  # SCENARIO 1: Public config endpoint
  # =========================================================================

  @payments-off @public-config @payments-off-gated
  Scenario: GET /api/public-config returns paymentsEnabled=false anonymously
    # Probe Given added for the live shared BE — see the header adaptation note.
    Given payments are disabled on this BE
    When anonymous client GETs "/public-config"
    Then the anonymous response status should be 200
    And the anonymous response body should contain "paymentsEnabled" with value "false"
    And the anonymous response Cache-Control header should contain "no-store"

  # =========================================================================
  # SCENARIO 2: Paid endpoints are unreachable anonymously
  # =========================================================================
  # Note (BE source, kept verbatim): anonymous calls to /api/subscription/**
  # return 401 because Spring Security's .authenticated() catch-all fires
  # BEFORE the dispatcher looks up a handler — so we cannot distinguish "bean
  # absent (404)" from "not authenticated (401)" without a real login. The
  # bean-gating itself is proven by SCENARIO 3 below (Stripe webhook is
  # permitAll and DOES return 404 when the bean is absent) and by the unit
  # test SubscriptionService_PaymentsToggleUnitTest (defense-in-depth guard).
  # Asserting 401 here still meaningfully proves the paid endpoints are
  # unreachable to unauthenticated clients in a payments-off deployment.

  @payments-off @hidden-endpoints
  Scenario: Paid subscription endpoints are unreachable to anonymous clients
    When anonymous client POSTs "/subscription/upgrade" with body "{\"targetPlan\":\"BUSINESS\"}"
    Then the anonymous response status should be 401

    When anonymous client POSTs "/subscription/trial/activate" with body "{}"
    Then the anonymous response status should be 401

    When anonymous client POSTs "/subscription/portal" with body "{}"
    Then the anonymous response status should be 401

    When anonymous client GETs "/subscription/config"
    Then the anonymous response status should be 401

  # =========================================================================
  # SCENARIO 3: Stripe webhook is bean-gated → 404
  # =========================================================================

  @payments-off @stripe-webhook @payments-off-gated
  Scenario: Stripe webhook endpoint returns 404 when payments are off
    # Probe Given added for the live shared BE: with payments ON the webhook
    # bean is registered and answers 4xx (bad signature), not 404 — see header.
    Given payments are disabled on this BE
    When anonymous client POSTs "/webhooks/stripe" with header "Stripe-Signature" "test_sig" and body "{}"
    Then the anonymous response status should be 404
