import { AuthFlowsApi } from '../../_framework/api/auth-flows.api';
import type { ApiResult } from '../../_framework/api/http-client';
import {
  MagicLinkErrorsApi,
  type MagicLinkErrorBody,
} from '../../_framework/api/magic-link-errors.api';
import { TestSession, type PlaywrightRequestFactory } from '../../_framework/api/test-session';
import { After, Then, When, expect } from './fixtures';

import type { ApplyActionCodeRequest } from '../../../src/app/api/model/apply-action-code-request';
import type { ConfirmPasswordResetRequest } from '../../../src/app/api/model/confirm-password-reset-request';
import type { VerifyResetCodeRequest } from '../../../src/app/api/model/verify-reset-code-request';

/**
 * Magic-link error-handling oracle — Layer 2 (magic-link-errors.feature).
 *
 * Negative paths of the magic-link contract against the LIVE BE:
 *   - Tiers 1-2 (DTO validation, malformed JSON, garbage oobCode) run over an
 *     ANONYMOUS TestSession — the endpoints are public (password-reset flow),
 *     and the BE source stages no user for them either. Deliberately invalid
 *     bodies are posted VERBATIM via MagicLinkErrorsApi.postRaw; the VALID
 *     payload shapes are typed with the generated request models
 *     (ApplyActionCodeRequest / VerifyResetCodeRequest /
 *     ConfirmPasswordResetRequest via `satisfies`) so codegen drift on the
 *     oobCode / newPassword fields breaks this file at compile time.
 *   - Tiers 3-5 (single-use + cross-endpoint misuse) reuse the happy-path
 *     oracle's session seeding and extracted-oobCode send steps
 *     (magic-link.steps.ts); the only new mechanics are the e2e-profile
 *     /test hooks that mint an oobCode directly — no email round-trip, no
 *     Firebase link-generation rate limit (MagicLinkErrorsApi).
 *
 * Shares via the global step registry: `the response status should be {int}`
 * (partnership.steps), `the error message should contain {string}`
 * (login-errors.steps), `real {word} credentials are available` (login.steps),
 * and the magic-link session/state/send steps (magic-link.steps).
 */

/** The BE corpus's company Firebase UID (same constant as magic-link.steps.ts,
 *  which keeps it module-private; shared files are never edited by ports). */
const COMPANY_FIREBASE_UID = 'WWXA9DehxZghyLq849TpyE4vYzZ2';

