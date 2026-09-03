import { ApiHttp, type ApiResult } from './http-client';

import type { SubscriptionStatusDtoOut } from '../../../src/app/core/api-frozen/hidden-models';
import type { InvoiceRecordDtoOut } from '../../../src/app/core/api-frozen/hidden-models';
import type { DowngradeRequestDtoIn } from '../../../src/app/core/api-frozen/hidden-models';
import type { SubscriptionStatus } from '../../../src/app/core/api-frozen/hidden-models';

/**
 * Layer 1 — Subscription domain service (plan / trial / downgrade / invoices).
 *
 * Typed methods over the OpenAPI-generated DTOs, one method per endpoint,
 * mirroring the BE controller split:
 *
 * - ALWAYS-ON (`SubscriptionController`): `status()` + `invoices()` work
 *   whether `app.payments.enabled` is true or false.
 * - BEAN-GATED (`SubscriptionPaidController`): trial / downgrade / config are
 *   only registered when `app.payments.enabled=true`. On the dev BE the toggle
 *   defaults to false, so these return 404 — `paymentsConfig()` doubles as the
 *   cheap probe the oracle steps use to self-skip (same trick as the
 *   integration tier's subscription-lifecycle.spec.ts).
 * - `/test/subscription/*` hooks (`TestSubscriptionController`, e2e|dev
 *   profiles): state staging that bypasses Stripe. Responses stay
 *   `Record<string, unknown>` because they are NOT part of the OpenAPI
 *   contract (same policy as the integration tier).
 *
 * CLEANUP CONTRACT: any oracle that stages a non-FREE_ACTIVE status MUST
 * restore FREE_ACTIVE (TestSession.restoreFreePlan) in its After hook — the
 * dev BE's PaymentsDisabledBootGuard refuses to boot while a subscription row
 * sits in an in-flight PAID status (hit live 2026-09-02).
 */

/** Stripe event types the /test/subscription/simulate-webhook hook accepts. */
export type SimulatedStripeEvent =
  | 'checkout.session.completed'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.subscription.deleted';

/** Body for /test/subscription/set-state (statuses ride the generated enum). */
export interface TestSetStateRequest {
  email: string;
  planName: string;
  status: SubscriptionStatus;
  /**
   * Seeds CompanySubscription.previousState directly — the accept-terms
   * restoration path reads it (BE commit a54c310b added this so a single user
   * can be staged into TERMS_PENDING without the global enterTermsPending()).
   */
  previousStatus?: SubscriptionStatus;
}

/** Body for /test/subscription/simulate-webhook. */
export interface TestSimulateWebhookRequest {
  email: string;
  eventType: SimulatedStripeEvent;
  /** checkout.session.completed only — plan to land on (defaults BUSINESS). */
  planName?: string;
  /** invoice.paid only — amount in cents (defaults 2900). */
  amountPaidCents?: number;
}

export class SubscriptionApi {
  constructor(private readonly http: ApiHttp) {}

  // ── Production, always-on (SubscriptionController) ─────────────────────────

  /** GET /subscription/status — lazy-creates FREE_ACTIVE for first-touch users. */
  status(): Promise<ApiResult<SubscriptionStatusDtoOut>> {
    return this.http.get<SubscriptionStatusDtoOut>('/subscription/status');
  }

  /** GET /subscription/invoices — the user's invoice records, newest-first. */
  invoices(): Promise<ApiResult<InvoiceRecordDtoOut[]>> {
    return this.http.get<InvoiceRecordDtoOut[]>('/subscription/invoices');
  }

  // ── Production, bean-gated on app.payments.enabled (SubscriptionPaidController) ──

  /** GET /subscription/config — 404 here means payments are OFF (probe). */
  paymentsConfig(): Promise<ApiResult<Record<string, string>>> {
    return this.http.get<Record<string, string>>('/subscription/config');
  }

  /** POST /subscription/trial/activate — FREE → TRIAL_ENTERPRISE, one-shot per user. */
  activateTrial(): Promise<ApiResult<void>> {
    return this.http.post<void>('/subscription/trial/activate');
  }

  /** POST /subscription/downgrade — schedules the downgrade at billingPeriodEnd. */
  requestDowngrade(dto: DowngradeRequestDtoIn): Promise<ApiResult<void>> {
    return this.http.post<void>('/subscription/downgrade', dto);
  }

  /** POST /subscription/downgrade/cancel — undoes a pending downgrade. */
  cancelDowngrade(): Promise<ApiResult<void>> {
    return this.http.post<void>('/subscription/downgrade/cancel');
  }

  // ── /test/subscription hooks (TestSubscriptionController, e2e|dev only) ────

  /** Delete the user's subscription + events + invoices + billing periods. */
  testReset(email: string): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post<Record<string, unknown>>('/test/subscription/reset', { email });
  }

  /** Force a subscription state (creates the row if missing) + fresh billing period. */
  testSetState(req: TestSetStateRequest): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post<Record<string, unknown>>('/test/subscription/set-state', req);
  }

  /** Dispatch a synthetic Stripe event (seeds e2e_cus_/e2e_sub_ linkage if missing). */
  testSimulateWebhook(
    req: TestSimulateWebhookRequest,
  ): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post<Record<string, unknown>>('/test/subscription/simulate-webhook', req);
  }

  /**
   * Limit-aware campaign insert for the AUTHENTICATED user (atomic
   * INSERT…SELECT under the caller's plan limit): 200 under the limit,
   * 409 error=CAMPAIGN_LIMIT when blocked. Must run on the COMPANY session.
   */
  testCreateCampaign(campaignName: string): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post<Record<string, unknown>>('/test/subscription/create-campaign', {
      campaignName,
    });
  }

  /** Accept terms for the user — restores previousState from TERMS_PENDING. */
  testAcceptTerms(email: string): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post<Record<string, unknown>>('/test/subscription/accept-terms', { email });
  }
}
