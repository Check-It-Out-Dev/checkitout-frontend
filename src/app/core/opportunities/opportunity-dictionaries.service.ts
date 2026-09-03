import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { ContentTypeControllerService as GeneratedContentTypeApi } from '../../api/api/content-type-controller.api';
import { CurrencyControllerService as GeneratedCurrencyApi } from '../../api/api/currency-controller.api';
import { PlatformControllerService as GeneratedPlatformApi } from '../../api/api/platform-controller.api';
import { ServiceTypeControllerService as GeneratedServiceTypeApi } from '../../api/api/service-type-controller.api';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import type { CurrencyDtoOut } from '../../api/model/currency-dto-out';
import type { PlatformDto } from '../../api/model/platform-dto';
import type { ServiceTypeDtoOut } from '../../api/model/service-type-dto-out';

/**
 * Page size 100 (not 50): the service-type dictionary already has 57 rows —
 * caught live by the Stage-5b trace-equivalence tier when size 50 silently
 * dropped rows. Legacy is WORSE here (no params → server default 20,
 * truncating to 20/57) — a legacy bug we deliberately do not replicate; the
 * divergence is documented as expectedChanged in
 * company-create-campaign-form.integration.spec.ts.
 * `page` is omitted on the first request (first page is the default) so the
 * call stays byte-identical to legacy's `{size:100}` query.
 */
const PAGE_SIZE = 100;

/**
 * Follow-up pages are a hard-capped safety net (10 pages = 1,000 rows —
 * two orders of magnitude above any dictionary). They only fire when a
 * dictionary outgrows one page, so today's wire traffic is exactly one
 * request per dictionary, same as before.
 */
const MAX_PAGES = 10;

/** Structural slice of the generated Page* models the pager needs. */
interface Paged<T> {
  content?: Array<T>;
  last?: boolean;
  number?: number;
}

/**
 * FK dictionaries the campaign create/edit form needs (task #35a):
 * platforms, content types, service types and currencies, each fetched
 * WHOLE. Dictionaries are reference data — a silent page ceiling is a
 * correctness bug (missing service types make campaigns un-creatable for
 * those categories), so every method drains the pagination until `last`
 * (or the MAX_PAGES cap). Mirrors
 * AppliedOpportunityContentApiService.listContentTypes, kept here so the
 * form pulls all four from one service.
 */
@Injectable({ providedIn: 'root' })
export class OpportunityDictionariesApiService {
  private readonly platformApi = inject(GeneratedPlatformApi);
  private readonly contentTypeApi = inject(GeneratedContentTypeApi);
  private readonly serviceTypeApi = inject(GeneratedServiceTypeApi);
  private readonly currencyApi = inject(GeneratedCurrencyApi);

  platforms(): Observable<Array<PlatformDto>> {
    return fetchAll((pageable) => this.platformApi.findPaginated6({ pageable, filters: {} }));
  }

  contentTypes(): Observable<Array<ContentTypeDtoOut>> {
    return fetchAll((pageable) => this.contentTypeApi.findPaginated9({ pageable, filters: {} }));
  }

  serviceTypes(): Observable<Array<ServiceTypeDtoOut>> {
    return fetchAll((pageable) => this.serviceTypeApi.findPaginated5({ pageable, filters: {} }));
  }

  currencies(): Observable<Array<CurrencyDtoOut>> {
    return fetchAll((pageable) => this.currencyApi.findPaginated8({ pageable, filters: {} }));
  }
}

/**
 * Drains a paginated finder into one array. The first request omits `page`
 * (legacy-identical); follow-ups ask for `page.number + 1` until the server
 * reports `last` or MAX_PAGES is reached. A missing `last` flag (defensive:
 * the field is optional in the generated model) stops after the first page —
 * exactly the pre-fetch-all behavior, never an infinite loop.
 */
function fetchAll<T>(
  fetchPage: (pageable: { page?: number; size: number }) => Observable<Paged<T>>,
): Observable<Array<T>> {
  return fetchPage({ size: PAGE_SIZE }).pipe(
    expand((page, index) =>
      page.last === false && index + 1 < MAX_PAGES
        ? fetchPage({ page: (page.number ?? index) + 1, size: PAGE_SIZE })
        : EMPTY,
    ),
    map((page) => page.content ?? []),
    reduce((all, chunk) => all.concat(chunk), [] as Array<T>),
  );
}
