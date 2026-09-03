import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { CompanyDataConfirmResponse } from '../../api/model/company-data-confirm-response';
import type { CompanyDataDtoOut } from '../../api/model/company-data-dto-out';
import type { NipLookupResponse } from '../../api/model/nip-lookup-response';
import { CompanyRegistryService } from '../../core/registry/registry.service';
import { CompanySetupComponent } from './company-setup.component';

const LOOKUP: NipLookupResponse = {
  nip: '5261040828',
  companyName: 'Testowa Sp. z o.o.',
  companyType: 'SP_ZOO' as never,
  street: 'ul. Prosta',
  buildingNumber: '1',
  city: 'Warszawa',
  postalCode: '00-001',
};

class FakeRegistry {
  existing: CompanyDataDtoOut = {} as CompanyDataDtoOut;
  lookupNext: () => Observable<NipLookupResponse> = () => of(LOOKUP);
  confirmNext: () => Observable<CompanyDataConfirmResponse> = () =>
    of({ nip: '5261040828', activated: true, accountStatus: 'ACTIVE' as never });

  companyData(): Observable<CompanyDataDtoOut> {
    return of(this.existing);
  }
  lookup(): Observable<NipLookupResponse> {
    return this.lookupNext();
  }
  confirm(): Observable<CompanyDataConfirmResponse> {
    return this.confirmNext();
  }
}

function create(api: FakeRegistry): ComponentFixture<CompanySetupComponent> {
  TestBed.configureTestingModule({
    imports: [
      CompanySetupComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: CompanyRegistryService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(CompanySetupComponent);
  fixture.detectChanges();
  return fixture;
}

describe('CompanySetupComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts idle when no company data is confirmed yet', fakeAsync(() => {
    const fixture = create(new FakeRegistry());
    tick();
    expect(fixture.componentInstance.phase()).toBe('idle');
  }));

  it('shows the confirmed state when company data already exists', fakeAsync(() => {
    const api = new FakeRegistry();
    api.existing = { nip: '5261040828', companyName: 'Done Co' } as CompanyDataDtoOut;
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.phase()).toBe('confirmed');
    expect(fixture.componentInstance.existing()?.['nip']).toBe('5261040828');
  }));

  it('rejects a malformed NIP client-side without calling the BE', fakeAsync(() => {
    const api = new FakeRegistry();
    const lookupSpy = jest.spyOn(api, 'lookup');
    const fixture = create(api);
    tick();
    fixture.componentInstance.nip.setValue('123');
    fixture.componentInstance.verify();
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.phase()).toBe('idle');
  }));

  it('moves to preview with the lookup data and assembles the address line', fakeAsync(() => {
    const fixture = create(new FakeRegistry());
    tick();
    fixture.componentInstance.nip.setValue('5261040828');
    fixture.componentInstance.verify();
    tick();
    expect(fixture.componentInstance.phase()).toBe('preview');
    expect(fixture.componentInstance.lookup()?.companyName).toBe('Testowa Sp. z o.o.');
    expect(fixture.componentInstance.addressLine()).toBe('ul. Prosta 1, 00-001 Warszawa');
  }));

  it('surfaces the BE message on lookup errors (409 duplicate NIP)', fakeAsync(() => {
    const api = new FakeRegistry();
    api.lookupNext = () =>
      throwError(() => ({ status: 409, error: { message: 'already registered on the platform' } }));
    const fixture = create(api);
    tick();
    fixture.componentInstance.nip.setValue('5261040828');
    fixture.componentInstance.verify();
    tick();
    expect(fixture.componentInstance.phase()).toBe('idle');
    expect(fixture.componentInstance.errorMessage()).toContain('already registered');
  }));

  it('confirm lands on done with activation celebrated', fakeAsync(() => {
    const fixture = create(new FakeRegistry());
    tick();
    fixture.componentInstance.nip.setValue('5261040828');
    fixture.componentInstance.verify();
    tick();
    fixture.componentInstance.confirm();
    tick();
    expect(fixture.componentInstance.phase()).toBe('done');
    expect(fixture.componentInstance.activated()).toBe(true);
  }));

  it('confirm without email verification lands on done but not activated', fakeAsync(() => {
    const api = new FakeRegistry();
    api.confirmNext = () =>
      of({ nip: '5261040828', activated: false, accountStatus: 'IN_VALIDATION' as never });
    const fixture = create(api);
    tick();
    fixture.componentInstance.nip.setValue('5261040828');
    fixture.componentInstance.verify();
    tick();
    fixture.componentInstance.confirm();
    tick();
    expect(fixture.componentInstance.phase()).toBe('done');
    expect(fixture.componentInstance.activated()).toBe(false);
  }));

  it('confirm errors return to preview with the BE message', fakeAsync(() => {
    const api = new FakeRegistry();
    api.confirmNext = () =>
      throwError(() => ({ status: 409, error: { message: 'no longer active' } }));
    const fixture = create(api);
    tick();
    fixture.componentInstance.nip.setValue('5261040828');
    fixture.componentInstance.verify();
    tick();
    fixture.componentInstance.confirm();
    tick();
    expect(fixture.componentInstance.phase()).toBe('preview');
    expect(fixture.componentInstance.errorMessage()).toContain('no longer active');
  }));
});
