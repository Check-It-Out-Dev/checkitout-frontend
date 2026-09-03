import { expect, test } from '@playwright/test';
import type { SubscriptionStatusDtoOut } from '../../../src/app/core/api-frozen/hidden-models';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

// Production `/api/subscription/status` reads are typed via the codegen DTO
// (`SubscriptionStatusDtoOut`) so BE rename/reshape ships a TS error after
// `npm run openapi:gen`. Test-only controller responses (`/test/subscription/*`)
// stay as `Record<string, unknown>` because they aren't in the OpenAPI spec —
// shape-asserting them in tests is the only contract anyway.

/**
 * T12 — Port of `subscription-e2e.feature` (7 scenarios).
 *
 * Source of truth: `checkitout-backend/src/test/resources/features/subscription/subscription-e2e.feature`
 * The greenfield FE integration suite is a 1:1 port of the BE Cucumber suite
 * (which was adjusted post Phase 1 OpenAPI rebuild to reflect the canonical
 * contract). Each test here MUST cite the BE scenario it ports.
 *
 * Coverage map (BE scenario → FE test):
 *
 *   ✅ Scenario 1 "Company activates trial and gets Enterprise limits"
 *      → ported (gated on `app.payments.enabled=true`)
 *   ✅ Scenario 3 "Company upgrades from FREE to BUSINESS via webhook"
 *      → ported (uses /test/subscription/simulate-webhook — works in dev
 *      profile per BE commit b1b12657, doesn't require the bean-gated
 *      paid controller)
 *   ✅ Scenario 5 "Payment fails then recovers"
 *      → ported (chains simulate-webhook calls — checkout to seed
 *      Stripe linkage, then invoice.payment_failed → PAYMENT_FAILED,
 *      then invoice.paid → BUSINESS_ACTIVE). Conditionally skips on
 *      app.payments.enabled=false because the production handler chain
 *      requires payments enabled (checkout.session.completed inlines
 *      its state transition; invoice.* hands off to the bean-gated
 *      SubscriptionService methods).
 *   ✅ Scenario 7 "Terms change moves company to TERMS_PENDING then
 *      restores on accept" → ported via single-user set-state stage
 *      + accept-terms (BE commit a54c310b unblocked the set-state
 *      previousStatus seeding; previously the test would have required
 *      the global enterTermsPending() helper which pollutes concurrent
 *      integration tests).
 *   ✅ Scenario 2 "FREE plan blocks campaign creation at limit 5" →
 *      ported via /test/subscription/create-campaign (limit-aware atomic
 *      INSERT…SELECT helper that bypasses the full partnership-form
 *      validation chain). 5 create successes + 6th returns 409.
 *
 * Deferred:
 *   - Scenario 4 (downgrade flow)         — needs bean-gated
 *     /subscription/downgrade endpoint (payments.enabled)
 *   - Scenario 6 (`@fakturownia-live`)    — hits external Fakturownia
 *
 * Run: `npm run test:integration -- --grep subscription-lifecycle`
 */

