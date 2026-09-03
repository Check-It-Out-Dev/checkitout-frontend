import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PartnershipOpportunityAPIService as GeneratedPartnershipApiService } from '../../api/api/partnership-opportunity-api.api';
import type { PagePartnershipOpportunityDtoOut } from '../../api/model/page-partnership-opportunity-dto-out';
import type { PartnershipOpportunityDtoIn } from '../../api/model/partnership-opportunity-dto-in';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';

/**
 * Wrapper around the generated `PartnershipOpportunityAPIService`. Hides
 * the codegen's odd method names (`findPaginated7` / `getById7` /
 * `create7` / `patch7` / `update7` / `delete7`) behind ergonomic verbs
 * and the `requestParameters` envelope.
 *
 * Stage 4 split:
 *  - listing + detail (E1 / E2) — read-only paths used by influencers
 *    browsing campaigns.
 *  - create + edit (E5) — company-side mutations.
 */
@Injectable({ providedIn: 'root' })
export class OpportunityApiService {
  private readonly api = inject(GeneratedPartnershipApiService);

  list(
    page: number,
    size: number,
    filters: Record<string, string> = {},
    sort: ReadonlyArray<string> = ['createdTime,desc'],
  ): Observable<PagePartnershipOpportunityDtoOut> {
    return this.api.findPaginated7({
      pageable: { page, size, sort: [...sort] },
      filters,
    });
  }

  getById(id: number): Observable<PartnershipOpportunityDtoOut> {
    return this.api.getById7({ id });
  }

  create(dto: PartnershipOpportunityDtoIn): Observable<PartnershipOpportunityDtoOut> {
    return this.api.create7({ partnershipOpportunityDtoIn: dto });
  }

  /**
   * Full replacement (PUT). THE edit verb for campaigns: the BE `update()`
   * path manually maps the DtoIn and custom-handles platforms/contentTypes/
   * photos/address, with the same permission gate as patch. The reflective
   * PATCH path CANNOT convert JSON arrays into the entity's Set<Platform>/
   * Set<ContentType> relations (BaseService.convertValueToFieldType has no
   * Set branch → uncaught IllegalArgumentException → 500), so edits carrying
   * those collections must come through here. Found 2026-09-02 during the
   * photos robustness pass; BE-side converter fix queued for post-freeze.
   */
  update(id: number, dto: PartnershipOpportunityDtoIn): Observable<PartnershipOpportunityDtoOut> {
    return this.api.update7({ id, partnershipOpportunityDtoIn: dto });
  }

  /**
   * Partial update (PATCH). SAFE ONLY for scalar fields (title, details,
   * active, …) — see `update()` for why collections must not ride PATCH.
   */
  patch(id: number, dto: PartnershipOpportunityDtoIn): Observable<PartnershipOpportunityDtoOut> {
    // BE PATCH takes BaseController's untyped `Map<String,Object>` body —
    // keep the typed surface, cast once at the boundary (see
    // AddressApi.patch; BE-side schema strengthening queued).
    return this.api.patch7({ id, requestBody: dto as unknown as { [key: string]: object } });
  }
}
