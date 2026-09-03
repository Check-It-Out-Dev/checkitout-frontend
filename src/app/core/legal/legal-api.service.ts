import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LegalControllerService as LegalService } from '../../api/api/legal-controller.api';
import type { AnonymousConsentDtoIn } from '../../api/model/anonymous-consent-dto-in';
import type { AnonymousConsentDtoOut } from '../../api/model/anonymous-consent-dto-out';
import type { ConsentPrepareRequestDocumentTypeEnum } from '../../api/model/consent-prepare-request';
import type { ConsentProofDtoIn } from '../../api/model/consent-proof-dto-in';
import type { ConsentRecordDtoIn } from '../../api/model/consent-record-dto-in';
import type { ConsentStatusDtoOut } from '../../api/model/consent-status-dto-out';
import { LegalDocumentType } from '../../api/model/legal-document-type';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';

/**
 * Wrapper around the generated `/legal/*` client.
 *
 * Two distinct flows the service supports:
 *
 * **A. Pre-registration consent prep (sign-up + OAuth).** Before
 * `/auth/firebase/register` or `/auth/social/callback/instagram` the FE
 * must POST `/legal/consent/prepare` for each of the 3 required document
 * types — BE refuses registration with `error.consent.required` if any
 * cookie is missing. The cookies are HMAC-signed, SameSite=Lax (so they
 * survive the OAuth redirect), 1-hour TTL.
 *
 * **B. Authenticated batch reconsent.** When `/users/me` returns
 * `newestConsentsAccepted=false`, the FE shows a re-consent modal and
 * POSTs `/legal/consent/record-batch` with all 3 documents.
 *
 * Note on enum types: the generated `ConsentPrepareRequestDocumentTypeEnum`
 * has incorrect values (`COOKIES_POLICY`, `MARKETING_POLICY`) that don't
 * match the BE's `LegalDocumentType` enum. We accept the canonical
 * `LegalDocumentType` at the public surface and cast at the API
 * boundary — once OpenAPI regen picks up the BE schema fix, the cast
 * goes away.
 */
@Injectable({ providedIn: 'root' })
export class LegalApiService {
  private readonly api = inject(LegalService);

  /** GET /legal/current — version + content-hash for every active document. */
  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return this.api.getCurrentDocuments();
  }

  /**
   * POST /legal/consent/prepare — sets ONE HMAC-signed consent cookie.
   * Sign-up forms call this 3 times (TERMS_OF_SERVICE + PRIVACY_POLICY +
   * COOKIE_POLICY) before the actual register call, otherwise BE 400s.
   */
  prepareConsentCookie(args: {
    documentType: LegalDocumentType;
    version: number;
    documentHash: string;
    proof: ConsentProofDtoIn;
  }): Observable<void> {
    // The two enums (LegalDocumentType + ConsentPrepareRequestDocumentTypeEnum)
    // are now value-identical post-OpenAPI-regen — `'COOKIE_POLICY'` etc.
    // line up. They're still nominally distinct TS types, hence the cast.
    // Safe by string-equality of their values.
    return this.api.prepareConsentCookie({
      consentPrepareRequest: {
        documentType: args.documentType as unknown as ConsentPrepareRequestDocumentTypeEnum,
        version: args.version,
        documentHash: args.documentHash,
        proof: args.proof,
      },
    });
  }

  /**
   * POST /legal/anonymous/consent — alternative pre-registration flow
   * that records consent server-side with `user_id=NULL` and links to
   * the eventual user account on register. Used by the social-OAuth
   * path where the FE doesn't get a chance to show clickwrap before
   * Instagram redirects.
   */
  recordAnonymousConsent(req: AnonymousConsentDtoIn): Observable<AnonymousConsentDtoOut> {
    return this.api.recordAnonymousConsent({ anonymousConsentDtoIn: req });
  }

  /** GET /legal/consent/my — authenticated user's per-document consent state. */
  getMyConsentStatus(): Observable<ConsentStatusDtoOut> {
    return this.api.getMyConsentStatus();
  }

  /**
   * POST /legal/consent/record-batch — flow B (authenticated reconsent
   * after a document version bump). The BE requires ALL THREE core
   * document types in one call (COOKIE_POLICY + TERMS_OF_SERVICE +
   * PRIVACY_POLICY) and 400s on a partial batch. Used by the
   * blocked-for-terms reconsent dialog.
   */
  recordConsentBatch(records: ConsentRecordDtoIn[]): Observable<unknown> {
    return this.api.recordConsentBatch({ consentRecordBatchDtoIn: { records } });
  }

  /**
   * POST /legal/consent/category-toggle — records a cookie-banner category
   * decision server-side (anonymous; user_id=NULL). The `ESSENTIAL`
   * category is special: the BE maps it to the HMAC-signed
   * `consent_cookie_policy` cookie that `/auth/exchange-token` gates on
   * (451 without it). ANALYTICS / MARKETING set `consent_cat_*` cookies.
   * `withCredentials` is on globally, so the browser stores whatever the
   * BE Set-Cookies here — this is how the banner click makes later login
   * succeed, exactly as legacy's cookie-consent service does.
   */
  toggleCookieCategory(
    categoryType: 'ESSENTIAL' | 'ANALYTICS' | 'MARKETING',
    enabled: boolean,
    isTrusted = true,
  ): Observable<void> {
    return this.api.toggleCookieCategory({
      categoryToggleDtoIn: { categoryType, enabled, isTrusted },
    });
  }
}
