import { Observable, of } from 'rxjs';
import type { FirebaseAuthResponse } from '../../api/model/firebase-auth-response';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';
import { LegalDocumentType } from '../../api/model/legal-document-type';
import type { NipLookupResponse } from '../../api/model/nip-lookup-response';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { LegalApiService } from '../../core/legal/legal-api.service';
import { CompanyRegistryService } from '../../core/registry/registry.service';
import { BusinessSignUpComponent } from '../../feature/auth/sign-up/business-sign-up.component';
import { InfluencerSignUpComponent } from '../../feature/auth/sign-up/influencer-sign-up.component';
import { SignUpChooserComponent } from '../../feature/auth/sign-up/sign-up-chooser.component';
import type { SandboxFixture } from '../sandbox-registry';

class StubAuthApiOk {
  register(): Observable<FirebaseAuthResponse> {
    return of({ idToken: 'stub-id', refreshToken: 'stub-refresh', success: true });
  }
}

class StubAuthApiEmailTaken {
  register(): Observable<FirebaseAuthResponse> {
    return new Observable<FirebaseAuthResponse>((sub) => {
      sub.error({ status: 409, statusText: 'Conflict' });
    });
  }
}

class StubRegistryOk {
  lookup(): Observable<NipLookupResponse> {
    return of({
      nip: '5252447777',
      companyName: 'Acme Studios sp. z o.o.',
      city: 'Warszawa',
      vatStatus: 'ACTIVE',
      companyActive: true,
      sourceGus: true,
      sourceVat: true,
    } as NipLookupResponse);
  }
}

class StubRegistryNotFound {
  lookup(): Observable<NipLookupResponse> {
    return new Observable<NipLookupResponse>((sub) => {
      sub.error({ status: 404, statusText: 'Not Found' });
    });
  }
}

const LEGAL_DOCS: LegalDocumentDtoOut[] = [
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

class StubLegalApiOk {
  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return of(LEGAL_DOCS);
  }
  prepareConsentCookie(): Observable<unknown> {
    return of({});
  }
}

export const SIGN_UP_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'sign-up-chooser',
    label: 'Sign up · role chooser',
    component: SignUpChooserComponent,
  },
  {
    id: 'sign-up-influencer-empty',
    label: 'Sign up · influencer (empty)',
    component: InfluencerSignUpComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiOk },
      { provide: LegalApiService, useClass: StubLegalApiOk },
    ],
  },
  {
    id: 'sign-up-influencer-email-taken',
    label: 'Sign up · influencer (email already taken)',
    component: InfluencerSignUpComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiEmailTaken },
      { provide: LegalApiService, useClass: StubLegalApiOk },
    ],
  },
  {
    id: 'sign-up-business-empty',
    label: 'Sign up · business (empty)',
    component: BusinessSignUpComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiOk },
      { provide: CompanyRegistryService, useClass: StubRegistryOk },
      { provide: LegalApiService, useClass: StubLegalApiOk },
    ],
  },
  {
    id: 'sign-up-business-nip-not-found',
    label: 'Sign up · business (NIP not found)',
    component: BusinessSignUpComponent,
    providers: [
      { provide: AuthApiService, useClass: StubAuthApiOk },
      { provide: CompanyRegistryService, useClass: StubRegistryNotFound },
      { provide: LegalApiService, useClass: StubLegalApiOk },
    ],
  },
];
