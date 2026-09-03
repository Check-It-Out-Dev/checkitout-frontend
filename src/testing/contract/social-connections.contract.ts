/**
 * L0 contract: SocialConnectionsApi ↔ generated models. Compile-time only;
 * see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { SocialConnectionsApi } from '../../app/core/social/social-connections.service';
import type { PageUserSocialConnectionDtoOut } from '../../app/api/model/page-user-social-connection-dto-out';
import type { Equal, Expect } from '../type-assert';

type _list = Expect<
  Equal<SocialConnectionsApi['list'], () => Observable<PageUserSocialConnectionDtoOut>>
>;

type _disconnect = Expect<
  Equal<SocialConnectionsApi['disconnect'], (id: number) => Observable<unknown>>
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type SocialConnectionsContract = [_list, _disconnect];
