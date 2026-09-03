import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { PageUserDtoOut } from '../../api/model/page-user-dto-out';
import { UserApiService } from '../../core/user/user.service';
import { AdminUserListComponent } from './user-list.component';

class FakeApi {
  next: () => Observable<PageUserDtoOut> = () =>
    of({
      content: [
        {
          id: 1,
          firstName: 'Marta',
          lastName: 'Nowak',
          email: 'm@example.com',
          userType: { value: 'INFLUENCER' },
          accountStatus: { value: 'IN_VALIDATION' },
        } as never,
      ],
      totalElements: 1,
    } as PageUserDtoOut);
  lastFilters: Record<string, string> | undefined;
  lastPage = -1;

  adminList(
    page: number,
    _size: number,
    filters?: Record<string, string>,
  ): Observable<PageUserDtoOut> {
    this.lastPage = page;
    this.lastFilters = filters;
    return this.next();
  }
}

function create(api: FakeApi): ComponentFixture<AdminUserListComponent> {
  TestBed.configureTestingModule({
    imports: [
      AdminUserListComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: UserApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(AdminUserListComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AdminUserListComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads with the legacy default filter (IN_VALIDATION approval queue)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    expect(api.lastFilters?.['accountStatus']).toBe('IN_VALIDATION');
    expect(api.lastFilters?.['search']).toBeUndefined();
    expect(fixture.componentInstance.state()).toBe('loaded');
  }));

  it('applies search + type filters and resets to page 0', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.pageIndex.set(3);
    fixture.componentInstance.search.setValue('marta');
    fixture.componentInstance.userType.setValue('INFLUENCER');
    fixture.componentInstance.applyFilters();
    tick();
    expect(api.lastPage).toBe(0);
    expect(api.lastFilters?.['search']).toBe('marta');
    expect(api.lastFilters?.['userType']).toBe('INFLUENCER');
  }));

  it('clearing the status filter drops it from the query', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.accountStatus.setValue('');
    fixture.componentInstance.applyFilters();
    tick();
    expect(api.lastFilters?.['accountStatus']).toBeUndefined();
  }));

  it('maps chips + display name and handles empty/error states', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    const c = fixture.componentInstance;
    expect(c.typeChipClass('ADMIN')).toContain('purple');
    expect(c.statusChipClass('BANNED')).toContain('red');
    expect(c.displayName({ email: 'x@y.z' } as never)).toBe('x@y.z');

    api.next = () => of({ content: [], totalElements: 0 } as PageUserDtoOut);
    c.load();
    tick();
    expect(c.state()).toBe('empty');

    api.next = () => throwError(() => ({ status: 500 }));
    c.load();
    tick();
    expect(c.state()).toBe('error');
  }));
});
