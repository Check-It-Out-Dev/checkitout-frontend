/**
 * L0 contract: AddressApi ↔ generated models. Compile-time only; see
 * opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { AddressApi } from '../../app/core/address/address.service';
import type { AddressDtoIn } from '../../app/api/model/address-dto-in';
import type { AddressDtoOut } from '../../app/api/model/address-dto-out';
import type { Equal, Expect } from '../type-assert';

type _createForUser = Expect<
  Equal<
    AddressApi['createForUser'],
    (userId: number, dto: AddressDtoIn) => Observable<AddressDtoOut>
  >
>;

type _patch = Expect<
  Equal<AddressApi['patch'], (id: number, dto: AddressDtoIn) => Observable<AddressDtoOut>>
>;

type _primaryForUser = Expect<
  Equal<AddressApi['primaryForUser'], (userId: number) => Observable<AddressDtoOut>>
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type AddressContract = [_createForUser, _patch, _primaryForUser];
