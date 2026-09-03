import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UserControllerService as GeneratedUserService } from '../../api/api/user-controller.api';
import type { DeletionEligibilityDto } from '../../api/model/deletion-eligibility-dto';
import type { UserDtoIn } from '../../api/model/user-dto-in';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { withStepUpToken } from '../step-up/step-up-context';

/**
 * Thin wrapper over the generated `UserService.{getCurrentUser, patch}`.
 * Exposed as `UserApiService` so it doesn't shadow the generated symbol
 * when both are imported, and so we can layer caching + signal-state here
 * in later slices without the generator complaining.
 */
@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly api = inject(GeneratedUserService);

  /**
   * GET /api/user/me — current authenticated user (full DTO including
   * addresses, social connections, status flags).
   */
  getCurrent(): Observable<UserDtoOut> {
    return this.api.getCurrentUser();
  }

  /**
   * PATCH /api/user/{id} — SPARSE update: send only the keys being changed.
   * The BE takes a strict allowlisted map (base-patch hardening): unknown
   * keys — including `id` — are a 400, and a carried-along `email` equal to
   * a *different* address engages the step-up gate. The generator types the
   * body as a full `UserDtoIn`, but that is the schema shape, not a
   * required-fields contract.
   *
   * Pass `stepUpToken` for changes the BE gates on step-up auth (currently:
   * an ACTUAL email change — an unchanged email is a no-op and needs no
   * token). The token is attached via the step-up interceptor as the
   * `X-Step-Up-Token` header and is single-use server-side.
   */
  patch(id: number, dto: UserDtoIn, stepUpToken?: string): Observable<UserDtoOut> {
    const options = stepUpToken ? { context: withStepUpToken(stepUpToken) } : undefined;
    // BE PATCH takes an allowlisted free-form map (base-patch hardening);
    // the typed DtoIn is the honest shape we build, cast at the boundary.
    return this.api.patch(
      { id, requestBody: dto as unknown as { [key: string]: object } },
      'body',
      false,
      options,
    );
  }

  /**
   * ADMIN — GET /users/paged with server-side filters (search, userType,
   * accountStatus). Journey 8 user-management table; BE authorizes ADMIN.
   */
  adminList(
    page: number,
    size: number,
    filters: Record<string, string> = {},
  ): Observable<import('../../api/model/page-user-dto-out').PageUserDtoOut> {
    return this.api.findPaginated({
      pageable: { page, size, sort: ['createdTime,desc'] },
      filters,
    });
  }

  /**
   * GET /users/me/deletion-eligibility — RODO Art 17 pre-check (iter-51
   * P0 #4). Always 200; `canSoftDelete` + `softDeleteBlockers` decide
   * whether the confirmation or the blockers dialog opens. The eligibility
   * gate is client-side by design — the DELETE endpoint does not re-guard,
   * matching legacy.
   */
  checkMyDeletionEligibility(): Observable<DeletionEligibilityDto> {
    return this.api.checkMyDeletionEligibility();
  }

  /**
   * DELETE /users/{id} — soft-delete (account flagged TO_BE_DELETED; the
   * BE's DeferredDeletionCronJob performs the RODO cascade later). GDPR
   * audit-logged server-side.
   */
  deleteAccount(id: number): Observable<void> {
    return this.api._delete({ ids: [id] }) as Observable<void>;
  }
}
