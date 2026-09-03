/**
 * L0 contract: SessionStateService ↔ generated UserDtoOut. Compile-time only;
 * see opportunities.contract.ts for the pattern. (audit wf_dfde554b — drains
 * the CONTRACT_PENDING backlog.)
 *
 * SessionStateService is the app's authenticated-user cache; its read/seed
 * surface is typed on the generated UserDtoOut, so a backend User-schema
 * change must break here too — not just in UserApiService.
 */
import type { Observable } from 'rxjs';
import type { SessionStateService } from '../../app/core/auth/session-state.service';
import type { UserDtoOut } from '../../app/api/model/user-dto-out';
import type { Equal, Expect } from '../type-assert';

type _probe = Expect<Equal<SessionStateService['probe'], () => Observable<UserDtoOut | null>>>;

type _setUser = Expect<Equal<SessionStateService['setUser'], (user: UserDtoOut) => void>>;

// Referenced so the assertions stay purely type-level; see address.contract.ts.
export type SessionStateContract = [_probe, _setUser];