interface MagicLinkErrorsWorld {
  /** Anonymous transport for the unauthenticated Tier 1-2 error contracts. */
  mlErrorsAnon?: TestSession;
  magicSession?: TestSession;
  magicEmail?: string;
  oobCode?: string;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

function record(
  w: { lastResponse?: MagicLinkErrorsWorld['lastResponse'] },
  r: ApiResult<unknown>,
): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

/** Lazily open (once per scenario) the anonymous session Tier 1-2 posts ride on. */
async function anonSession(
  playwright: PlaywrightRequestFactory,
  w: MagicLinkErrorsWorld,
): Promise<TestSession> {
  if (!w.mlErrorsAnon) w.mlErrorsAnon = await TestSession.openAnonymous(playwright);
  return w.mlErrorsAnon;
}

/** Parse the last response body as the BE error envelope (or fail loudly). */
function lastErrorBody(w: {
  lastResponse?: MagicLinkErrorsWorld['lastResponse'];
}): MagicLinkErrorBody {
  const raw = w.lastResponse?.body ?? '';
  try {
    return JSON.parse(raw) as MagicLinkErrorBody;
  } catch {
    throw new Error(`last response body is not parseable JSON: "${raw.slice(0, 200)}"`);
  }
}

After(async ({ world }) => {
  await (world as MagicLinkErrorsWorld).mlErrorsAnon?.dispose();
});

// ── Tier 1: raw / docstring posts (bodies go on the wire verbatim) ───────────

When(
  'I send a POST to {string} with body:',
  async ({ playwright, world }, endpoint: string, body: string) => {
    const w = world as MagicLinkErrorsWorld;
    const session = await anonSession(playwright, w);
    record(w, await new MagicLinkErrorsApi(session).postRaw(endpoint, body));
  },
);

When(
  'I send a POST to {string} with raw body {string}',
  async ({ playwright, world }, endpoint: string, rawBody: string) => {
    const w = world as MagicLinkErrorsWorld;
    const session = await anonSession(playwright, w);
    record(w, await new MagicLinkErrorsApi(session).postRaw(endpoint, rawBody));
  },
);

When(
  'I send confirm-password-reset with oobCode {string} and a password exceeding maximum length',
  async ({ playwright, world }, oobCode: string) => {
    const w = world as MagicLinkErrorsWorld;
    const session = await anonSession(playwright, w);
    // BE glue: 129 characters meeting complexity — one over the 128 maximum.
    const body = {
      oobCode,
      newPassword: 'Ab1' + 'x'.repeat(126),
    } satisfies ConfirmPasswordResetRequest;
    record(
      w,
      await new AuthFlowsApi(session.api).confirmPasswordReset(body.oobCode, body.newPassword),
    );
  },
);

// ── Tier 2: explicit-oobCode sends through the typed production endpoints ────

When(
  'I send apply-action-code with oobCode {string}',
  async ({ playwright, world }, oobCode: string) => {
    const w = world as MagicLinkErrorsWorld;
    const session = await anonSession(playwright, w);
    const body = { oobCode } satisfies ApplyActionCodeRequest;
    record(w, await new AuthFlowsApi(session.api).applyActionCode(body.oobCode));
  },
);

When(
  'I send verify-reset-code with oobCode {string}',
  async ({ playwright, world }, oobCode: string) => {
    const w = world as MagicLinkErrorsWorld;
    const session = await anonSession(playwright, w);
    const body = { oobCode } satisfies VerifyResetCodeRequest;
    record(w, await new AuthFlowsApi(session.api).verifyResetCode(body.oobCode));
  },
);

When(
  'I send confirm-password-reset with oobCode {string} and newPassword {string}',
  async ({ playwright, world }, oobCode: string, newPassword: string) => {
    const w = world as MagicLinkErrorsWorld;
    const session = await anonSession(playwright, w);
    const body = { oobCode, newPassword } satisfies ConfirmPasswordResetRequest;
    record(
      w,
      await new AuthFlowsApi(session.api).confirmPasswordReset(body.oobCode, body.newPassword),
    );
  },
);

// ── Tiers 3-5: direct oobCode minting via the e2e-profile /test hooks ────────

When('I generate a verification oobCode via test endpoint', async ({ world }) => {
  if (!world.magicSession || !world.magicEmail) {
    throw new Error('magic-link session not opened — the seeding Given is missing');
  }
  world.oobCode = await new MagicLinkErrorsApi(world.magicSession).generateVerificationOob(
    world.magicEmail,
    COMPANY_FIREBASE_UID,
  );
});

When('I generate a password reset oobCode via test endpoint', async ({ world }) => {
  if (!world.magicSession || !world.magicEmail) {
    throw new Error('magic-link session not opened — the seeding Given is missing');
  }
  world.oobCode = await new MagicLinkErrorsApi(world.magicSession).generatePasswordResetOob(
    world.magicEmail,
  );
});

// ── Error-envelope assertions (BE ErrorAssertionSteps.java parity) ───────────

Then(
  'the validation error for {string} should be {string}',
  async ({ world }, field: string, expected: string) => {
    const body = lastErrorBody(world);
    expect(
      body.validationErrors,
      `validationErrors map missing in: ${(world.lastResponse?.body ?? '').slice(0, 300)}`,
    ).toBeDefined();
    expect(body.validationErrors![field], `validation message for "${field}"`).toBe(expected);
  },
);

Then(
  'the validation error for {string} should contain {string}',
  async ({ world }, field: string, fragment: string) => {
    const body = lastErrorBody(world);
    expect(
      body.validationErrors,
      `validationErrors map missing in: ${(world.lastResponse?.body ?? '').slice(0, 300)}`,
    ).toBeDefined();
    // Case-insensitive: blank-password trips BOTH @NotBlank ("New password
    // is required") and @Size ("Password must be at least 8 characters"),
    // and which violation wins the map slot is nondeterministic per run —
    // "password" must match either casing.
    expect(
      (body.validationErrors![field] ?? '').toLowerCase(),
      `validation message for "${field}"`,
    ).toContain(fragment.toLowerCase());
  },
);

Then('the response messageKey should be {string}', async ({ world }, expected: string) => {
  expect(
    lastErrorBody(world).messageKey,
    `messageKey in: ${(world.lastResponse?.body ?? '').slice(0, 300)}`,
  ).toBe(expected);
});

Then('the response should have a request ID', async ({ world }) => {
  const body = lastErrorBody(world);
  expect(
    typeof body.requestId === 'string' && body.requestId.length > 0,
    `response should include a non-empty requestId, got: ${(world.lastResponse?.body ?? '').slice(0, 300)}`,
  ).toBe(true);
});
