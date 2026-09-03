/**
 * L0 contract: PreferencesApiService ↔ generated models. Compile-time
 * only; see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { PreferencesApiService } from '../../app/core/preferences/preferences.service';
import type { UserPreferencesDtoIn } from '../../app/api/model/user-preferences-dto-in';
import type { UserPreferencesDtoOut } from '../../app/api/model/user-preferences-dto-out';
import type { Equal, Expect } from '../type-assert';

type _getMine = Expect<
  Equal<PreferencesApiService['getMine'], () => Observable<UserPreferencesDtoOut>>
>;

type _patchMine = Expect<
  Equal<
    PreferencesApiService['patchMine'],
    (dto: UserPreferencesDtoIn) => Observable<UserPreferencesDtoOut>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type PreferencesContract = [_getMine, _patchMine];
