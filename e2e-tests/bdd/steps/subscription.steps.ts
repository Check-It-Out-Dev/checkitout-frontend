import { ACTORS } from '../../_framework/actor';
import type { ApiResult } from '../../_framework/api/http-client';
import { RegistryApi } from '../../_framework/api/registry.api';
import {
  SubscriptionApi,
  type SimulatedStripeEvent,
  type TestSimulateWebhookRequest,
} from '../../_framework/api/subscription.api';
import { TestSession } from '../../_framework/api/test-session';
import { After, Given, Then, When, expect, test } from './fixtures';

import type { InvoiceRecordDtoOut } from '../../../src/app/core/api-frozen/hidden-models';
import type { SubscriptionStatusDtoOut } from '../../../src/app/core/api-frozen/hidden-models';
import { SubscriptionStatus } from '../../../src/app/core/api-frozen/hidden-models';
import { InvoiceStatus } from '../../../src/app/core/api-frozen/hidden-models';
import { DowngradeRequestDtoInTargetPlanEnum } from '../../../src/app/core/api-frozen/hidden-models';

/**
 * Subscription lifecycle oracle — Layer 2 (subscription-e2e.feature).
 *
 * Mirrors checkitout-backend/.../subscription/subscription-e2e.feature against the
 * LIVE BE through the Layer-1 SubscriptionApi: admin staging rides the same
 * /test/subscription/* hooks the BE glue calls; every company-side check reads
 * the PRODUCTION endpoints typed by the generated DTOs (SubscriptionStatusDtoOut,
 * InvoiceRecordDtoOut) and enums (SubscriptionStatus, InvoiceStatus,
 * DowngradeRequestDtoInTargetPlanEnum), so BE contract drift breaks here at
 * compile time and feature-file state names are containment-checked against
 * the generated enums at runtime (same guard partnership.steps.ts uses).
 *
 * Gating: the paid production endpoints AND the invoice.* webhook handler
 * chain are bean-gated on app.payments.enabled (dev default: off) — the probe
 * Given self-skips those scenarios via GET /subscription/config (404 = off),
 * exactly like the integration tier's subscription-lifecycle.spec.ts. The
 * Fakturownia SENT assertion is opt-in via FAKTUROWNIA_LIVE=true.
 */

interface SubscriptionWorld {
  adminSession?: TestSession;
  companySession?: TestSession;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
  /** Last GET /subscription/status body, for the "the subscription …" Then steps. */
  lastSubscriptionStatus?: SubscriptionStatusDtoOut;
}

const SIMULATED_EVENTS: readonly SimulatedStripeEvent[] = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
];

function companySession(world: SubscriptionWorld): TestSession {
  if (!world.companySession) throw new Error('no company session — did the Background run?');
  return world.companySession;
}

function adminSession(world: SubscriptionWorld): TestSession {
  if (!world.adminSession) throw new Error('no admin session — did the Background run?');
  return world.adminSession;
}

/** Layer-1 subscription service bound to the company (SubCo) transport. */
function companyApi(world: SubscriptionWorld): SubscriptionApi {
  return new SubscriptionApi(companySession(world).api);
}

/** Layer-1 subscription service bound to the admin transport (/test staging). */
function adminApi(world: SubscriptionWorld): SubscriptionApi {
  return new SubscriptionApi(adminSession(world).api);
}

/** The mock company actor's email — the BE feature's literal Gmail address analog. */
function companyEmail(world: SubscriptionWorld): string {
  return companySession(world).actor.email;
}

