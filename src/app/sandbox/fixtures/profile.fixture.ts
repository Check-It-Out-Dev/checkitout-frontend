import { Observable, of } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UserApiService } from '../../core/user/user.service';
import { ProfileViewComponent } from '../../feature/profile/profile-view.component';
import type { SandboxFixture } from '../sandbox-registry';

const SAMPLE_INFLUENCER: UserDtoOut = {
  id: 42,
  firebaseUserId: 'fb-influencer-42',
  email: 'maja.kowalska@example.com',
  emailVerified: true,
  firstName: 'Maja',
  lastName: 'Kowalska',
  name: 'Maja Kowalska',
  phoneNumber: '+48 123 456 789',
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
  createdTime: '2025-04-01T10:00:00.000Z',
  profileComplete: true,
  newestConsentsAccepted: true,
};

const SAMPLE_COMPANY: UserDtoOut = {
  id: 17,
  firebaseUserId: 'fb-company-17',
  email: 'biuro@acme.studios',
  emailVerified: true,
  name: 'Acme Studios sp. z o.o.',
  nip: '5252447777',
  userType: { value: 'COMPANY', label: 'Company' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
  createdTime: '2024-11-12T08:30:00.000Z',
  profileComplete: false,
  premium: true,
};

class StubUserApiInfluencer {
  getCurrent(): Observable<UserDtoOut> {
    return of(SAMPLE_INFLUENCER);
  }
  patch(): Observable<UserDtoOut> {
    return of(SAMPLE_INFLUENCER);
  }
}

class StubUserApiCompany {
  getCurrent(): Observable<UserDtoOut> {
    return of(SAMPLE_COMPANY);
  }
  patch(): Observable<UserDtoOut> {
    return of(SAMPLE_COMPANY);
  }
}

class StubUserApiPending {
  // Never completes — keeps the spinner up for snapshot stability.
  getCurrent(): Observable<UserDtoOut> {
    return new Observable<UserDtoOut>(() => undefined);
  }
}

class StubUserApiError {
  getCurrent(): Observable<UserDtoOut> {
    return new Observable<UserDtoOut>((sub) => {
      sub.error({ status: 500, statusText: 'Internal Server Error' });
    });
  }
}

export const PROFILE_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'profile-loading',
    label: 'Profile · loading',
    component: ProfileViewComponent,
    providers: [{ provide: UserApiService, useClass: StubUserApiPending }],
  },
  {
    id: 'profile-influencer',
    label: 'Profile · influencer',
    component: ProfileViewComponent,
    providers: [{ provide: UserApiService, useClass: StubUserApiInfluencer }],
  },
  {
    id: 'profile-company',
    label: 'Profile · company',
    component: ProfileViewComponent,
    providers: [{ provide: UserApiService, useClass: StubUserApiCompany }],
  },
  {
    id: 'profile-error',
    label: 'Profile · error',
    component: ProfileViewComponent,
    providers: [{ provide: UserApiService, useClass: StubUserApiError }],
  },
];
