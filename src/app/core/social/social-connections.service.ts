import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UserSocialConnectionControllerService as GeneratedUserSocialConnectionService } from '../../api/api/user-social-connection-controller.api';
import type { PageUserSocialConnectionDtoOut } from '../../api/model/page-user-social-connection-dto-out';

/**
 * Wrapper over the generated user-social-connection API. Hides the
 * codegen's numbered method names (`findPaginated1` / `delete1`) and the
 * `requestParameters` envelope behind the two verbs the settings panel
 * needs: list my connections + disconnect one. The BE scopes rows to the
 * authenticated user, so no user-id plumbing on this side.
 */
@Injectable({ providedIn: 'root' })
export class SocialConnectionsApi {
  private readonly api = inject(GeneratedUserSocialConnectionService);

  /** First page is plenty — a user connects a handful of platforms, not hundreds. */
  list(): Observable<PageUserSocialConnectionDtoOut> {
    return this.api.findPaginated1({ pageable: { page: 0, size: 50 }, filters: {} });
  }

  /** The generated delete is batch-by-ids; the panel disconnects one at a time. */
  disconnect(id: number): Observable<unknown> {
    return this.api.delete1({ ids: [id] });
  }
}
