import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { ContentTypeControllerService as GeneratedContentTypeApi } from '../../api/api/content-type-controller.api';
import { CurrencyControllerService as GeneratedCurrencyApi } from '../../api/api/currency-controller.api';
import { PlatformControllerService as GeneratedPlatformApi } from '../../api/api/platform-controller.api';
import { ServiceTypeControllerService as GeneratedServiceTypeApi } from '../../api/api/service-type-controller.api';
import { OpportunityDictionariesApiService } from './opportunity-dictionaries.service';

interface FakePage {
  content?: Array<{ id: number }>;
  last?: boolean;
  number?: number;
}

/**
 * Records every request and serves scripted pages in order. Repeats the
 * last scripted page when the pager asks past the script — used by the
 * runaway-cap test to simulate a server that never reports `last`.
 */
class FakePagedApi {
  calls: Array<{ pageable: { page?: number; size: number } }> = [];
  pages: Array<FakePage> = [];

  respond(req: { pageable: { page?: number; size: number } }): Observable<FakePage> {
    this.calls.push(req);
    return of(this.pages[Math.min(this.calls.length - 1, this.pages.length - 1)]);
  }
}

class FakePlatformApi extends FakePagedApi {
  findPaginated6 = (req: { pageable: { page?: number; size: number } }) => this.respond(req);
}
class FakeContentTypeApi extends FakePagedApi {
  findPaginated9 = (req: { pageable: { page?: number; size: number } }) => this.respond(req);
}
class FakeServiceTypeApi extends FakePagedApi {
  findPaginated5 = (req: { pageable: { page?: number; size: number } }) => this.respond(req);
}
class FakeCurrencyApi extends FakePagedApi {
  findPaginated8 = (req: { pageable: { page?: number; size: number } }) => this.respond(req);
}

describe('OpportunityDictionariesApiService', () => {
  let service: OpportunityDictionariesApiService;
  let platformApi: FakePlatformApi;
  let contentTypeApi: FakeContentTypeApi;
  let serviceTypeApi: FakeServiceTypeApi;
  let currencyApi: FakeCurrencyApi;

  beforeEach(() => {
    platformApi = new FakePlatformApi();
    contentTypeApi = new FakeContentTypeApi();
    serviceTypeApi = new FakeServiceTypeApi();
    currencyApi = new FakeCurrencyApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: GeneratedPlatformApi, useValue: platformApi },
        { provide: GeneratedContentTypeApi, useValue: contentTypeApi },
        { provide: GeneratedServiceTypeApi, useValue: serviceTypeApi },
        { provide: GeneratedCurrencyApi, useValue: currencyApi },
      ],
    });
    service = TestBed.inject(OpportunityDictionariesApiService);
  });

  function ids(items: Array<{ id?: number }>): Array<number | undefined> {
    return items.map((item) => item.id);
  }

  it('fetches a single-page dictionary with one legacy-identical request', () => {
    platformApi.pages = [{ content: [{ id: 1 }, { id: 2 }], last: true, number: 0 }];

    let result: Array<{ id?: number }> = [];
    service.platforms().subscribe((items) => (result = items));

    expect(ids(result)).toEqual([1, 2]);
    expect(platformApi.calls.length).toBe(1);
    expect(platformApi.calls[0]).toEqual({ pageable: { size: 100 }, filters: {} });
    // Legacy sends {size:100} with no page key — the trace tier diffs the
    // query string, so `page` must be genuinely absent, not undefined.
    expect('page' in platformApi.calls[0].pageable).toBe(false);
  });

  it('drains a multi-page dictionary in order (no silent ceiling — BUG-1 guard)', () => {
    serviceTypeApi.pages = [
      { content: [{ id: 1 }, { id: 2 }], last: false, number: 0 },
      { content: [{ id: 3 }], last: false, number: 1 },
      { content: [{ id: 4 }], last: true, number: 2 },
    ];

    let result: Array<{ id?: number }> = [];
    service.serviceTypes().subscribe((items) => (result = items));

    expect(ids(result)).toEqual([1, 2, 3, 4]);
    expect(serviceTypeApi.calls.length).toBe(3);
    expect(serviceTypeApi.calls[1].pageable).toEqual({ page: 1, size: 100 });
    expect(serviceTypeApi.calls[2].pageable).toEqual({ page: 2, size: 100 });
  });

  it('stops at the hard page cap when the server never reports last', () => {
    contentTypeApi.pages = [{ content: [{ id: 1 }], last: false, number: 0 }];

    let result: Array<{ id?: number }> = [];
    service.contentTypes().subscribe((items) => (result = items));

    // MAX_PAGES = 10: a misbehaving server cannot loop the client forever.
    expect(contentTypeApi.calls.length).toBe(10);
    expect(result.length).toBe(10);
  });

  it('treats a missing last flag as the final page (defensive single fetch)', () => {
    currencyApi.pages = [{ content: [{ id: 7 }], number: 0 }];

    let result: Array<{ id?: number }> = [];
    service.currencies().subscribe((items) => (result = items));

    expect(ids(result)).toEqual([7]);
    expect(currencyApi.calls.length).toBe(1);
  });

  it('normalizes an absent content array to []', () => {
    platformApi.pages = [{ last: true, number: 0 }];

    let result: Array<{ id?: number }> | null = null;
    service.platforms().subscribe((items) => (result = items));

    expect(result).toEqual([]);
  });
});
