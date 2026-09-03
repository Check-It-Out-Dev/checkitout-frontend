/**
 * L0 contract: CompanyRegistryService ↔ generated models. Compile-time
 * only; see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { CompanyRegistryService } from '../../app/core/registry/registry.service';
import type { CompanyDataConfirmResponse } from '../../app/api/model/company-data-confirm-response';
import type { CompanyDataDtoOut } from '../../app/api/model/company-data-dto-out';
import type { NipLookupResponse } from '../../app/api/model/nip-lookup-response';
import type { Equal, Expect } from '../type-assert';

type _lookup = Expect<
  Equal<CompanyRegistryService['lookup'], (nip: string) => Observable<NipLookupResponse>>
>;

type _confirm = Expect<
  Equal<CompanyRegistryService['confirm'], (nip: string) => Observable<CompanyDataConfirmResponse>>
>;

type _companyData = Expect<
  Equal<CompanyRegistryService['companyData'], () => Observable<CompanyDataDtoOut>>
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type RegistryContract = [_lookup, _confirm, _companyData];
