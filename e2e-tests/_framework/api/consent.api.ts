import { ApiHttp, type ApiResult } from './http-client';

/** The click-proof envelope the consent endpoints require (mirrors the BE glue). */
function proof(checkboxId: string): Record<string, unknown> {
  return {
    timestamp: Date.now(),
    eventTrusted: true,
    screenX: 100.0,
    screenY: 200.0,
    checkboxId,
  };
}

/**
 * Layer 1 — legal-consent domain service (oracle tier).
 *
 * The GDPR consent surface: public legal documents, the anonymous
 * cookie-banner record, pre-registration consent preparation (HMAC cookies),
 * the authenticated re-consent batch, consent status, and the admin
 * consent-record queries. Cookie accumulation rides the transport's jar —
 * call banner+prepare+register on ONE TestSession context and the consent
 * cookies flow into registration exactly like a browser.
 */
export class ConsentApi {
  constructor(private readonly http: ApiHttp) {}

  currentLegalDocuments(): Promise<ApiResult<Array<{ type?: string }>>> {
    return this.http.get('/legal/current');
  }

  /** Anonymous cookie-banner acceptance — sets consent_cookie_policy(+_sig). */
  acceptCookieBanner(documentName: string): Promise<ApiResult<{ id?: number; recordId?: number }>> {
    return this.http.post('/legal/anonymous/consent', {
      documentName,
      language: 'pl',
      isTrusted: true,
    });
  }

  /** Pre-registration consent cookie for one document type — sets consent_<type>(+_sig). */
  prepareConsent(documentType: string, version: number): Promise<ApiResult<unknown>> {
    return this.http.post('/legal/consent/prepare', {
      documentType,
      version,
      documentHash: `e2e-test-hash-${documentType}`,
      proof: proof(`consent-checkbox-${documentType.toLowerCase()}`),
    });
  }

  /** Registration through the e2e no-Firebase path; consent cookies ride the jar. */
  register(
    email: string,
    password: string,
    userType: string,
  ): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post('/test/auth/register-without-firebase', {
      email,
      password,
      userType,
      firstName: 'E2E',
      lastName: 'Consent',
    });
  }

  /** Authenticated re-consent: accept every required document in one batch. */
  recordBatchConsent(): Promise<ApiResult<unknown>> {
    const records = ['COOKIE_POLICY', 'TERMS_OF_SERVICE', 'PRIVACY_POLICY'].map((documentType) => ({
      documentType,
      action: 'ACCEPTED',
      proof: proof('reconsent-modal'),
    }));
    return this.http.post('/legal/consent/record-batch', { records });
  }

  consentStatus(): Promise<ApiResult<{ newestConsentsAccepted?: boolean }>> {
    return this.http.get('/legal/consent/my');
  }

  // ── Admin queries ───────────────────────────────────────────────────────────

  consentRecordsFor(userId: number): Promise<ApiResult<Array<Record<string, unknown>>>> {
    return this.http.get(`/admin/legal/consent-records/${userId}`);
  }

  orphanedAnonymousRecords(hoursBack = 1): Promise<ApiResult<Array<Record<string, unknown>>>> {
    return this.http.get('/admin/legal/orphaned-anonymous', { hoursBack });
  }
}
