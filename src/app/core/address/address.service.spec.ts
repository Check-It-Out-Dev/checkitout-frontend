import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AddressAPIService as GeneratedAddressApiService } from '../../api/api/address-api.api';
import type { AddressDtoIn } from '../../api/model/address-dto-in';
import type { AddressDtoOut } from '../../api/model/address-dto-out';
import { AddressApi } from './address.service';

describe('AddressApi', () => {
  let service: AddressApi;
  let api: {
    createAddressForUser: jest.Mock;
    patch12: jest.Mock;
    delete12: jest.Mock;
    getPrimaryAddressByUserId: jest.Mock;
  };

  beforeEach(() => {
    api = {
      createAddressForUser: jest.fn(),
      patch12: jest.fn(),
      delete12: jest.fn(),
      getPrimaryAddressByUserId: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [AddressApi, { provide: GeneratedAddressApiService, useValue: api }],
    });
    service = TestBed.inject(AddressApi);
  });

  it('createForUser(userId, dto) builds the right envelope', () => {
    const dto: AddressDtoIn = {
      street: 'Marszałkowska 12',
      city: 'Warszawa',
      postalCode: '00-001',
      country: 'PL',
    } as unknown as AddressDtoIn;
    const response = { id: 7 } as unknown as AddressDtoOut;
    api.createAddressForUser.mockReturnValue(of(response));

    let received: AddressDtoOut | undefined;
    service.createForUser(42, dto).subscribe((r) => (received = r));

    expect(api.createAddressForUser).toHaveBeenCalledTimes(1);
    expect(api.createAddressForUser).toHaveBeenCalledWith({ userId: 42, addressDtoIn: dto });
    expect(received).toBe(response);
  });

  it('patch(id, dto) builds the right envelope (renames codegen patch12)', () => {
    const dto = { city: 'Kraków' } as unknown as AddressDtoIn;
    const response = { id: 7, city: 'Kraków' } as unknown as AddressDtoOut;
    api.patch12.mockReturnValue(of(response));

    let received: AddressDtoOut | undefined;
    service.patch(7, dto).subscribe((r) => (received = r));

    expect(api.patch12).toHaveBeenCalledTimes(1);
    // Greenfield-branch spec types the PATCH body as an untyped map
    // (BaseController Map<String,Object>) — the wrapper passes the DTO
    // through as `requestBody`.
    expect(api.patch12).toHaveBeenCalledWith({ id: 7, requestBody: dto });
    expect(received).toBe(response);
  });

  it('primaryForUser(userId) builds the {userId} envelope (shell profile-completeness probe)', () => {
    const response = { id: 3, city: 'Gdańsk' } as unknown as AddressDtoOut;
    api.getPrimaryAddressByUserId.mockReturnValue(of(response));

    let received: AddressDtoOut | undefined;
    service.primaryForUser(42).subscribe((r) => (received = r));

    expect(api.getPrimaryAddressByUserId).toHaveBeenCalledTimes(1);
    expect(api.getPrimaryAddressByUserId).toHaveBeenCalledWith({ userId: 42 });
    expect(received).toBe(response);
  });

  it('remove(id) wraps single id into the {ids: [id]} array envelope', () => {
    // BE accepts batch deletes; the FE callers all want single-id delete
    // ergonomics. The wrapper hides the array, so a regression that
    // sent `{id: 7}` instead of `{ids: [7]}` would silently 400 every
    // delete-address action.
    api.delete12.mockReturnValue(of(undefined));

    service.remove(7).subscribe();

    expect(api.delete12).toHaveBeenCalledTimes(1);
    expect(api.delete12).toHaveBeenCalledWith({ ids: [7] });
  });

  it('passes dto by reference — no clone (caller mutation reaches BE)', () => {
    const dto = { city: 'Sopot' } as unknown as AddressDtoIn;
    api.createAddressForUser.mockReturnValue(of({} as AddressDtoOut));

    service.createForUser(1, dto).subscribe();

    const callArg = api.createAddressForUser.mock.calls[0]?.[0];
    expect(callArg.addressDtoIn).toBe(dto);
  });
});
