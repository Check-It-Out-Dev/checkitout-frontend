import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RegistryService as GeneratedRegistryService } from '../../api/api/registry.api';
import type { CompanyDataConfirmResponse } from '../../api/model/company-data-confirm-response';
import type { CompanyDataDtoOut } from '../../api/model/company-data-dto-out';
import type { NipLookupResponse } from '../../api/model/nip-lookup-response';

/**
 * Thin wrapper over the generated `RegistryService` so callers get ergonomic
 * methods instead of the codegen's `requestParameters` envelope. BE aggregates
 * GUS BIR1 + CEIDG + Biała Lista VAT in a single response; `confirm(nip)`
 * persists the looked-up data onto the current company and auto-activates the
 * account when the email is already verified (the registry BDD oracle proves
 * the full contract incl. 409 duplicate-NIP / inactive-company semantics).
 */
@Injectable({ providedIn: 'root' })
export class CompanyRegistryService {
  private readonly api = inject(GeneratedRegistryService);

  lookup(nip: string): Observable<NipLookupResponse> {
    return this.api.lookupByNip({ nipLookupRequest: { nip } });
  }

  confirm(nip: string): Observable<CompanyDataConfirmResponse> {
    return this.api.confirmCompanyData({ companyDataConfirmRequest: { nip } });
  }

  /** The company data already confirmed for the current user (empty body until confirmed). */
  companyData(): Observable<CompanyDataDtoOut> {
    return this.api.getCompanyData();
  }
}
