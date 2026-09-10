/**
 * Shared test helpers consolidated from across the integration specs.
 *
 * Before this file: ~7 specs each defined a local `getMyId` / `getMyUserId`
 * / `seedTargetAndGetId` helper with the same shape but subtle naming
 * differences. The duplication made it harder to keep the typed
 * UserDtoOut access pattern consistent.
 *
 * Now: one canonical implementation, each spec imports.
 *
 * Naming convention:
 *   - `getMyId` — GET /users/me → typed UserDtoOut → return numeric id
 *   - `readAccountStatus` — GET /users/{id} → UserDtoOut.accountStatus?.value
 *   - `seedTargetInNewContext` — open a fresh BrowserContext + mock-session
 *     + resolve the target's numeric id, returns the trio
 *
 * Specs that want the local `api()` wrapper they already have (typically
 * because they pass extra headers or fail-on-status-code policy) can call
 * these helpers directly via `page.request` — the helpers use
 * page.request internally so the BrowserContext-bound cookie jar is
 * preserved.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { UserDtoOut } from '../../src/app/api/model/user-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from './_actor';

type ActorRole = 'COMPANY' | 'INFLUENCER' | 'ADMIN';

export async function getMyId(page: Page): Promise<number> {
  const res = await page.request.get(`${GREENFIELD_URL}/api/users/me`, {
    ignoreHTTPSErrors: true,
  });
  const body = (await res.json()) as UserDtoOut;
  const id = body.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) {
    throw new Error(`/users/me did not return numeric id: ${JSON.stringify(body)}`);
  }
  return id;
}

export async function readAccountStatus(page: Page, userId: number): Promise<string> {
  const res = await page.request.get(`${GREENFIELD_URL}/api/users/${userId}`, {
    ignoreHTTPSErrors: true,
  });
  const body = (await res.json()) as UserDtoOut;
  return body.accountStatus?.value ?? '';
}

export interface SeededTarget {
  readonly userId: number;
  readonly context: BrowserContext;
  readonly page: Page;
}

export async function seedTargetInNewContext(
  browser: Browser,
  email: string,
  role: ActorRole,
): Promise<SeededTarget> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await seedSession(page, email, role);
  const userId = await getMyId(page);
  return { userId, context, page };
}

/**
 * Provision an Instagram social connection for a mock-session INFLUENCER.
 *
 * The production `POST /applied-opportunity` path requires the INFLUENCER
 * to have an active social connection (SocialConnectionGuard). Mock-session
 * INFLUENCERs don't have one by default, so partnership-application + email-
 * notification integration tests self-skip with `INFLUENCER apply requires
 * real Instagram OAuth (social connections)`.
 *
 * The BE test endpoint `POST /test/auth/seed-instagram-connection` short-
 * circuits that blocker with a deterministic CONNECTED row. Call this AFTER
 * `seedSession` for any INFLUENCER context that needs to actually apply.
 */
/**
 * Force a user's accountStatus to ACTIVE (DB + cache), by email.
 *
 * A mock-session user is created IN_VALIDATION, and three things gate POST /applied-opportunity:
 * a social connection, an ACTIVE account, and the INFLUENCER role
 * (AppliedOpportunityService.saveAsDto). Seeding Instagram alone therefore still 403s with
 * "AppliedOpportunity (missing requirements)" -- which names none of the three, so the log line
 * that says which one is missing is the only way to tell them apart.
 */
export async function activateAccount(page: Page, email: string): Promise<void> {
  const res = await page.request.post(`${BE_URL}/api/test/auth/set-account-status`, {
    data: { email, status: 'ACTIVE' },
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
  if (!res.ok()) {
    throw new Error(`set-account-status ACTIVE failed: ${res.status()} ${await res.text()}`);
  }
}

export async function seedInstagramConnection(page: Page, email: string): Promise<void> {
  const res = await page.request.post(`${BE_URL}/api/test/auth/seed-instagram-connection`, {
    data: { email },
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
  if (!res.ok()) {
    throw new Error(`seed-instagram-connection failed: ${res.status()} ${await res.text()}`);
  }
}

export interface TrackedUpload {
  readonly uploadId: string;
  readonly publicUrl: string;
  readonly filePath: string;
}

// 1×1 PNG — enough for the storage round-trip; the BE validates size/type,
// not pixel content.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The by-the-book upload pipeline against the live BE, exactly what the FE
 * UploadService does: POST /upload/signed-url → PUT the raw bytes to the
 * ABSOLUTE storage.googleapis.com URL → POST /upload/confirm. The returned
 * `uploadId` is what profile PATCHes send (uploadId-only contract, pentest
 * 3.1); `publicUrl` is the canonical URL the BE stores and returns.
 *
 * Returns null when the upload controller is absent
 * (@ConditionalOnBean(SignedUrlService.class) — no Firebase Storage config
 * in this profile) so callers can self-skip. Any other stage failure throws
 * with the failing stage in the message.
 */
export async function uploadTrackedPhoto(
  page: Page,
  uploadType: 'PROFILE_PHOTO' | 'CONTENT' = 'PROFILE_PHOTO',
): Promise<TrackedUpload | null> {
  const su = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
    data: {
      filename: `e2e-tracked-${Date.now()}.png`,
      contentType: 'image/png',
      fileSize: PNG_1PX.length,
      uploadType,
    },
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
  if (su.status() === 404) return null;
  if (!su.ok()) {
    throw new Error(`signed-url failed: ${su.status()} ${await su.text()}`);
  }
  const body = (await su.json()) as {
    uploadUrl?: string;
    publicUrl?: string;
    uploadId?: string;
    filePath?: string;
  };
  if (!body.uploadUrl || !body.publicUrl || !body.uploadId || !body.filePath) {
    throw new Error(`signed-url response missing fields: ${JSON.stringify(body)}`);
  }
  const put = await page.request.put(body.uploadUrl, {
    headers: { 'Content-Type': 'image/png' },
    data: PNG_1PX,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
  if (!put.ok()) {
    throw new Error(`storage PUT failed: ${put.status()} ${await put.text()}`);
  }
  const conf = await page.request.post(
    `${GREENFIELD_URL}/api/upload/confirm/${encodeURIComponent(body.uploadId)}?filePath=${encodeURIComponent(body.filePath)}`,
    { ignoreHTTPSErrors: true, failOnStatusCode: false },
  );
  if (!conf.ok()) {
    throw new Error(`confirm failed: ${conf.status()} ${await conf.text()}`);
  }
  return { uploadId: body.uploadId, publicUrl: body.publicUrl, filePath: body.filePath };
}
