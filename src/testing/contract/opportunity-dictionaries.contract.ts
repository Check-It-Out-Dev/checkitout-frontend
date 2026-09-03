/**
 * L0 contract: OpportunityDictionariesApiService ↔ generated models.
 * Compile-time only; see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { OpportunityDictionariesApiService } from '../../app/core/opportunities/opportunity-dictionaries.service';
import type { ContentTypeDtoOut } from '../../app/api/model/content-type-dto-out';
import type { CurrencyDtoOut } from '../../app/api/model/currency-dto-out';
import type { PlatformDto } from '../../app/api/model/platform-dto';
import type { ServiceTypeDtoOut } from '../../app/api/model/service-type-dto-out';
import type { Equal, Expect } from '../type-assert';

type _platforms = Expect<
  Equal<OpportunityDictionariesApiService['platforms'], () => Observable<Array<PlatformDto>>>
>;

type _contentTypes = Expect<
  Equal<
    OpportunityDictionariesApiService['contentTypes'],
    () => Observable<Array<ContentTypeDtoOut>>
  >
>;

type _serviceTypes = Expect<
  Equal<
    OpportunityDictionariesApiService['serviceTypes'],
    () => Observable<Array<ServiceTypeDtoOut>>
  >
>;

type _currencies = Expect<
  Equal<OpportunityDictionariesApiService['currencies'], () => Observable<Array<CurrencyDtoOut>>>
>;

// Referenced so the assertions remain purely type-level.
export type OpportunityDictionariesContract = [
  _platforms,
  _contentTypes,
  _serviceTypes,
  _currencies,
];
