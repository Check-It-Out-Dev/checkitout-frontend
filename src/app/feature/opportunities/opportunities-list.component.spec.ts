import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { PagePartnershipOpportunityDtoOut } from '../../api/model/page-partnership-opportunity-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { OpportunitiesListComponent } from './opportunities-list.component';

const SAMPLE_PAGE: PagePartnershipOpportunityDtoOut = {
  content: [
    {
      id: 1,
      title: 'Sample',
      compensationType: { value: 'CASH', label: 'Cash' } as never,
      compensationAmountMin: 100,
      compensationAmountMax: 200,
      currency: { isoCode: 'PLN', name: 'Polish Złoty' } as never,
    },
  ] as PartnershipOpportunityDtoOut[],
  totalElements: 5,
  number: 0,
  size: 12,
};

class FakeApi {
  next: () => Observable<PagePartnershipOpportunityDtoOut> = () => of(SAMPLE_PAGE);
  lastPage = -1;
  lastSize = -1;
  lastFilters: Record<string, string> | null = null;
  list(
    page: number,
    size: number,
    filters: Record<string, string> = {},
  ): Observable<PagePartnershipOpportunityDtoOut> {
    this.lastPage = page;
    this.lastSize = size;
    this.lastFilters = filters;
    return this.next();
  }
}

