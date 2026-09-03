import { REAL_COMPANY_FIREBASE_UID } from '../../_framework/actor';
import { AuthFlowsApi } from '../../_framework/api/auth-flows.api';
import { TestSession } from '../../_framework/api/test-session';
import { clearInbox, waitForEmail } from '../../_framework/test-email';
import { After, Given, Then, When, expect } from './fixtures';

/**
 * Magic-link happy-path oracle — Layer 2 (magic-link-happy-path.feature).
 *
 * Drives the REAL email round-trip against the live BE: the BE sends through
 * its SMTP (captured by GreenMail), the oobCode is extracted from the actual
 * message body (the BE glue's regex), and the production Firebase-proxy
 * endpoints consume it. Firebase state is staged/restored via AuthFlowsApi's
 * /test hooks. The session is a mock-session bound to the REAL company
 * account's email — the magic-link machinery operates on the Firebase account
 * itself, so a real password login is not required to exercise it.
 *
 * The BE feature hardcodes the company UID; we take the email/password from
 * e2e-tests/.env (same account) and the UID from the BE corpus constant.
 */

/** Single source: _framework/actor.ts (also pins the mock-session seed). */
const COMPANY_FIREBASE_UID = REAL_COMPANY_FIREBASE_UID;

/** The BE glue's oobCode extractor (MagicLinkSteps.java) — plain and HTML-escaped separators. */
const OOB_CODE_RE = /(?:[?&]|&amp;)oobCode=([A-Za-z0-9_-]+)/;

/**
 * The /test/email endpoint returns the RAW MIME body, which is
 * quoted-printable encoded: `=` appears as `=3D` and long lines carry `=\r\n`
 * soft breaks that can split the oobCode mid-token. (The BE glue never sees
 * this — GreenMailUtil.getBody decodes QP before its regex runs.) Decode soft
 * breaks first, then the =XX escapes.
 */
function decodeQuotedPrintable(raw: string): string {
  return raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

interface MagicLinkWorld {
  magicSession?: TestSession;
  magicEmail?: string;
  lastEmailBody?: string;
  oobCode?: string;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

function flows(world: MagicLinkWorld): AuthFlowsApi {
  if (!world.magicSession) throw new Error('magic-link session not opened — Background missing?');
  return new AuthFlowsApi(world.magicSession.api);
}

/**
 * The GreenMail steps below are shared with the influencer-verification oracle
 * (a different Background opens a different session) — resolve whichever
 * authenticated session the running scenario opened.
 */
function emailSession(world: MagicLinkWorld & { influencerSession?: TestSession }): TestSession {
  const s = world.magicSession ?? world.influencerSession;
  if (!s) throw new Error('no session for GreenMail access — Background missing?');
  return s;
}

function record(
  world: MagicLinkWorld,
  r: { status: number; headers: Record<string, string>; body: string },
): void {
  world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

/**
 * Email-trigger endpoints are strictly rate-limited per user; a prior run's
 * sends can leave the window hot. Mirror the BE glue's postWithRateLimitRetry:
 * up to 3 attempts, 15s apart, on 429 only.
 */
export async function withRateLimitRetry(
  send: () => Promise<{ ok: boolean; status: number; body: string }>,
  label: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await send();
    if (r.ok) return;
    if (r.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      continue;
    }
    throw new Error(
      `${label} failed: HTTP ${r.status} (attempt ${attempt}/3): ${r.body.slice(0, 200)}`,
    );
  }
}

Given(
  'the real company user is signed in for magic-link testing',
  async ({ playwright, world }) => {
    const email = process.env['FIREBASE_TEST_COMPANY_EMAIL']!;
    world.magicEmail = email;
    // mock-session on the REAL account email: the BE binds the session to the
    // user row whose Firebase account the magic links act on.
    world.magicSession = await TestSession.open(playwright, {
      id: 'company-real',
      email,
      role: 'COMPANY',
      // Fresh-DB safety: pin the row to the REAL uid so the uid-keyed
      // /test hooks (set-email-verified, cooldown) and real oobCode flows
      // resolve the same user the Firebase account belongs to.
      firebaseUid: COMPANY_FIREBASE_UID,
    });
  },
);

After(async ({ world }) => {
  await world.magicSession?.dispose();
});

Given('the Firebase user has emailVerified set to {word}', async ({ world }, value: string) => {
  await flows(world).setEmailVerified(COMPANY_FIREBASE_UID, value === 'true');
});

Given('the password reset cooldown is cleared', async ({ world }) => {
  await flows(world).clearPasswordResetCooldown(COMPANY_FIREBASE_UID);
});

Given('the GreenMail inbox is cleared', async ({ world }) => {
  await clearInbox(emailSession(world).raw);
});

// ── Email triggering ─────────────────────────────────────────────────────────

When('the user requests a verification email', async ({ world }) => {
  await withRateLimitRetry(
    () => flows(world).requestVerificationEmail(),
    'send-verification-email',
  );
});

When('the user requests a password reset email', async ({ world }) => {
  await withRateLimitRetry(() => flows(world).forgotPassword(world.magicEmail!), 'forgot-password');
});

// ── GreenMail interception ───────────────────────────────────────────────────

Then('a magic-link email arrives within 10 seconds', async ({ world }) => {
  const email = await waitForEmail(emailSession(world).raw, {
    ...(world.magicEmail ? { to: world.magicEmail } : {}),
    timeoutMs: 10_000,
  });
  world.lastEmailBody = email.body ?? '';
  expect(world.lastEmailBody.length, 'captured email must have a body').toBeGreaterThan(0);
});

Then('the oobCode is extracted from the email', async ({ world }) => {
  const decoded = decodeQuotedPrintable(world.lastEmailBody ?? '');
  const match = OOB_CODE_RE.exec(decoded);
  expect(match, 'email body must carry an oobCode link').not.toBeNull();
  world.oobCode = match![1];
});

// ── Consuming the code via the production endpoints ──────────────────────────

When('the extracted oobCode is applied via apply-action-code', async ({ world }) => {
  record(world, await flows(world).applyActionCode(world.oobCode!));
});

When('the extracted oobCode is checked via verify-reset-code', async ({ world }) => {
  record(world, await flows(world).verifyResetCode(world.oobCode!));
});

When(
  'the password is reset via confirm-password-reset to {string}',
  async ({ world }, newPassword: string) => {
    record(world, await flows(world).confirmPasswordReset(world.oobCode!, newPassword));
  },
);

Then('the user can log in with password {string}', async ({ world }, password: string) => {
  const r = await flows(world).login(world.magicEmail!, password);
  expect(r.status, `login with the new password (body: ${r.body.slice(0, 200)})`).toBe(200);
});

Then('the original password is restored', async ({ world }) => {
  await flows(world).setPassword(
    COMPANY_FIREBASE_UID,
    process.env['FIREBASE_TEST_COMPANY_PASSWORD']!,
  );
  // Prove the restore round-trips — the .env credentials must keep working
  // for every other real-credential oracle.
  const r = await flows(world).login(
    world.magicEmail!,
    process.env['FIREBASE_TEST_COMPANY_PASSWORD']!,
  );
  expect(r.status, 'login with the RESTORED password must succeed').toBe(200);
});
