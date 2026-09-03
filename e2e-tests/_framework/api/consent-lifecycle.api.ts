import type { APIRequestContext } from '@playwright/test';
import type { AccountStatus } from '../../../src/app/api/model/account-status';
import type { LegalDocumentType } from '../../../src/app/api/model/legal-document-type';
import type { UserType } from '../../../src/app/api/model/user-type';
import { type ApiHttp, type ApiResult } from './http-client';

/**
 * Layer 1 — consent-LIFECYCLE domain service (oracle tier).
 *
 * Complements `ConsentApi` (banner / prepare / register / record-batch /
 * status / admin queries) with the lifecycle mechanics the BE exposes for its
 * own Cucumber glue: the `/test/legal` hooks of `TestLegalController`
 * (checkitout-backend, profile `e2e & !prod & !test`) that manipulate legal-document
 * `published_at` dates, trigger the enforcement cron body synchronously
 * (bypassing schedule + ShedLock), reset per-user consents, read a user's
 * consent/account state without a session, and restore enforcement-blocked
 * users — plus the two `/test/auth` staging hooks the lifecycle scenarios seed
 * users with. Endpoint shapes live HERE so the steps stay thin orchestration;
 * request/response fields ride the generated enums (`AccountStatus`,
 * `LegalDocumentType`, `UserType`) so BE contract drift breaks compilation.
 */

/** GET /test/legal/user-consent-status — TestLegalController's session-free projection. */
export interface TestUserConsentStatus {
  email?: string;
  /** `User.accountStatus.name()` — always a member of the generated enum. */
  accountStatus?: AccountStatus;
  newestConsentsAccepted?: boolean;
  userId?: number;
}

export class ConsentLifecycleApi {
  constructor(private readonly http: ApiHttp) {}

  // ── /test/auth staging (same hooks the consent-module oracle seeds with) ──

  /** Idempotent user upsert: returns the existing row or creates an ACTIVE one. */
  ensureUser(email: string, role: UserType): Promise<ApiResult<{ userId?: number }>> {
    return this.http.post('/test/auth/ensure-user', { email, role });
  }

  /** Force accountStatus in DB + cache (the ConsentEnforcementFilter reads these). */
  setAccountStatus(email: string, status: AccountStatus): Promise<ApiResult<unknown>> {
    return this.http.post('/test/auth/set-account-status', { email, status });
  }

  // ── /test/legal document + enforcement hooks (TestLegalController) ────────

  /**
   * Rewrite `published_at` on ALL legal documents (Liquibase seeds them with
   * CURRENT_TIMESTAMP, so grace-period scenarios must move the clock).
   * `publishedAt` must be ISO_LOCAL_DATE_TIME — no timezone suffix.
   */
  setAllPublishedAt(publishedAt: string): Promise<ApiResult<{ documentsUpdated?: number }>> {
    return this.http.post('/test/legal/set-published-at', { publishedAt });
  }

  /** Upsert one document version with a controlled publishedAt (per language). */
  publishDocumentVersion(
    type: LegalDocumentType,
    language: string,
    version: number,
    publishedAt: string,
  ): Promise<ApiResult<{ documentId?: number; version?: number }>> {
    return this.http.post('/test/legal/publish-document-version', {
      type,
      language,
      version,
      publishedAt,
    });
  }

  /** Run `LegalConsentService.blockExpiredUsers()` NOW (no cron, no ShedLock). */
  triggerEnforcement(): Promise<ApiResult<{ success?: boolean }>> {
    return this.http.post('/test/legal/trigger-enforcement', {});
  }

  /** Clear newestConsentsAccepted + delete the user's consent records (evicts cache). */
  resetConsents(email: string): Promise<ApiResult<{ usersAffected?: number }>> {
    return this.http.post('/test/legal/reset-consents', { email });
  }

  /** Session-free read of a user's accountStatus + consent flag, by email. */
  userConsentStatus(email: string): Promise<ApiResult<TestUserConsentStatus>> {
    return this.http.get('/test/legal/user-consent-status', { email });
  }

  /**
   * Restore every BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS user to ACTIVE (bumps
   * token versions). Enforcement is GLOBAL: one triggered run blocks every
   * user without current consents in the persistent dev DB, which poisons
   * later suites — lifecycle scenarios MUST call this in their After hook
   * (mirrors the BE RunConsentIT hygiene).
   */
  restoreEnforcementBlocked(): Promise<ApiResult<{ restored?: number }>> {
    return this.http.post('/test/legal/restore-enforcement-blocked', {});
  }
}

/**
 * DELETE /test/legal/delete-documents-above-version — restores the v2-latest
 * document baseline the consent-module oracle assumes (its `prepare` steps
 * hardcode version 2; the full-lifecycle scenario publishes v3). Standalone
 * because `ApiHttp` deliberately exposes no DELETE verb; this rides the raw
 * authenticated `APIRequestContext` (`TestSession.raw`) instead — same interop
 * escape hatch the test-email helpers use.
 */
export async function deleteDocumentsAboveVersion(
  raw: APIRequestContext,
  maxVersion: number,
): Promise<{ status: number; ok: boolean }> {
  const res = await raw.delete('/api/test/legal/delete-documents-above-version', {
    params: { maxVersion },
  });
  return { status: res.status(), ok: res.ok() };
}
