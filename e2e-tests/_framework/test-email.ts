import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

/**
 * Helper for FE-integration tests that drive email-gated flows.
 *
 * BE side: `TestEmailController` (com.sm.instagram.platform.dev.TestEmailController)
 * wraps the GreenMail in-memory SMTP bean under `@Profile({"e2e", "dev"})`
 * and exposes a tiny REST surface so tests in another process can read
 * captured emails. The dev BE points `spring.mail.*` at GreenMail
 * (localhost:3025), so any production code path that calls `JavaMailSender`
 * lands here for tests to inspect.
 *
 * Lifecycle: scenarios that need a clean inbox should call `clearInbox`
 * in `beforeEach` so a stray email from a prior scenario can't surface as
 * a false-positive code match in this one.
 *
 * Endpoints (on the BACKEND -- see the origin note below):
 *   - GET    /api/test/email[?to=foo]        -> CapturedEmail[]
 *   - GET    /api/test/email/latest[?to=foo] -> CapturedEmail | 404
 *   - DELETE /api/test/email                 -> { purgedCount }
 *
 * ORIGIN IS REQUIRED, and it must be the origin the caller's session was
 * minted on. It used to default to the frontend, and that default cost two
 * nightly scenarios and several sessions of guesswork, so the type system now
 * asks instead of guessing.
 *
 * The backend binds every session to a fingerprint of client IP + User-Agent
 * (`SessionSecurityService.generateSessionFingerprint`). The greenfield
 * dev-server proxies `/api` to the same backend, so both origins reach the
 * same endpoint -- but through the proxy the backend sees the PROXY's address,
 * not the caller's. Mixing them inside one session is therefore read as a
 * hijack: `fingerprint_mismatch`, and the backend answers with the session
 * cookies CLEARED. Cookies are host-scoped and ignore the port, so the session
 * cookie is sent to the frontend origin too -- nothing warns you.
 *
 * The symptom is a scenario that authenticates, clears its inbox, and is
 * anonymous on the very next call ("User not authenticated"). All eleven
 * fingerprint mismatches in nightly run 34534847000 were `DELETE
 * /api/test/email` taking that hop from a `TestSession` minted on `BE_URL`.
 *
 * So: sessions from `TestSession` / `_actor.BE_URL` pass `BE_URL`; sessions
 * seeded through the page at the frontend (`seedSession`, `realLogin`) pass
 * `GREENFIELD_URL`.
 */

export interface CapturedEmail {
  readonly subject: string;
  readonly from: ReadonlyArray<string>;
  readonly to: ReadonlyArray<string>;
  readonly body: string;
  readonly receivedAt: string;
  readonly receivedAtMillis: number;
}

type RequestLike = APIRequestContext | { request: APIRequestContext };

function asRequest(source: RequestLike | Page | BrowserContext): APIRequestContext {
  if ('request' in source) {
    return source.request as APIRequestContext;
  }
  return source as APIRequestContext;
}

/**
 * Synchronously flush the BE's pending-notification-emails queue.
 *
 * The notification subsystem dispatches emails via a 15-minute cron
 * (`EmailCronJob.processEmailQueue`). Tests can't wait that long;
 * this endpoint invokes the same code path inline. After it returns,
 * any pending notifications have been pushed to GreenMail and can be
 * read by `latestEmail` / `waitForEmail`.
 *
 * Idempotent — the cron's per-notification dedup (email_sent=true)
 * still applies.
 */