const UNIQUE = () => `t12-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

test.describe('@subscription @lifecycle — port of subscription-e2e.feature', () => {
  // mock-session POSTs in tight succession from parallel workers occasionally
  // collide on the BE side (409). Serial mode keeps each test's actor seed
  // clean without slowing the spec meaningfully.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${BE_URL}/api/public-config`, {
        ignoreHTTPSErrors: true,
        timeout: 3_000,
      });
      if (!res.ok()) test.skip(true, `BE health-check failed (${res.status()})`);
    } catch (err) {
      test.skip(true, `BE not reachable: ${(err as Error).message}`);
    }
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  // Track which actor emails this suite created so afterEach can reset
  // their CompanySubscription rows back to FREE_ACTIVE. The dev BE runs
  // against the developer's REAL local postgres (not an ephemeral
  // docker DB) — leaving rows in non-FREE_ACTIVE statuses across runs
  // accumulates and eventually trips PaymentsDisabledBootGuard on the
  // next BE start.
  //
  // The reset call goes through page.request (not the bare `request`
  // fixture) because /test/subscription/* sits behind the session auth
  // filter — the bare request fixture has no cookie jar so the cleanup
  // would 401 silently. page.request inherits the test's seeded
  // session cookies.
  const createdEmails: string[] = [];

  test.afterEach(async ({ page }) => {
    for (const email of createdEmails) {
      await page.request.post(`${GREENFIELD_URL}/api/test/subscription/reset`, {
        data: { email },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      });
    }
    createdEmails.length = 0;
  });

  // --------------------------------------------------------------------
  // BE Scenario 1: "Company activates trial and gets Enterprise limits"
  // --------------------------------------------------------------------
  //   When "SubCo" checks subscription status
  //   Then the subscription status should be "FREE_ACTIVE"
  //   And the subscription should have campaign limit 5
  //   And the subscription should be trial eligible
  //
  //   When "SubCo" activates trial
  //   Then the response status should be 200
  //
  //   When "SubCo" checks subscription status
  //   Then the subscription status should be "TRIAL_ENTERPRISE"
  //   And the subscription should have campaign limit 10
  //   And the subscription should NOT be trial eligible
  //
  // Bean-gated on `app.payments.enabled=true`. In dev profile the toggle is
  // `${APP_PAYMENTS_ENABLED:false}` so `SubscriptionPaidController` is
  // unregistered and /trial/activate returns 404. We detect this via the
  // sibling `GET /subscription/config` and skip when payments are off.
  // --------------------------------------------------------------------
  test('@trial-lifecycle Company activates trial and gets Enterprise limits', async ({ page }) => {
    const email = UNIQUE();
    createdEmails.push(email);
    await seedSession(page, email, 'COMPANY');

    // Probe whether SubscriptionPaidController is bean-registered.
    const configProbe = await page.request.get(`${GREENFIELD_URL}/api/subscription/config`, {
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (configProbe.status() === 404) {
      test.skip(
        true,
        'app.payments.enabled=false → SubscriptionPaidController unregistered (trial/upgrade/downgrade/portal all 404). Set APP_PAYMENTS_ENABLED=true on the BE to exercise this scenario.',
      );
    }

    // Pre-state assertions (Cucumber lines 24–27).
    const before = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(before.status()).toBeLessThan(300);
    const beforeBody = (await before.json()) as SubscriptionStatusDtoOut;
    expect(beforeBody.status, 'subscription status should be FREE_ACTIVE').toBe('FREE_ACTIVE');
    expect(beforeBody.campaignLimit, 'subscription should have campaign limit 5').toBe(5);
    expect(beforeBody.trialEligible, 'subscription should be trial eligible').toBe(true);

    // Activate trial (Cucumber lines 29–30).
    const activate = await page.request.post(`${GREENFIELD_URL}/api/subscription/trial/activate`, {
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(activate.status(), 'response status should be 200').toBe(200);

    // Post-state assertions (Cucumber lines 32–35).
    const after = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    const afterBody = (await after.json()) as SubscriptionStatusDtoOut;
    expect(afterBody.status, 'subscription status should be TRIAL_ENTERPRISE').toBe(
      'TRIAL_ENTERPRISE',
    );
    expect(afterBody.campaignLimit, 'subscription should have campaign limit 10').toBe(10);
    expect(afterBody.trialEligible, 'subscription should NOT be trial eligible').toBe(false);
  });

  // --------------------------------------------------------------------
  // BE Scenario 3: "Company upgrades from FREE to BUSINESS via webhook"
  // --------------------------------------------------------------------
  //   When "SubCo" checks subscription status → FREE_ACTIVE
  //   When "Admin" simulates webhook "checkout.session.completed" with plan BUSINESS
  //   When "SubCo" checks subscription status
  //   Then status should be "BUSINESS_ACTIVE"
  //   And plan should be "BUSINESS"
  //   And campaign limit should be 5
  //
  // Uses /test/subscription/simulate-webhook (dev-profile unlock per BE
  // commit b1b12657). Does NOT need the bean-gated paid controller — the
  // Stripe webhook handler runs the production state-transition logic in
  // BE service code directly.
  // --------------------------------------------------------------------
  test('@upgrade-flow Company upgrades from FREE to BUSINESS via simulated webhook', async ({
    page,
  }) => {
    const email = UNIQUE();
    createdEmails.push(email);
    await seedSession(page, email, 'COMPANY');

    // Probe whether /test/subscription/* is registered.
    const probe = await page.request.post(`${GREENFIELD_URL}/api/test/subscription/reset`, {
      data: { email },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (probe.status() === 404) {
      test.skip(true, '/test/subscription/* not registered in this BE profile.');
    }

    // Baseline: fresh COMPANY actor → FREE_ACTIVE.
    const before = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(before.status()).toBeLessThan(300);
    const beforeBody = (await before.json()) as SubscriptionStatusDtoOut;
    expect(beforeBody.status, 'baseline subscription status should be FREE_ACTIVE').toBe(
      'FREE_ACTIVE',
    );

    // Simulate the Stripe checkout-completed webhook for plan BUSINESS.
    const webhook = await page.request.post(
      `${GREENFIELD_URL}/api/test/subscription/simulate-webhook`,
      {
        data: { email, eventType: 'checkout.session.completed', planName: 'BUSINESS' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(
      webhook.status(),
      `simulate-webhook should be 2xx, got ${webhook.status()}: ${(await webhook.text()).slice(0, 200)}`,
    ).toBeLessThan(300);
    const webhookBody = (await webhook.json()) as Record<string, unknown>;
    expect(webhookBody['success'], 'webhook should report success').toBe(true);
    expect(webhookBody['resultingStatus'], 'webhook should resolve to BUSINESS_ACTIVE').toBe(
      'BUSINESS_ACTIVE',
    );

    // /subscription/status read should now reflect BUSINESS_ACTIVE.
    const after = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(after.status()).toBeLessThan(300);
    const afterBody = (await after.json()) as SubscriptionStatusDtoOut;
    expect(afterBody.status, 'subscription status should be BUSINESS_ACTIVE').toBe(
      'BUSINESS_ACTIVE',
    );
    // SubscriptionStatusDtoOut exposes the plan name as `currentPlanName`
    // (canonical post Phase-1 OpenAPI rebuild — see the @Schema in
    // SubscriptionStatusDtoOut.java).
    expect(
      afterBody.currentPlanName,
      `subscription currentPlanName should be BUSINESS, got ${JSON.stringify(afterBody.currentPlanName)}`,
    ).toBe('BUSINESS');
    expect(afterBody.campaignLimit, 'BUSINESS plan campaign limit should be 5').toBe(5);
    // Webhook flips on Stripe linkage even with the synthetic e2e_cus_*
    // / e2e_sub_* ids — verify the flag travels through.
    expect(
      afterBody.hasStripeSubscription,
      'BUSINESS_ACTIVE should have hasStripeSubscription=true after webhook',
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // BE Scenario 5: "Payment fails then recovers"
  // --------------------------------------------------------------------
  //   Given user is BUSINESS_ACTIVE
  //   When "Admin" simulates webhook "invoice.payment_failed"
  //   Then status should be "PAYMENT_FAILED"
  //   When "Admin" simulates webhook "invoice.paid" with amount 2900
  //   Then status should be "BUSINESS_ACTIVE"
  //
  // The BE feature has the admin "set state to BUSINESS_ACTIVE" via the
  // /test/subscription/set-state helper. Here we seed BUSINESS_ACTIVE
  // via the same simulate-webhook(checkout) chain Scenario 3 already
  // proved out — that has the side benefit of seeding the synthetic
  // Stripe IDs that the payment_failed handler looks up.
  // --------------------------------------------------------------------
  test('@payment-failure Payment fails then recovers', async ({ page }) => {
    const email = UNIQUE();
    createdEmails.push(email);
    await seedSession(page, email, 'COMPANY');

    // The invoice.payment_failed / invoice.paid simulate-webhook paths
    // call SubscriptionService.handlePaymentFailed/handleInvoicePaid,
    // which are gated by requirePaymentsEnabled() — same bean as
    // SubscriptionPaidController, so the /subscription/config 404 probe
    // doubles as a "payments-off" check.
    const configProbe = await page.request.get(`${GREENFIELD_URL}/api/subscription/config`, {
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    if (configProbe.status() === 404) {
      test.skip(
        true,
        'app.payments.enabled=false → SubscriptionService.handlePaymentFailed/handleInvoicePaid throw PaymentsDisabledException. Set APP_PAYMENTS_ENABLED=true on the BE to exercise this scenario.',
      );
    }

    // Force the CompanySubscription row into existence by reading
    // /subscription/status — the production read endpoint lazy-creates
    // FREE_ACTIVE for first-touch users. Without this, simulate-webhook
    // 500s with "No subscription for: <email>".
    const seed = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(
      seed.status(),
      `lazy-init read of /subscription/status should be 2xx, got ${seed.status()}`,
    ).toBeLessThan(300);

    // Seed BUSINESS_ACTIVE via the checkout webhook (Scenario 3 proved
    // this also creates the synthetic Stripe linkage that the
    // payment_failed handler needs to find the subscription).
    const upgrade = await page.request.post(
      `${GREENFIELD_URL}/api/test/subscription/simulate-webhook`,
      {
        data: { email, eventType: 'checkout.session.completed', planName: 'BUSINESS' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(
      upgrade.status(),
      `seed BUSINESS_ACTIVE should be 2xx, got ${upgrade.status()}: ${(await upgrade.text()).slice(0, 200)}`,
    ).toBeLessThan(300);

    // Step 1: payment fails → PAYMENT_FAILED
    const fail = await page.request.post(
      `${GREENFIELD_URL}/api/test/subscription/simulate-webhook`,
      {
        data: { email, eventType: 'invoice.payment_failed' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(
      fail.status(),
      `simulate invoice.payment_failed should be 2xx, got ${fail.status()}: ${(await fail.text()).slice(0, 200)}`,
    ).toBeLessThan(300);
    const failBody = (await fail.json()) as Record<string, unknown>;
    expect(
      failBody['resultingStatus'],
      'payment-failed webhook should land status in PAYMENT_FAILED',
    ).toBe('PAYMENT_FAILED');

    const afterFail = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(afterFail.status()).toBeLessThan(300);
    const afterFailBody = (await afterFail.json()) as SubscriptionStatusDtoOut;
    expect(
      afterFailBody.status,
      `/subscription/status after payment_failed should be PAYMENT_FAILED, got ${JSON.stringify(afterFailBody)}`,
    ).toBe('PAYMENT_FAILED');

    // Step 2: invoice paid → BUSINESS_ACTIVE
    const recover = await page.request.post(
      `${GREENFIELD_URL}/api/test/subscription/simulate-webhook`,
      {
        data: { email, eventType: 'invoice.paid', amountPaidCents: 2900, currency: 'pln' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(
      recover.status(),
      `simulate invoice.paid should be 2xx, got ${recover.status()}: ${(await recover.text()).slice(0, 200)}`,
    ).toBeLessThan(300);

    const afterRecover = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(afterRecover.status()).toBeLessThan(300);
    const afterRecoverBody = (await afterRecover.json()) as SubscriptionStatusDtoOut;
    expect(
      afterRecoverBody.status,
      `/subscription/status after invoice.paid should recover to BUSINESS_ACTIVE, got ${JSON.stringify(afterRecoverBody)}`,
    ).toBe('BUSINESS_ACTIVE');
  });

  // --------------------------------------------------------------------
  // BE Scenario 7: "Terms change moves company to TERMS_PENDING then
  // restores on accept"
  // --------------------------------------------------------------------
  //   Given user is BUSINESS_ACTIVE
  //   When "Admin" triggers enter-terms-pending
  //   When "SubCo" checks subscription status → "TERMS_PENDING"
  //   When "Admin" accepts terms for user
  //   When "SubCo" checks subscription status → "BUSINESS_ACTIVE"
  //
  // The BE Cucumber drives this via the global enterTermsPending() helper,
  // which is safe in their @Transactional rollback world but would
  // pollute concurrent FE integration tests (it flips EVERY active
  // subscription in the DB). Instead this port stages TERMS_PENDING for
  // a single actor via /test/subscription/set-state with the explicit
  // previousStatus field (BE commit a54c310b).
  //
  // Neither enterTermsPending nor acceptTerms touch requirePaymentsEnabled,
  // so this test stays green even when app.payments.enabled=false.
  // --------------------------------------------------------------------
  test('@terms-versioning Terms change → TERMS_PENDING → accept restores BUSINESS_ACTIVE', async ({
    page,
  }) => {
    const email = UNIQUE();
    createdEmails.push(email);
    await seedSession(page, email, 'COMPANY');

    // Probe: skip if /test/subscription/* not registered.
    const probe = await page.request.get(
      `${GREENFIELD_URL}/api/test/subscription/state?email=${encodeURIComponent(email)}`,
      { ignoreHTTPSErrors: true, failOnStatusCode: false },
    );
    if (probe.status() === 404) {
      test.skip(true, '/test/subscription/* not registered in this BE profile.');
    }

    // Lazy-init the CompanySubscription row (set-state requires one to
    // already exist; mock-session doesn't create it).
    await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });

    // Stage 1: baseline BUSINESS_ACTIVE.
    const setBusiness = await page.request.post(
      `${GREENFIELD_URL}/api/test/subscription/set-state`,
      {
        data: { email, planName: 'BUSINESS', status: 'BUSINESS_ACTIVE' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(
      setBusiness.status(),
      `set-state BUSINESS_ACTIVE should be 2xx, got ${setBusiness.status()}: ${(await setBusiness.text()).slice(0, 200)}`,
    ).toBeLessThan(300);

    // Stage 2: simulate terms-pending event for THIS user only (uses
    // the new previousStatus field — see BE commit a54c310b).
    const setTermsPending = await page.request.post(
      `${GREENFIELD_URL}/api/test/subscription/set-state`,
      {
        data: {
          email,
          planName: 'BUSINESS',
          status: 'TERMS_PENDING',
          previousStatus: 'BUSINESS_ACTIVE',
        },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(
      setTermsPending.status(),
      `set-state TERMS_PENDING should be 2xx, got ${setTermsPending.status()}: ${(await setTermsPending.text()).slice(0, 200)}`,
    ).toBeLessThan(300);

    // Verify the user observes TERMS_PENDING via the production status read.
    const inTerms = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(inTerms.status()).toBeLessThan(300);
    const inTermsBody = (await inTerms.json()) as SubscriptionStatusDtoOut;
    expect(
      inTermsBody.status,
      `/subscription/status after set-state TERMS_PENDING should be TERMS_PENDING, got ${JSON.stringify(inTermsBody)}`,
    ).toBe('TERMS_PENDING');

    // Stage 3: accept-terms → restores previousState (BUSINESS_ACTIVE).
    const accept = await page.request.post(`${GREENFIELD_URL}/api/test/subscription/accept-terms`, {
      data: { email },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(
      accept.status(),
      `accept-terms should be 2xx, got ${accept.status()}: ${(await accept.text()).slice(0, 200)}`,
    ).toBeLessThan(300);
    const acceptBody = (await accept.json()) as Record<string, unknown>;
    expect(
      acceptBody['restoredStatus'],
      'accept-terms should report restoredStatus=BUSINESS_ACTIVE',
    ).toBe('BUSINESS_ACTIVE');

    // Verify user observes the restored status via the production read.
    const restored = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(restored.status()).toBeLessThan(300);
    const restoredBody = (await restored.json()) as SubscriptionStatusDtoOut;
    expect(
      restoredBody.status,
      `/subscription/status after accept-terms should restore to BUSINESS_ACTIVE, got ${JSON.stringify(restoredBody)}`,
    ).toBe('BUSINESS_ACTIVE');
  });

  // --------------------------------------------------------------------
  // BE Scenario 2: "FREE plan blocks campaign creation at limit 5"
  // --------------------------------------------------------------------
  //   When "SubCo" checks subscription status → FREE_ACTIVE, limit 5
  //   When "SubCo" creates 5 test campaigns → all 200
  //   When "SubCo" creates a 6th campaign → 409 CAMPAIGN_LIMIT
  //
  // Uses /test/subscription/create-campaign (atomic limit-aware
  // INSERT…SELECT in the controller — bypasses full partnership-form
  // validation, exercises the limit-guard directly). The endpoint
  // returns 200 with success=true while under the limit, 409 when the
  // count blocks the insert.
  // --------------------------------------------------------------------
  test('@campaign-limit FREE plan blocks campaign creation at limit 5', async ({ page }) => {
    const email = UNIQUE();
    createdEmails.push(email);
    await seedSession(page, email, 'COMPANY');

    // Probe for /test/subscription/* availability.
    const probe = await page.request.get(
      `${GREENFIELD_URL}/api/test/subscription/state?email=${encodeURIComponent(email)}`,
      { ignoreHTTPSErrors: true, failOnStatusCode: false },
    );
    if (probe.status() === 404) {
      test.skip(true, '/test/subscription/* not registered in this BE profile.');
    }

    // Baseline: fresh COMPANY actor is FREE_ACTIVE with limit 5.
    const status = await page.request.get(`${GREENFIELD_URL}/api/subscription/status`, {
      ignoreHTTPSErrors: true,
    });
    expect(status.status()).toBeLessThan(300);
    const statusBody = (await status.json()) as SubscriptionStatusDtoOut;
    expect(statusBody.status, 'baseline status should be FREE_ACTIVE').toBe('FREE_ACTIVE');
    expect(statusBody.campaignLimit, 'FREE plan campaign limit should be 5').toBe(5);

    // Create 5 campaigns under the limit — each should succeed (200).
    for (let i = 1; i <= 5; i++) {
      const create = await page.request.post(
        `${GREENFIELD_URL}/api/test/subscription/create-campaign`,
        {
          data: { campaignName: `Free Campaign ${i}` },
          ignoreHTTPSErrors: true,
          failOnStatusCode: false,
        },
      );
      expect(
        create.status(),
        `create-campaign #${i} should be 200, got ${create.status()}: ${(await create.text()).slice(0, 200)}`,
      ).toBe(200);
    }

    // 6th attempt — limit-blocked. Controller returns 409 with
    // error="CAMPAIGN_LIMIT" + the active limit echoed back.
    const blocked = await page.request.post(
      `${GREENFIELD_URL}/api/test/subscription/create-campaign`,
      {
        data: { campaignName: 'Free Campaign 6 Over Limit' },
        ignoreHTTPSErrors: true,
        failOnStatusCode: false,
      },
    );
    expect(
      blocked.status(),
      `6th campaign should be 409 (limit-blocked), got ${blocked.status()}: ${(await blocked.text()).slice(0, 200)}`,
    ).toBe(409);
    const blockedBody = (await blocked.json()) as Record<string, unknown>;
    expect(
      blockedBody['error'],
      `blocked response should carry error=CAMPAIGN_LIMIT, got ${JSON.stringify(blockedBody)}`,
    ).toBe('CAMPAIGN_LIMIT');
    expect(
      blockedBody['limit'],
      `blocked response should echo the active limit (5), got ${JSON.stringify(blockedBody)}`,
    ).toBe(5);
  });
});
