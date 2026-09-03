import { Observable, of } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import type { StepUpRequestResponse } from '../../core/api-frozen/hidden-models';
import type { StepUpTokenResponse } from '../../api/model/step-up-token-response';
import { StepUpChallengeType } from '../../api/model/step-up-challenge-type';
import { StepUpService } from '../../core/step-up/step-up.service';
import { UserApiService } from '../../core/user/user.service';
import { EmailChangeComponent } from '../../feature/profile/email-change.component';
import type { SandboxFixture } from '../sandbox-registry';

const USER: UserDtoOut = {
  id: 42,
  firebaseUserId: 'fb-influencer-42',
  email: 'maja.kowalska@example.com',
  emailVerified: true,
  firstName: 'Maja',
  lastName: 'Kowalska',
  name: 'Maja Kowalska',
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
};

class StubUserApiOk {
  getCurrent(): Observable<UserDtoOut> {
    return of(USER);
  }
  patch(): Observable<UserDtoOut> {
    return of(USER);
  }
}

class StubStepUpOk {
  request(): Observable<StepUpRequestResponse> {
    return of({
      success: true,
      required: true,
      challengeType: StepUpChallengeType.EMAIL_CODE,
    });
  }
  verify(): Observable<StepUpTokenResponse> {
    return of({ success: true, token: 'fixture-token' });
  }
}

export const EMAIL_CHANGE_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'email-change-collapsed',
    label: 'Email change · collapsed',
    component: EmailChangeComponent,
    inputs: { user: USER },
    viewport: { width: 560, height: 200 },
    providers: [
      { provide: UserApiService, useClass: StubUserApiOk },
      { provide: StepUpService, useClass: StubStepUpOk },
    ],
  },
];
