import { Observable, of } from 'rxjs';
import type { AddressDtoOut } from '../../api/model/address-dto-out';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { AddressApi } from '../../core/address/address.service';
import { UserApiService } from '../../core/user/user.service';
import { AddressesComponent } from '../../feature/addresses/addresses.component';
import type { SandboxFixture } from '../sandbox-registry';

const USER_WITH_ADDRESSES: UserDtoOut = {
  id: 42,
  email: 'maja@example.com',
  name: 'Maja Kowalska',
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
  addresses: [
    {
      id: 1,
      street: 'Marszałkowska 100',
      city: 'Warszawa',
      postalCode: '00-001',
      country: 'PL',
      addressType: 'MAIN',
      primary: true,
    },
    {
      id: 2,
      street: 'Plac Solny 12',
      city: 'Wrocław',
      postalCode: '50-061',
      country: 'PL',
      addressType: 'BILLING',
      primary: false,
    },
  ],
};

const USER_NO_ADDRESSES: UserDtoOut = {
  id: 43,
  email: 'newbie@example.com',
  name: 'Anna Nowak',
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
  addresses: [],
};

class StubUserApiWith {
  getCurrent(): Observable<UserDtoOut> {
    return of(USER_WITH_ADDRESSES);
  }
  patch(): Observable<UserDtoOut> {
    return of(USER_WITH_ADDRESSES);
  }
}

class StubUserApiEmpty {
  getCurrent(): Observable<UserDtoOut> {
    return of(USER_NO_ADDRESSES);
  }
  patch(): Observable<UserDtoOut> {
    return of(USER_NO_ADDRESSES);
  }
}

class StubAddressApi {
  createForUser(): Observable<AddressDtoOut> {
    return of({
      id: 99,
      street: 'New Street 1',
      city: 'Warszawa',
      postalCode: '00-002',
      country: 'PL',
      addressType: 'MAIN',
      primary: false,
    } as AddressDtoOut);
  }
  patch(): Observable<AddressDtoOut> {
    return of({} as AddressDtoOut);
  }
  remove(): Observable<unknown> {
    return of(undefined);
  }
}

export const ADDRESSES_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'addresses-with-list',
    label: 'Addresses · with two addresses',
    component: AddressesComponent,
    providers: [
      { provide: UserApiService, useClass: StubUserApiWith },
      { provide: AddressApi, useClass: StubAddressApi },
    ],
  },
  {
    id: 'addresses-empty',
    label: 'Addresses · empty state',
    component: AddressesComponent,
    providers: [
      { provide: UserApiService, useClass: StubUserApiEmpty },
      { provide: AddressApi, useClass: StubAddressApi },
    ],
  },
];
