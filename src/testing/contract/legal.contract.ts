/**
 * L0 contract: LegalApiService ↔ generated models. Compile-time only;
 * see opportunities.contract.ts. If `npm run openapi:gen` moves a DTO or
 * someone widens a wrapper signature (an `any` leak, a loosened param),
 * `npm run typecheck` breaks here, naming the exact method.
 *
 * `toggleCookieCategory` is deliberately unpinned: its public surface is a
 * hand-rolled literal union + booleans → Observable<void> (the generated
 * `CategoryToggleDtoIn.categoryType` is plain `string`), so no generated
 * type appears in its signature for regen drift to move.
 */
import type { Observable } from 'rxjs';
import type { LegalApiService } from '../../app/core/legal/legal-api.service';
import type { AnonymousConsentDtoIn } from '../../app/api/model/anonymous-consent-dto-in';
import type { AnonymousConsentDtoOut } from '../../app/api/model/anonymous-consent-dto-out';
import type { ConsentProofDtoIn } from '../../app/api/model/consent-proof-dto-in';
import type { ConsentRecordDtoIn } from '../../app/api/model/consent-record-dto-in';
import type { ConsentStatusDtoOut } from '../../app/api/model/consent-status-dto-out';
import type { LegalDocumentDtoOut } from '../../app/api/model/legal-document-dto-out';
import type { LegalDocumentType } from '../../app/api/model/legal-document-type';
import type { Equal, Expect } from '../type-assert';

type _getCurrentDocuments = Expect<
  Equal<LegalApiService['getCurrentDocuments'], () => Observable<LegalDocumentDtoOut[]>>
>;

type _prepareConsentCookie = Expect<
  Equal<
    LegalApiService['prepareConsentCookie'],
    (args: {
      documentType: LegalDocumentType;
      version: number;
      documentHash: string;
      proof: ConsentProofDtoIn;
    }) => Observable<void>
  >
>;

type _recordAnonymousConsent = Expect<
  Equal<
    LegalApiService['recordAnonymousConsent'],
    (req: AnonymousConsentDtoIn) => Observable<AnonymousConsentDtoOut>
  >
>;

type _getMyConsentStatus = Expect<
  Equal<LegalApiService['getMyConsentStatus'], () => Observable<ConsentStatusDtoOut>>
>;

type _recordConsentBatch = Expect<
  Equal<
    LegalApiService['recordConsentBatch'],
    (records: ConsentRecordDtoIn[]) => Observable<unknown>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type LegalContract = [
  _getCurrentDocuments,
  _prepareConsentCookie,
  _recordAnonymousConsent,
  _getMyConsentStatus,
  _recordConsentBatch,
];
