import { Observable, of, throwError } from 'rxjs';
import type { CompanyDataConfirmResponse } from '../../api/model/company-data-confirm-response';
import type { CompanyDataDtoOut } from '../../api/model/company-data-dto-out';
import type { NipLookupResponse } from '../../api/model/nip-lookup-response';
import { CompanyRegistryService } from '../../core/registry/registry.service';
import { CompanySetupComponent } from '../../feature/company/company-setup.component';
import type { SandboxFixture } from '../sandbox-registry';

/** Company-setup (NIP→GUS onboarding) fixtures — mirrors the registry oracle's states. */

const KRS_LOOKUP: NipLookupResponse = {
  nip: '5261040828',
  regon: '010016565',
  krs: '0000006865',
  companyName: 'TESTOWA SPÓŁKA WIDOK SP. Z O.O.',
  companyType: 'SP_ZOO' as never,
  legalFormName: 'Spółka z o.o.',
  street: 'ul. Krakowskie Przedmieście',
  buildingNumber: '15',
  city: 'Warszawa',
  postalCode: '00-071',
  pkdMainCode: '62.01.Z',
  pkdMainDescription: 'Działalność związana z oprogramowaniem',
  vatStatus: 'Czynny',
  companyActive: true,
};

class StubIdle {
  companyData(): Observable<CompanyDataDtoOut> {
    return of({} as CompanyDataDtoOut);
  }
  lookup(): Observable<NipLookupResponse> {
    return of(KRS_LOOKUP);
  }
  confirm(): Observable<CompanyDataConfirmResponse> {
    return of({});
  }
}

class StubActivated extends StubIdle {
  override confirm(): Observable<CompanyDataConfirmResponse> {
    return of({
      companyDataId: 9,
      nip: '5261040828',
      companyName: KRS_LOOKUP.companyName,
      activated: true,
      accountStatus: 'ACTIVE' as never,
    });
  }
}

class StubDuplicate extends StubIdle {
  override lookup(): Observable<NipLookupResponse> {
    return throwError(() => ({
      status: 409,
      error: { message: 'This NIP is already registered on the platform.' },
    }));
  }
}

class StubConfirmed {
  companyData(): Observable<CompanyDataDtoOut> {
    return of({ nip: '5261040828', companyName: KRS_LOOKUP.companyName } as CompanyDataDtoOut);
  }
  lookup(): Observable<NipLookupResponse> {
    return of(KRS_LOOKUP);
  }
  confirm(): Observable<CompanyDataConfirmResponse> {
    return of({});
  }
}

/**
 * Snapshot states are limited to what the INITIAL render can reach (the
 * sandbox harness does not drive form interaction): idle NIP entry and the
 * already-confirmed guard view. The preview/error/done paths are covered by
 * the jest spec; StubPreview/StubActivated/StubDuplicate remain exported for
 * manual sandbox exploration of those flows.
 */
export const COMPANY_SETUP_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'company-setup-idle',
    label: 'Company setup · NIP entry (idle)',
    component: CompanySetupComponent,
    providers: [{ provide: CompanyRegistryService, useClass: StubIdle }],
  },
  {
    id: 'company-setup-preview-interactive',
    label: 'Company setup · interactive (type NIP 5261040828 → preview → confirm ACTIVE)',
    component: CompanySetupComponent,
    providers: [{ provide: CompanyRegistryService, useClass: StubActivated }],
  },
  {
    id: 'company-setup-duplicate-interactive',
    label: 'Company setup · interactive duplicate-NIP 409 (type any valid NIP → verify)',
    component: CompanySetupComponent,
    providers: [{ provide: CompanyRegistryService, useClass: StubDuplicate }],
  },
  {
    id: 'company-setup-confirmed',
    label: 'Company setup · already-verified state',
    component: CompanySetupComponent,
    providers: [{ provide: CompanyRegistryService, useClass: StubConfirmed }],
  },
];
