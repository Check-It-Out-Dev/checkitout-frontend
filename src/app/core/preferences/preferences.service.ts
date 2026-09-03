import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UserPreferencesControllerService as GeneratedUserPreferencesService } from '../../api/api/user-preferences-controller.api';
import type { UserPreferencesDtoIn } from '../../api/model/user-preferences-dto-in';
import type { UserPreferencesDtoOut } from '../../api/model/user-preferences-dto-out';

/**
 * Wrapper around the generated `UserPreferencesService` "current user"
 * endpoints. Hides the codegen's `requestParameters` envelope.
 *
 * BE has separate per-id and "/me" endpoints for read + write — we only
 * use the `/me` ones because self-service preferences are the only Stage 2
 * surface (admin edits live under a separate route).
 */
@Injectable({ providedIn: 'root' })
export class PreferencesApiService {
  private readonly api = inject(GeneratedUserPreferencesService);

  getMine(): Observable<UserPreferencesDtoOut> {
    return this.api.getCurrentUserPreferences();
  }

  patchMine(dto: UserPreferencesDtoIn): Observable<UserPreferencesDtoOut> {
    // BE PATCH takes an allowlisted free-form map (base-patch hardening);
    // the typed DtoIn is the honest shape we build, cast at the boundary.
    return this.api.patchCurrentUserPreferences({
      requestBody: dto as unknown as { [key: string]: object },
    });
  }
}
