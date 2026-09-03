/**
 * L0 contract: StepUpService ↔ generated models. Compile-time only;
 * see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { StepUpService } from '../../app/core/step-up/step-up.service';
import type { StepUpActionType } from '../../app/api/model/step-up-action-type';
import type { StepUpCheckResponse } from '../../app/api/model/step-up-check-response';
import type { StepUpRequestResponse } from '../../app/core/api-frozen/hidden-models';
import type { StepUpTokenResponse } from '../../app/api/model/step-up-token-response';
import type { Equal, Expect } from '../type-assert';

type _check = Expect<
  Equal<StepUpService['check'], (action: StepUpActionType) => Observable<StepUpCheckResponse>>
>;

type _request = Expect<
  Equal<StepUpService['request'], (action: StepUpActionType) => Observable<StepUpRequestResponse>>
>;

type _verify = Expect<
  Equal<
    StepUpService['verify'],
    (action: StepUpActionType, code: string) => Observable<StepUpTokenResponse>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type StepUpContract = [_check, _request, _verify];
