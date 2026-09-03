import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { PagePartnershipOpportunityDtoOut } from '../../api/model/page-partnership-opportunity-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { MyCampaignsComponent } from './my-campaigns.component';

const ROW_ACTIVE: PartnershipOpportunityDtoOut = {
  id: 11,
  title: 'Spring Promo',
  active: true,
  compensationAmountMin: 100,
  compensationAmountMax: 500,
  createdTime: '2026-04-01T10:00:00Z',
};
const ROW_INACTIVE: PartnershipOpportunityDtoOut = {
  id: 12,
  title: 'Old Promo',
  active: false,
  createdTime: '2026-03-15T10:00:00Z',
};

class FakeApi {
  next: (page: number, size: number) => Observable<PagePartnershipOpportunityDtoOut> = () =>
    of({ content: [ROW_ACTIVE, ROW_INACTIVE], totalElements: 2, number: 0, size: 20 });
  lastPage = -1;
  lastSize = -1;
  list(page: number, size: number): Observable<PagePartnershipOpportunityDtoOut> {
    this.lastPage = page;
    this.lastSize = size;
    return this.next(page, size);
  }
}

function create(api: FakeApi): ComponentFixture<MyCampaignsComponent> {
  TestBed.configureTestingModule({
    imports: [
      MyCampaignsComponent,
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
  const fixture = TestBed.createComponent(MyCampaignsComponent);
  fixture.detectChanges();
  return fixture;
}

describe('MyCampaignsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads first page on init', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.detectChanges();
    expect(api.lastPage).toBe(0);
    expect(api.lastSize).toBe(20);
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.items().length).toBe(2);
    expect(fixture.componentInstance.totalElements()).toBe(2);
  }));

  it('shows the empty state when there are zero campaigns', fakeAsync(() => {
    const api = new FakeApi();
    api.next = () => of({ content: [], totalElements: 0, number: 0, size: 20 });
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('empty');
  }));

  it('shows error state when the API throws', fakeAsync(() => {
    const api = new FakeApi();
    api.next = () => throwError(() => ({ status: 500 }));
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
  }));

  it('reloads with new page+size when paginated', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 10, length: 30 });
    tick();
    expect(api.lastPage).toBe(1);
    expect(api.lastSize).toBe(10);
    expect(fixture.componentInstance.pageIndex()).toBe(1);
    expect(fixture.componentInstance.pageSize()).toBe(10);
  }));

  it('returns the right Tailwind class per active flag', () => {
    const api = new FakeApi();
    const fixture = create(api);
    const c = fixture.componentInstance;
    expect(c.statusBadgeClass(true)).toContain('emerald');
    expect(c.statusBadgeClass(false)).toContain('slate');
    expect(c.statusBadgeClass(undefined)).toContain('slate');
  });
});
