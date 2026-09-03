import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AddressDtoOut } from '../../api/model/address-dto-out';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { AddressApi } from '../../core/address/address.service';
import { UserApiService } from '../../core/user/user.service';
import { AddressesComponent } from './addresses.component';

const USER: UserDtoOut = {
  id: 42,
  email: 'maja@example.com',
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
  addresses: [{ id: 1, street: 'A 1', city: 'X', addressType: 'MAIN' }],
};

class FakeUserApi {
  next: () => Observable<UserDtoOut> = () => of({ ...USER });
  getCurrent(): Observable<UserDtoOut> {
    return this.next();
  }
}

class FakeAddressApi {
  createNext: () => Observable<AddressDtoOut> = () =>
    of({
      id: 99,
      street: 'B 2',
      city: 'Y',
      postalCode: '00-001',
      country: 'PL',
      addressType: 'BILLING',
    } as AddressDtoOut);
  patchCalls: { id: number; dto: unknown }[] = [];
  patchNext: () => Observable<AddressDtoOut> = () =>
    of({
      id: 1,
      street: 'Edited 5',
      city: 'Z',
      postalCode: '11-111',
      country: 'PL',
    } as AddressDtoOut);
  removeCalls: number[] = [];
  removeNext: () => Observable<unknown> = () => of({});
  createForUser(): Observable<AddressDtoOut> {
    return this.createNext();
  }
  patch(id: number, dto: unknown): Observable<AddressDtoOut> {
    this.patchCalls.push({ id, dto });
    return this.patchNext();
  }
  remove(id: number): Observable<unknown> {
    this.removeCalls.push(id);
    return this.removeNext();
  }
}

function create(
  userApi: FakeUserApi,
  addressApi: FakeAddressApi,
): ComponentFixture<AddressesComponent> {
  TestBed.configureTestingModule({
    imports: [
      AddressesComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      { provide: UserApiService, useValue: userApi },
      { provide: AddressApi, useValue: addressApi },
    ],
  });
  const fixture = TestBed.createComponent(AddressesComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AddressesComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('hydrates addresses list from loaded user', fakeAsync(() => {
    const fixture = create(new FakeUserApi(), new FakeAddressApi());
    tick();
    expect(fixture.componentInstance.state()).toBe('loaded');
    expect(fixture.componentInstance.addresses().length).toBe(1);
  }));

  it('flips to error on user load failure', fakeAsync(() => {
    const userApi = new FakeUserApi();
    userApi.next = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = create(userApi, new FakeAddressApi());
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
  }));

  it('startAdd opens form, cancelAdd closes it', fakeAsync(() => {
    const fixture = create(new FakeUserApi(), new FakeAddressApi());
    tick();
    expect(fixture.componentInstance.addingMode()).toBe(false);
    fixture.componentInstance.startAdd();
    expect(fixture.componentInstance.addingMode()).toBe(true);
    fixture.componentInstance.cancelAdd();
    expect(fixture.componentInstance.addingMode()).toBe(false);
  }));

  it('saveNew appends created address to the list and closes the form', fakeAsync(() => {
    const fixture = create(new FakeUserApi(), new FakeAddressApi());
    tick();
    fixture.componentInstance.startAdd();
    fixture.componentInstance.form.setValue({
      street: 'B 2',
      city: 'Y',
      postalCode: '00-001',
      country: 'PL',
      state: '',
      additionalInfo: '',
      addressType: fixture.componentInstance.addressTypes[0],
      primary: false,
    });
    fixture.componentInstance.saveNew();
    tick();
    expect(fixture.componentInstance.addresses().length).toBe(2);
    expect(fixture.componentInstance.addingMode()).toBe(false);
  }));

  it('saveNew classifies 400 as invalid_input and keeps form open', fakeAsync(() => {
    const addressApi = new FakeAddressApi();
    addressApi.createNext = () => throwError(() => new HttpErrorResponse({ status: 400 }));
    const fixture = create(new FakeUserApi(), addressApi);
    tick();
    fixture.componentInstance.startAdd();
    fixture.componentInstance.form.setValue({
      street: 'B 2',
      city: 'Y',
      postalCode: '00-001',
      country: 'PL',
      state: '',
      additionalInfo: '',
      addressType: fixture.componentInstance.addressTypes[0],
      primary: false,
    });
    fixture.componentInstance.saveNew();
    tick();
    expect(fixture.componentInstance.saveErrorKey()).toBe('addresses.error.invalid_input');
    expect(fixture.componentInstance.addingMode()).toBe(true);
  }));

  it('startEdit pre-populates the form; saveEdit patches and updates the row in place', fakeAsync(() => {
    const addressApi = new FakeAddressApi();
    const fixture = create(new FakeUserApi(), addressApi);
    tick();
    const c = fixture.componentInstance;

    c.startEdit(c.addresses()[0]!);
    expect(c.editingId()).toBe(1);
    expect(c.form.controls.street.value).toBe('A 1');
    expect(c.addingMode()).toBe(false);

    c.form.patchValue({ street: 'Edited 5', postalCode: '11-111', country: 'PL' });
    c.save();
    tick();

    expect(addressApi.patchCalls).toHaveLength(1);
    expect(addressApi.patchCalls[0]?.id).toBe(1);
    expect(c.addresses()[0]?.street).toBe('Edited 5');
    expect(c.editingId()).toBeNull();
  }));

  it('armed delete removes the row on confirm and never fires on cancel', fakeAsync(() => {
    const addressApi = new FakeAddressApi();
    const fixture = create(new FakeUserApi(), addressApi);
    tick();
    const c = fixture.componentInstance;
    const row = c.addresses()[0]!;

    c.armDelete(row);
    expect(c.deleteArmedId()).toBe(1);
    c.cancelDelete();
    expect(c.deleteArmedId()).toBeNull();
    expect(addressApi.removeCalls).toHaveLength(0);

    c.armDelete(row);
    c.confirmDelete(row);
    tick();
    expect(addressApi.removeCalls).toEqual([1]);
    expect(c.addresses()).toHaveLength(0);
  }));

  it('delete failure surfaces delete_failed and keeps the row', fakeAsync(() => {
    const addressApi = new FakeAddressApi();
    addressApi.removeNext = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = create(new FakeUserApi(), addressApi);
    tick();
    const c = fixture.componentInstance;
    c.confirmDelete(c.addresses()[0]!);
    tick();
    expect(c.saveErrorKey()).toBe('addresses.error.delete_failed');
    expect(c.addresses()).toHaveLength(1);
  }));
});
