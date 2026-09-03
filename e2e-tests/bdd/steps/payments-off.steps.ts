import type { ApiResult } from '../../_framework/api/http-client';
import { PaymentsConfigApi } from '../../_framework/api/payments-config.api';
import { TestSession } from '../../_framework/api/test-session';
import { After, Given, Then, When, expect, test } from './fixtures';

import type { PublicConfigDto } from '../../../src/app/api/model/public-config-dto';

/**
 * Payments-OFF oracle — Layer 2 (functional), for the BE corpus
 * payments_off/payments-off.feature, driven THROUGH the Layer-1
 * PaymentsConfigApi against the LIVE BE, mirroring the BE glue
 * (PaymentsDisabledSteps.java: bare unauthenticated RestTemplate).
 *
 * One ANONYMOUS TestSession per scenario (no auth, no actor, no cookies) —
 * the whole feature asserts what unauthenticated clients can(not) reach:
 * the public-config toggle advertisement, the Spring-Security 401 wall in
 * front of the paid subscription endpoints, and the bean-gated 404 of the
 * Stripe webhook.
 *
 * The BE suite pins app.payments.enabled=false at boot; on the live shared
 * BE the toggle is an environment fact, so the toggle-dependent scenarios
 * carry the "payments are disabled on this BE" probe Given (typed on the
 * generated PublicConfigDto) and self-skip when payments are ON.
 *
 * Raw JSON body strings ride PaymentsConfigApi.postRaw as Buffers so they
 * hit the wire byte-for-byte (Playwright JSON-re-serializes string data
 * under a json content type).
 *
 * State lives on a local World view (cast pattern — fixtures.ts untouched)
 * under po*-prefixed keys so the other oracles' After hooks ignore it.
 */

interface PaymentsOffWorld {
  /** Anonymous transport (opened lazily, once per scenario). */
  poAnon?: TestSession;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

type PW = Parameters<typeof TestSession.openAnonymous>[0];

// ── Helpers ──────────────────────────────────────────────────────────────────

function record(w: PaymentsOffWorld, r: ApiResult): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function snippet(w: PaymentsOffWorld): string {
  return (w.lastResponse?.body ?? '(none)').slice(0, 300);
}

/** Lazily open the anonymous context and bind the L1 service to it. */
async function anonApi(playwright: PW, w: PaymentsOffWorld): Promise<PaymentsConfigApi> {
  w.poAnon ??= await TestSession.openAnonymous(playwright);
  return new PaymentsConfigApi(w.poAnon);
}

After(async ({ world }) => {
  const w = world as PaymentsOffWorld;
  await w.poAnon?.dispose().catch(() => undefined);
  w.poAnon = undefined;
});

// ── Toggle probe (added vs the BE source — see the feature header) ───────────

Given('payments are disabled on this BE', async ({ playwright, world }) => {
  const w = world as PaymentsOffWorld;
  const api = await anonApi(playwright, w);
  const r = await api.publicConfig();
  expect(r.ok, `GET /public-config failed: HTTP ${r.status} ${r.body.slice(0, 200)}`).toBeTruthy();
  // Typed on the generated dto — a renamed/removed toggle field breaks here
  // at compile time. Skip ONLY on an explicit true: a missing field is
  // contract drift and must fail loudly in the scenario body, not skip.
  const cfg: PublicConfigDto = r.json;
  test.skip(
    cfg.paymentsEnabled === true,
    'app.payments.enabled=true on this BE — the payments-OFF contract does not apply ' +
      '(run against the dev default or a payments-off deployment)',
  );
});

// ── Anonymous HTTP requests (BE step texts kept verbatim) ────────────────────

When('anonymous client GETs {string}', async ({ playwright, world }, path: string) => {
  const w = world as PaymentsOffWorld;
  const api = await anonApi(playwright, w);
  record(w, await api.getAnonymous(path));
});

When(
  'anonymous client POSTs {string} with body {string}',
  async ({ playwright, world }, path: string, rawBody: string) => {
    const w = world as PaymentsOffWorld;
    const api = await anonApi(playwright, w);
    record(w, await api.postRaw(path, rawBody));
  },
);

When(
  'anonymous client POSTs {string} with header {string} {string} and body {string}',
  async (
    { playwright, world },
    path: string,
    headerName: string,
    headerValue: string,
    rawBody: string,
  ) => {
    const w = world as PaymentsOffWorld;
    const api = await anonApi(playwright, w);
    record(w, await api.postRaw(path, rawBody, { [headerName]: headerValue }));
  },
);

// ── Assertions ───────────────────────────────────────────────────────────────

Then('the anonymous response status should be {int}', async ({ world }, expected: number) => {
  const w = world as PaymentsOffWorld;
  expect(w.lastResponse?.status, `expected ${expected}; response body: ${snippet(w)}`).toBe(
    expected,
  );
});

Then(
  'the anonymous response body should contain {string} with value {string}',
  async ({ world }, key: string, value: string) => {
    const w = world as PaymentsOffWorld;
    // The BE glue substring-matches '"key":value' on the raw body; parsing the
    // JSON and comparing the stringified field is the same assertion without
    // the whitespace fragility. The only key the corpus asserts here is
    // paymentsEnabled, whose TYPE contract rides the generated PublicConfigDto
    // in the probe Given above.
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(w.lastResponse?.body ?? '{}') as Record<string, unknown>;
    } catch {
      // leave {} — the property assertion below will fail with the body snippet
    }
    expect(parsed, `body should carry "${key}"; body: ${snippet(w)}`).toHaveProperty(key);
    expect(String(parsed[key]), `"${key}" value`).toBe(value);
  },
);

Then(
  'the anonymous response Cache-Control header should contain {string}',
  async ({ world }, value: string) => {
    const w = world as PaymentsOffWorld;
    const cacheControl = w.lastResponse?.headers['cache-control'] ?? '';
    expect(
      cacheControl.toLowerCase(),
      `Cache-Control should contain "${value}" — got "${cacheControl}"`,
    ).toContain(value.toLowerCase());
  },
);