export async function flushPendingEmails(
  source: RequestLike | Page | BrowserContext,
  origin: string,
): Promise<void> {
  const req = asRequest(source);
  const res = await req.post(`${origin}/api/test/email/flush`, { ignoreHTTPSErrors: true });
  if (!res.ok()) {
    throw new Error(`flushPendingEmails failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Clear the GreenMail inbox. Returns the count of messages purged so
 * tests can assert "we were starting from clean" when paranoid.
 */
export async function clearInbox(
  source: RequestLike | Page | BrowserContext,
  origin: string,
): Promise<number> {
  const req = asRequest(source);
  const res = await req.delete(`${origin}/api/test/email`, { ignoreHTTPSErrors: true });
  if (!res.ok()) {
    throw new Error(`clearInbox failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { purgedCount?: number };
  return body.purgedCount ?? 0;
}

export interface ListInboxOptions {
  readonly to?: string;
  /** REQUIRED - see the ORIGIN note at the top of this file. */
  readonly origin: string;
}

/**
 * List every email currently in the GreenMail inbox, newest first.
 * Optionally filter by recipient via {@code to}.
 */
export async function listInbox(
  source: RequestLike | Page | BrowserContext,
  options: ListInboxOptions,
): Promise<CapturedEmail[]> {
  const origin = options.origin;
  const req = asRequest(source);
  const url = options.to
    ? `${origin}/api/test/email?to=${encodeURIComponent(options.to)}`
    : `${origin}/api/test/email`;
  const res = await req.get(url, { ignoreHTTPSErrors: true });
  if (!res.ok()) {
    throw new Error(`listInbox failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as CapturedEmail[];
}

export interface WaitForEmailOptions {
  readonly to?: string;
  readonly subject?: string | RegExp;
  readonly bodyMatches?: RegExp;
  /** REQUIRED - see the ORIGIN note at the top of this file. */
  readonly origin: string;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}

/**
 * Poll the inbox until an email matches the predicate, or throw on timeout.
 * Typical use: trigger an action that emits an email, then await this and
 * assert on the returned `body`.
 *
 * Matching:
 *   - `to`           — substring against any TO header
 *   - `subject`      — string-equals OR regex match
 *   - `bodyMatches`  — regex against body
 *
 * Any combination of predicates AND together. Returns the first match.
 */
export async function waitForEmail(
  source: RequestLike | Page | BrowserContext,
  predicate: WaitForEmailOptions,
): Promise<CapturedEmail> {
  const origin = predicate.origin;
  const timeoutMs = predicate.timeoutMs ?? 10_000;
  const pollMs = predicate.pollMs ?? 250;

  const subjectMatcher = makeStringMatcher(predicate.subject);
  const bodyMatcher = makeRegexMatcher(predicate.bodyMatches);
  const toFilter = predicate.to?.toLowerCase();

  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const inbox = await listInbox(source, { to: predicate.to, origin });
      const hit = inbox.find((email) => {
        if (toFilter && !email.to.some((t) => t.toLowerCase().includes(toFilter))) return false;
        if (!subjectMatcher(email.subject)) return false;
        if (!bodyMatcher(email.body)) return false;
        return true;
      });
      if (hit) return hit;
    } catch (err) {
      lastError = err as Error;
    }
    await sleep(pollMs);
  }

  const desc = describePredicate(predicate);
  const cause = lastError ? ` (last error: ${lastError.message})` : '';
  throw new Error(`waitForEmail timed out after ${timeoutMs}ms — no match for ${desc}${cause}`);
}

/**
 * Extract a 6-digit code from an email body.
 *
 * The BE's step-up email-code + password-reset code emails embed the
 * code as a 6-digit number; this helper centralizes that extraction so
 * tests don't repeat the regex.
 *
 * Subtlety: the HTML email template embeds CSS hex colors like `#333333`
 * which the naive `\b\d{6}\b` regex also matches (the `#` is non-word so
 * `\b` fires). The regex below excludes any 6-digit run preceded by `#`
 * (CSS color) OR by another digit (sub-run of a longer number like a
 * timestamp). Returns the first remaining match — which is the code.
 *
 * Throws when no match — defensive: tests asserting "the BE sent a code"
 * should fail loudly if the body doesn't carry one.
 */
export function extractSixDigitCode(body: string): string {
  const match = body.match(/(?<![#\d])\b\d{6}\b(?!\d)/);
  if (!match) {
    throw new Error(
      `extractSixDigitCode: no 6-digit code in body. First 200 chars: ${body.slice(0, 200)}`,
    );
  }
  return match[0];
}

function makeStringMatcher(spec: string | RegExp | undefined): (value: string) => boolean {
  if (spec === undefined) return () => true;
  if (spec instanceof RegExp) return (v) => spec.test(v);
  return (v) => v === spec;
}

function makeRegexMatcher(spec: RegExp | undefined): (value: string) => boolean {
  if (spec === undefined) return () => true;
  return (v) => spec.test(v);
}

function describePredicate(predicate: WaitForEmailOptions): string {
  const parts: string[] = [];
  if (predicate.to) parts.push(`to~"${predicate.to}"`);
  if (predicate.subject !== undefined) parts.push(`subject=${predicate.subject}`);
  if (predicate.bodyMatches) parts.push(`body~${predicate.bodyMatches}`);
  return parts.length ? parts.join(' ∧ ') : '<any email>';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
