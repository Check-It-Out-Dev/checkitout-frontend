import { AddressSourceType } from '../../app/api/model/address-source-type';
import type { AddressDtoOut } from '../../app/api/model/address-dto-out';
import { mergeDto, type DeepPartial } from './merge';

/** The café's business address (matches `buildCompanyUser`, Kazimierz). */
export function buildAddress(overrides?: DeepPartial<AddressDtoOut>): AddressDtoOut {
  return mergeDto<AddressDtoOut>(
    {
      id: 41,
      userId: 101,
      street: 'ul. Józefa 12',
      city: 'Kraków',
      postalCode: '31-056',
      country: 'Polska',
      additionalInfo: 'Wejście od podwórza',
      addressType: 'BUSINESS',
      sourceType: AddressSourceType.BUSINESS_LOCATION,
      primary: true,
      shared: false,
      copied: false,
      createdTime: '2026-01-10T08:05:00',
      lastUpdateTime: '2026-01-10T08:05:00',
    },
    overrides,
  );
}
