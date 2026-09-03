import type { UserDtoOut } from '../../app/api/model/user-dto-out';
import { mergeDto, type DeepPartial } from './merge';

/**
 * Company-side account: the Kraków café that owns the canonical campaign
 * from `buildOpportunity`. Verified, profile complete, consents current —
 * override the flags to build the blocked/banner states.
 */
export function buildCompanyUser(overrides?: DeepPartial<UserDtoOut>): UserDtoOut {
  return mergeDto<UserDtoOut>(
    {
      id: 101,
      firebaseUserId: 'firebase-company-101',
      userType: { value: 'COMPANY', label: 'Firma' },
      email: 'kontakt@zloteziarno.pl',
      name: 'Kawiarnia Złote Ziarno',
      companyDescription: 'Kameralna kawiarnia specialty w sercu Kazimierza.',
      nip: '6762459812',
      phoneNumber: '+48 12 421 33 44',
      accountStatus: { value: 'ACTIVE', label: 'Aktywne', canLogin: true, active: true },
      addresses: [],
      socialConnections: [],
      premium: false,
      emailVerified: true,
      profileComplete: true,
      profileMissingFields: [],
      newestConsentsAccepted: true,
      initialAccountSetupCompleted: true,
      createdTime: '2026-01-10T08:00:00',
      lastUpdateTime: '2026-06-01T11:20:00',
    },
    overrides,
  );
}

/** Influencer account matching the `buildApplication` applicant. */
export function buildInfluencerUser(overrides?: DeepPartial<UserDtoOut>): UserDtoOut {
  return mergeDto<UserDtoOut>(
    {
      id: 301,
      firebaseUserId: 'firebase-influencer-301',
      userType: { value: 'INFLUENCER', label: 'Twórca' },
      email: 'marta.vlogs@example.com',
      firstName: 'Marta',
      lastName: 'Wiśniewska',
      name: 'Marta Vlogs',
      accountStatus: { value: 'ACTIVE', label: 'Aktywne', canLogin: true, active: true },
      addresses: [],
      socialConnections: [],
      premium: false,
      emailVerified: true,
      profileComplete: true,
      profileMissingFields: [],
      newestConsentsAccepted: true,
      initialAccountSetupCompleted: true,
      createdTime: '2026-02-14T09:30:00',
      lastUpdateTime: '2026-06-18T16:45:00',
    },
    overrides,
  );
}