function create(api: FakeApi): ComponentFixture<OpportunitiesListComponent> {
  TestBed.configureTestingModule({
    imports: [
      OpportunitiesListComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: OpportunityApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(OpportunitiesListComponent);
  fixture.detectChanges();
  return fixture;
}

describe('OpportunitiesListComponent', () => {
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('loads first page on init', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();

    expect(api.lastPage).toBe(0);
    expect(api.lastSize).toBe(12);
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.items()).toHaveLength(1);
    expect(fixture.componentInstance.totalElements()).toBe(5);
  }));

  describe('filter persistence', () => {
    const STORAGE_KEY = 'cio.opportunities.filter';

    it('restores a persisted filter on init and applies it to the first load', fakeAsync(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ compensationType: 'CASH', city: 'Warsaw' }),
      );
      const api = new FakeApi();
      const fixture = create(api);
      tick();

      expect(fixture.componentInstance.filterForm.getRawValue()).toEqual({
        compensationType: 'CASH',
        city: 'Warsaw',
      });
      expect(api.lastFilters).toMatchObject({ compensationType: 'CASH', city: 'Warsaw' });
    }));

    it('persists the filter on applyFilters', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api);
      tick();
      fixture.componentInstance.filterForm.setValue({ compensationType: 'BARTER', city: 'Kraków' });
      fixture.componentInstance.applyFilters();
      tick();

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
        compensationType: 'BARTER',
        city: 'Kraków',
      });
    }));

    it('clears the persisted filter on resetFilters', fakeAsync(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ compensationType: 'CASH', city: 'Warsaw' }),
      );
      const api = new FakeApi();
      const fixture = create(api);
      tick();
      fixture.componentInstance.resetFilters();
      tick();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(fixture.componentInstance.filterForm.getRawValue()).toEqual({
        compensationType: 'ALL',
        city: '',
      });
    }));

    it('ignores a malformed persisted filter and keeps defaults', fakeAsync(() => {
      localStorage.setItem(STORAGE_KEY, '{not valid json');
      const api = new FakeApi();
      const fixture = create(api);
      tick();

      expect(fixture.componentInstance.filterForm.getRawValue()).toEqual({
        compensationType: 'ALL',
        city: '',
      });
    }));
  });

  it('always sends active=true filter so closed campaigns never render', fakeAsync(() => {
    // Caught 2026-05-09 by the Stage-5b trace-equivalence checker as drift
    // vs legacy. Greenfield was omitting the active filter, which would
    // surface closed/expired campaigns in the discover list.
    const api = new FakeApi();
    create(api);
    tick();
    expect(api.lastFilters).toEqual({ active: 'true' });
  }));

  it('preserves active=true alongside user-applied filters', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.filterForm.patchValue({
      compensationType: 'CASH',
      city: 'Warsaw',
    });
    fixture.componentInstance.applyFilters();
    tick();
    expect(api.lastFilters).toEqual({
      active: 'true',
      compensationType: 'CASH',
      city: 'Warsaw',
    });
  }));

  it('lands in empty state when content is empty', fakeAsync(() => {
    const api = new FakeApi();
    api.next = () => of({ content: [], totalElements: 0, number: 0, size: 12 });
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('empty');
  }));

  it('lands in error state when list throws', fakeAsync(() => {
    const api = new FakeApi();
    api.next = () => throwError(() => new Error('boom'));
    const fixture = create(api);
    tick();

    expect(fixture.componentInstance.state()).toBe('error');
  }));

  it('reloads with new page index from paginator', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();

    fixture.componentInstance.onPage({ pageIndex: 2, pageSize: 24, length: 100 });
    tick();

    expect(api.lastPage).toBe(2);
    expect(api.lastSize).toBe(24);
    expect(fixture.componentInstance.pageIndex()).toBe(2);
  }));

  it('formats CASH compensation as "min–max currency"', () => {
    const api = new FakeApi();
    const fixture = create(api);
    const o: PartnershipOpportunityDtoOut = {
      compensationType: { value: 'CASH' } as never,
      compensationAmountMin: 100,
      compensationAmountMax: 200,
      currency: { isoCode: 'PLN' } as never,
    };

    expect(fixture.componentInstance.compensationDisplay(o)).toBe('100–200 PLN');
  });

  it('formats CASH with single amount when min === max', () => {
    const api = new FakeApi();
    const fixture = create(api);
    const o: PartnershipOpportunityDtoOut = {
      compensationType: { value: 'CASH' } as never,
      compensationAmountMin: 500,
      compensationAmountMax: 500,
      currency: { isoCode: 'PLN' } as never,
    };

    expect(fixture.componentInstance.compensationDisplay(o)).toBe('500 PLN');
  });

  it('falls back to compensationDescription for BARTER', () => {
    const api = new FakeApi();
    const fixture = create(api);
    const o: PartnershipOpportunityDtoOut = {
      compensationType: { value: 'BARTER' } as never,
      compensationDescription: 'Branded merch + vouchers',
    };

    expect(fixture.componentInstance.compensationDisplay(o)).toBe('Branded merch + vouchers');
  });

  it('returns "—" when neither cash range nor barter description present', () => {
    const api = new FakeApi();
    const fixture = create(api);
    const o: PartnershipOpportunityDtoOut = {};

    expect(fixture.componentInstance.compensationDisplay(o)).toBe('—');
  });

  it('does not pass user-driven filter keys when ALL + empty city (active=true is always present)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    expect(api.lastFilters).toEqual({ active: 'true' });
    fixture.componentInstance.applyFilters();
    tick();
    expect(api.lastFilters).toEqual({ active: 'true' });
  }));

  it('passes compensationType filter when not ALL (alongside active=true)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.filterForm.patchValue({ compensationType: 'CASH' });
    fixture.componentInstance.applyFilters();
    tick();
    expect(api.lastFilters).toEqual({ active: 'true', compensationType: 'CASH' });
  }));

  it('passes city filter trimmed when present (alongside active=true)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.filterForm.patchValue({ city: '  Krakow ' });
    fixture.componentInstance.applyFilters();
    tick();
    expect(api.lastFilters).toEqual({ active: 'true', city: 'Krakow' });
  }));

  it('resets filter form + reloads when resetFilters is called (active=true survives reset)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.filterForm.patchValue({ compensationType: 'CASH', city: 'Krakow' });
    fixture.componentInstance.applyFilters();
    tick();
    expect(api.lastFilters).toEqual({ active: 'true', compensationType: 'CASH', city: 'Krakow' });

    fixture.componentInstance.resetFilters();
    tick();
    expect(api.lastFilters).toEqual({ active: 'true' });
    expect(fixture.componentInstance.filterForm.controls.compensationType.value).toBe('ALL');
    expect(fixture.componentInstance.filterForm.controls.city.value).toBe('');
  }));

  it('applyFilters resets pageIndex to 0', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.onPage({ pageIndex: 2, pageSize: 12, length: 50 });
    tick();
    expect(fixture.componentInstance.pageIndex()).toBe(2);
    fixture.componentInstance.applyFilters();
    tick();
    expect(fixture.componentInstance.pageIndex()).toBe(0);
  }));
  it('treats a zero compensation bound as unset (never a "100–0" range)', fakeAsync(() => {
    const fixture = create(new FakeApi());
    tick();
    const c = fixture.componentInstance;
    expect(
      c.compensationDisplay({
        compensationType: { value: 'CASH' } as never,
        compensationAmountMin: 100,
        compensationAmountMax: 0,
        currency: { isoCode: 'EUR' } as never,
      } as never),
    ).toBe('100 EUR');
    expect(
      c.compensationDisplay({
        compensationType: { value: 'CASH' } as never,
        compensationAmountMin: 300,
        compensationAmountMax: 600,
        currency: { isoCode: 'EUR' } as never,
      } as never),
    ).toBe('300–600 EUR');
  }));
});
