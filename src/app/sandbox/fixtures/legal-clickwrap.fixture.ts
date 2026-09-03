import { Observable, of, throwError } from 'rxjs';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';
import { LegalDocumentType } from '../../api/model/legal-document-type';
import { LegalApiService } from '../../core/legal/legal-api.service';
import { LegalClickwrapComponent } from '../../shared/components/legal-clickwrap/legal-clickwrap.component';
import type { SandboxFixture } from '../sandbox-registry';

const DOCS: LegalDocumentDtoOut[] = [
  {
    type: LegalDocumentType.TERMS_OF_SERVICE,
    version: 3,
    contentHash: 'tos-hash',
    downloadUrl: 'https://app.example/tos.pdf',
  },
  {
    type: LegalDocumentType.PRIVACY_POLICY,
    version: 3,
    contentHash: 'pp-hash',
    downloadUrl: 'https://app.example/pp.pdf',
  },
  {
    type: LegalDocumentType.COOKIE_POLICY,
    version: 1,
    contentHash: 'cp-hash',
    downloadUrl: 'https://app.example/cp.pdf',
  },
];

class StubLegalOk {
  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return of(DOCS);
  }
  prepareConsentCookie(): Observable<unknown> {
    return of({});
  }
}

class StubLegalLoadFail {
  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return throwError(() => new Error('500'));
  }
  prepareConsentCookie(): Observable<unknown> {
    return of({});
  }
}

export const LEGAL_CLICKWRAP_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'legal-clickwrap-default',
    label: 'Legal clickwrap · 3 documents loaded, all unchecked',
    component: LegalClickwrapComponent,
    viewport: { width: 480, height: 360 },
    providers: [{ provide: LegalApiService, useClass: StubLegalOk }],
  },
  {
    id: 'legal-clickwrap-load-failed',
    label: 'Legal clickwrap · /legal/current load failure',
    component: LegalClickwrapComponent,
    viewport: { width: 480, height: 200 },
    providers: [{ provide: LegalApiService, useClass: StubLegalLoadFail }],
  },
];
