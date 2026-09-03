import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { StepUpAuthControllerService as GeneratedStepUpAuthService } from '../../api/api/step-up-auth-controller.api';
import { StepUpActionType } from '../../api/model/step-up-action-type';
import type { StepUpCheckResponse } from '../../api/model/step-up-check-response';
import type { StepUpRequestResponse } from '../api-frozen/hidden-models';
import type { StepUpTokenResponse } from '../../api/model/step-up-token-response';

/**
 * Wrapper around the generated step-up auth client. Hides the codegen's
 * `requestParameters` envelope and exposes the three calls the BE flow
 * needs:
 *
 *   check    — does this user need step-up for the given action? (cheap GET)
 *   request  — send the email code (or noop for TOTP)
 *   verify   — exchange the 6-digit code for a single-use X-Step-Up-Token
 *
 * The token returned by verify() is consumed once by the next critical write
 * via the `X-Step-Up-Token` header (BE deletes it on read — no client-side
 * caching needed).
 */
@Injectable({ providedIn: 'root' })
export class StepUpService {
  private readonly api = inject(GeneratedStepUpAuthService);

  check(action: StepUpActionType): Observable<StepUpCheckResponse> {
    return this.api.checkRequirement({ actionType: action });
  }

  request(action: StepUpActionType): Observable<StepUpRequestResponse> {
    return this.api.requestCode({ stepUpRequestDto: { actionType: action } });
  }

  verify(action: StepUpActionType, code: string): Observable<StepUpTokenResponse> {
    return this.api.verify({ stepUpVerifyDto: { actionType: action, code } });
  }
}

export { StepUpActionType } from '../../api/model/step-up-action-type';
export { StepUpChallengeType } from '../../api/model/step-up-challenge-type';