/** Stash status+headers+body so `the response status should be {int}` (partnership.steps.ts) asserts it. */
function record(world: SubscriptionWorld, r: ApiResult): void {
  world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

/** Admin dispatches a synthetic Stripe event for the company user and it must land 2xx. */
async function simulateWebhook(
  world: SubscriptionWorld,
  req: Omit<TestSimulateWebhookRequest, 'email' | 'eventType'> & { eventType: string },
): Promise<void> {
  expect(
    SIMULATED_EVENTS as readonly string[],
    `"${req.eventType}" is not a simulate-webhook event type`,
  ).toContain(req.eventType);
  const r = await adminApi(world).testSimulateWebhook({
    ...req,
    email: companyEmail(world),
    eventType: req.eventType as SimulatedStripeEvent,
  });
  record(world, r);
  expect(
    r.ok,
    `simulate-webhook ${req.eventType} (HTTP ${r.status}): ${r.body.slice(0, 300)}`,
  ).toBeTruthy();
}

/** Feature-file status names must be real generated-enum members (contract guard). */
function requireStatusMember(expected: string): SubscriptionStatus {
  expect(
    Object.values(SubscriptionStatus),
    `"${expected}" is not a SubscriptionStatus member`,
  ).toContain(expected);
  return expected as SubscriptionStatus;
}

// ── Background — admin + company mock-sessions, reset baseline ──────────────
// ('the admin is signed in with a mock session' is reused from consent.steps.ts)

Given('the subscription company user is signed in and active', async ({ playwright, world }) => {
  // Collapses the BE's real-Firebase SubCo login + "target user is synced and
  // has status ACTIVE and role COMPANY": mock-session creates/syncs the
  // COMPANY user and issues the same session cookie pair; activate() forces
  // accountStatus ACTIVE for order-independence across oracles.
  world.companySession = await TestSession.open(playwright, ACTORS['company1']);
  await world.companySession.activate();
});

Given('the admin resets the company user subscription', async ({ world }) => {
  // Deletes subscription + events + invoices + billing periods, so every
  // scenario starts trial-eligible on a lazily re-created FREE_ACTIVE row —
  // the BE Background's reset step, verbatim mechanics.
  const r = await adminApi(world).testReset(companyEmail(world));
  expect(r.ok, `subscription reset (HTTP ${r.status}): ${r.body.slice(0, 300)}`).toBeTruthy();
});

After({ tags: '@subscription' }, async ({ world }) => {
  // Boot-guard hygiene: the dev BE (payments disabled) refuses to boot while a
  // subscription row sits in an in-flight PAID status (PaymentsDisabledBootGuard,
  // hit live 2026-09-02) — always park the company back on FREE_ACTIVE.
  // partnership.steps.ts' untagged After also restores+disposes companySession
  // for every scenario; double restore/dispose is harmless and both are guarded.
  await world.companySession?.restoreFreePlan().catch(() => undefined);
  await world.companySession?.dispose().catch(() => undefined);
  await world.adminSession?.dispose().catch(() => undefined);
});

// ── Skip gates (self-skip pattern, like the tier's BE-reachability guard) ───

Given('the paid subscription endpoints are enabled on this BE', async ({ world }) => {
  // SubscriptionPaidController AND the invoice.* handler chain are bean-gated
  // on app.payments.enabled; GET /subscription/config 404s when it is off.
  const r = await companyApi(world).paymentsConfig();
  test.skip(
    r.status === 404,
    'app.payments.enabled=false → SubscriptionPaidController + invoice.* webhook handlers unregistered (dev default). Set APP_PAYMENTS_ENABLED=true on the BE (staging profile) to exercise this scenario.',
  );
});

Given('live Fakturownia invoicing is enabled on this BE', async ({}) => {
  test.skip(
    process.env['FAKTUROWNIA_LIVE'] !== 'true',
    'The SENT assertion needs the real Fakturownia sandbox (BE outbox → external API). Opt in with FAKTUROWNIA_LIVE=true against a payments-enabled BE with Fakturownia creds.',
  );
});

// ── Production status read + assertions ─────────────────────────────────────

When('the company user checks subscription status', async ({ world }) => {
  const w = world as SubscriptionWorld;
  const r = await companyApi(w).status();
  record(w, r);
  expect(r.ok, `GET /subscription/status (HTTP ${r.status}): ${r.body.slice(0, 300)}`).toBeTruthy();
  w.lastSubscriptionStatus = r.json;
});

Then('the subscription status should be {string}', async ({ world }, expected: string) => {
  const member = requireStatusMember(expected);
  const w = world as SubscriptionWorld;
  expect(w.lastSubscriptionStatus, 'no status recorded — did the check step run?').toBeTruthy();
  expect(w.lastSubscriptionStatus?.status).toBe(member);
});

Then('the subscription should have plan {string}', async ({ world }, planName: string) => {
  const w = world as SubscriptionWorld;
  expect(w.lastSubscriptionStatus?.currentPlanName).toBe(planName);
});

Then('the subscription should have campaign limit {int}', async ({ world }, limit: number) => {
  const w = world as SubscriptionWorld;
  expect(w.lastSubscriptionStatus?.campaignLimit).toBe(limit);
});

Then('the subscription should be trial eligible', async ({ world }) => {
  const w = world as SubscriptionWorld;
  expect(w.lastSubscriptionStatus?.trialEligible).toBe(true);
});

Then('the subscription should NOT be trial eligible', async ({ world }) => {
  const w = world as SubscriptionWorld;
  expect(w.lastSubscriptionStatus?.trialEligible).toBe(false);
});

// ── Trial (paid production endpoint) ────────────────────────────────────────

When('the company user activates the trial', async ({ world }) => {
  const w = world as SubscriptionWorld;
  record(w, await companyApi(w).activateTrial());
});

// ── Campaign limit (limit-aware /test insert, runs AS the company) ──────────

When(
  'the company user creates a test campaign named {string}',
  async ({ world }, campaignName: string) => {
    const w = world as SubscriptionWorld;
    record(w, await companyApi(w).testCreateCampaign(campaignName));
  },
);

Then('the campaign creation should be blocked', async ({ world }) => {
  const w = world as SubscriptionWorld;
  // BE glue asserts >= 400; the controller contract is specifically
  // 409 error=CAMPAIGN_LIMIT, so surface that marker too.
  expect(
    w.lastResponse?.status ?? 0,
    `expected a limit block; body: ${(w.lastResponse?.body ?? '(none)').slice(0, 300)}`,
  ).toBeGreaterThanOrEqual(400);
  expect(w.lastResponse?.body ?? '').toContain('CAMPAIGN_LIMIT');
});

// ── Downgrade (paid production endpoints) ───────────────────────────────────

When('the company user requests downgrade to plan {string}', async ({ world }, plan: string) => {
  expect(
    Object.values(DowngradeRequestDtoInTargetPlanEnum),
    `"${plan}" is not a DowngradeRequestDtoIn.targetPlan member`,
  ).toContain(plan);
  const w = world as SubscriptionWorld;
  record(
    w,
    await companyApi(w).requestDowngrade({
      targetPlan: plan as DowngradeRequestDtoInTargetPlanEnum,
    }),
  );
});

When('the company user cancels the pending downgrade', async ({ world }) => {
  const w = world as SubscriptionWorld;
  record(w, await companyApi(w).cancelDowngrade());
});

// ── Admin staging: set-state / webhooks / terms ─────────────────────────────

Given(
  'the admin sets the company user subscription to plan {string} with status {string}',
  async ({ world }, planName: string, status: string) => {
    const w = world as SubscriptionWorld;
    const r = await adminApi(w).testSetState({
      email: companyEmail(w),
      planName,
      status: requireStatusMember(status),
    });
    expect(r.ok, `set-state ${status} (HTTP ${r.status}): ${r.body.slice(0, 300)}`).toBeTruthy();
  },
);

When(
  'the admin simulates webhook {string} for the company user',
  async ({ world }, eventType: string) => {
    await simulateWebhook(world as SubscriptionWorld, { eventType });
  },
);

When(
  'the admin simulates webhook {string} for the company user with plan {string}',
  async ({ world }, eventType: string, planName: string) => {
    await simulateWebhook(world as SubscriptionWorld, { eventType, planName });
  },
);

When(
  'the admin simulates webhook {string} for the company user with amount {int}',
  async ({ world }, eventType: string, amountPaidCents: number) => {
    await simulateWebhook(world as SubscriptionWorld, { eventType, amountPaidCents });
  },
);

When(
  'the admin stages terms-pending for the company user with plan {string} and previous status {string}',
  async ({ world }, planName: string, previousStatus: string) => {
    // Single-user replacement for the BE's global enter-terms-pending hook —
    // see the feature header. previousStatus seeds the restoration target the
    // accept-terms path reads (BE commit a54c310b).
    const w = world as SubscriptionWorld;
    const r = await adminApi(w).testSetState({
      email: companyEmail(w),
      planName,
      status: SubscriptionStatus.TERMS_PENDING,
      previousStatus: requireStatusMember(previousStatus),
    });
    expect(
      r.ok,
      `set-state TERMS_PENDING (HTTP ${r.status}): ${r.body.slice(0, 300)}`,
    ).toBeTruthy();
  },
);

When('the admin accepts terms for the company user', async ({ world }) => {
  const w = world as SubscriptionWorld;
  const r = await adminApi(w).testAcceptTerms(companyEmail(w));
  record(w, r);
  expect(r.ok, `accept-terms (HTTP ${r.status}): ${r.body.slice(0, 300)}`).toBeTruthy();
});

// ── Company data (NIP verification via scripted registries) ─────────────────

Given('the company user verifies company NIP {string}', async ({ world }, nip: string) => {
  // Mirrors the BE glue verbatim: configure the KRS stub, lookup, then confirm
  // through the production endpoints (200 fresh, 409 when CompanyData already
  // exists for this fixed actor — both mean "verified").
  const w = world as SubscriptionWorld;
  const registry = new RegistryApi(companySession(w).api);
  await registry.configureKrsCompany(nip);
  await registry.lookup(nip);
  const confirm = await registry.confirm(nip);
  record(w, confirm);
  expect(
    [200, 409],
    `NIP confirm should be 200 or 409, got ${confirm.status}: ${confirm.body.slice(0, 300)}`,
  ).toContain(confirm.status);
});

// ── Invoices (production endpoint, typed by the generated DTO) ──────────────

Then(
  'the company user should have a newest invoice with status {string}',
  async ({ world }, expected: string) => {
    expect(Object.values(InvoiceStatus), `"${expected}" is not an InvoiceStatus member`).toContain(
      expected,
    );
    const w = world as SubscriptionWorld;
    const api = companyApi(w);
    // The Fakturownia send runs AFTER_COMMIT (async) — poll briefly instead of
    // the BE's single immediate read so the oracle is deterministic.
    let newest: InvoiceRecordDtoOut | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await api.invoices();
      expect(r.ok, `GET /subscription/invoices (HTTP ${r.status})`).toBeTruthy();
      newest = r.json[0];
      if (newest?.status === expected) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    expect(newest, 'no invoice records returned for the company user').toBeTruthy();
    expect(newest?.status).toBe(expected);
  },
);
