/**
 * L0 contract: UserApiService ↔ generated models. Compile-time only; see
 * opportunities.contract.ts for the pattern. (audit wf_dfde554b — drains the
 * CONTRACT_PENDING backlog: user is the richest generated-model surface of
 * the uncovered wrappers — profile, admin paging, RODO deletion.)
 */
import type { Observable } from 'rxjs';
import type { UserApiService } from '../../app/core/user/user.service';
import type { DeletionEligibilityDto } from '../../app/api/model/deletion-eligibility-dto';
import type { PageUserDtoOut } from '../../app/api/model/page-user-dto-out';
import type { UserDtoIn } from '../../app/api/model/user-dto-in';
import type { UserDtoOut } from '../../app/api/model/user-dto-out';
import type { Equal, Expect } from '../type-assert';

type _getCurrent = Expect<Equal<UserApiService['getCurrent'], () => Observable<UserDtoOut>>>;

type _patch = Expect<
  Equal<
    UserApiService['patch'],
    (id: number, dto: UserDtoIn, stepUpToken?: string) => Observable<UserDtoOut>
  >
>;

type _adminList = Expect<
  Equal<
    UserApiService['adminList'],
    (page: number, size: number, filters?: Record<string, string>) => Observable<PageUserDtoOut>
  >
>;

type _checkMyDeletionEligibility = Expect<
  Equal<UserApiService['checkMyDeletionEligibility'], () => Observable<DeletionEligibilityDto>>
>;

type _deleteAccount = Expect<
  Equal<UserApiService['deleteAccount'], (id: number) => Observable<void>>
>;

// Referenced so the assertions stay purely type-level; see address.contract.ts.
export type UserContract = [
  _getCurrent,
  _patch,
  _adminList,
  _checkMyDeletionEligibility,
  _deleteAccount,
];
