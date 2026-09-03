import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StepUpAuthControllerService as GeneratedStepUpAuthService } from '../../api/api/step-up-auth-controller.api';
import { StepUpActionType } from '../../api/model/step-up-action-type';
import type { StepUpCheckResponse } from '../../api/model/step-up-check-response';
import type { StepUpRequestResponse } from '../api-frozen/hidden-models';
import type { StepUpTokenResponse } from '../../api/model/step-up-token-response';
import { StepUpService } from './step-up.service';

describe('StepUpService', () => {
  let service: StepUpService;
  let api: {
    checkRequirement: jest.Mock;
    requestCode: jest.Mock;
    verify: jest.Mock;
  };

  beforeEach(() => {
    api = {
      checkRequirement: jest.fn(),
      requestCode: jest.fn(),
      verify: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [StepUpService, { provide: GeneratedStepUpAuthService, useValue: api }],
    });
    service = TestBed.inject(StepUpService);
  });

  it('check() calls the generated checkRequirement with { actionType }', () => {
    const response: StepUpCheckResponse = {
      required: true,
      challenge: 'EMAIL_CODE',
    } as unknown as StepUpCheckResponse;
    api.checkRequirement.mockReturnValue(of(response));

    let received: StepUpCheckResponse | undefined;
    service.check(StepUpActionType.EMAIL_CHANGE).subscribe((r) => (received = r));

    expect(api.checkRequirement).toHaveBeenCalledTimes(1);
    expect(api.checkRequirement).toHaveBeenCalledWith({
      actionType: StepUpActionType.EMAIL_CHANGE,
    });
    expect(received).toBe(response);
  });

  it('request() wraps the action in the stepUpRequestDto envelope', () => {
    const response: StepUpRequestResponse = {
      challenge: 'EMAIL_CODE',
      message: 'Sent',
    } as unknown as StepUpRequestResponse;
    api.requestCode.mockReturnValue(of(response));

    let received: StepUpRequestResponse | undefined;
    service.request(StepUpActionType.PASSWORD_CHANGE).subscribe((r) => (received = r));

    expect(api.requestCode).toHaveBeenCalledTimes(1);
    expect(api.requestCode).toHaveBeenCalledWith({
      stepUpRequestDto: { actionType: StepUpActionType.PASSWORD_CHANGE },
    });
    expect(received).toBe(response);
  });

  it('verify() wraps action + code in the stepUpVerifyDto envelope', () => {
    const response: StepUpTokenResponse = {
      token: 'opaque-step-up-token',
    } as unknown as StepUpTokenResponse;
    api.verify.mockReturnValue(of(response));

    let received: StepUpTokenResponse | undefined;
    service.verify(StepUpActionType.EMAIL_CHANGE, '123456').subscribe((r) => (received = r));

    expect(api.verify).toHaveBeenCalledTimes(1);
    expect(api.verify).toHaveBeenCalledWith({
      stepUpVerifyDto: {
        actionType: StepUpActionType.EMAIL_CHANGE,
        code: '123456',
      },
    });
    expect(received).toBe(response);
  });

  it('passes the code through verbatim (no trimming / normalisation)', () => {
    // Some flows might pass codes with leading/trailing whitespace from
    // paste. The wrapper should NOT trim — the BE is responsible for
    // input validation. Trimming here could mask a real "user typed
    // whitespace" UX bug.
    api.verify.mockReturnValue(of({ token: 't' } as unknown as StepUpTokenResponse));

    service.verify(StepUpActionType.EMAIL_CHANGE, '  123456  ').subscribe();

    expect(api.verify).toHaveBeenCalledWith({
      stepUpVerifyDto: {
        actionType: StepUpActionType.EMAIL_CHANGE,
        code: '  123456  ',
      },
    });
  });
});
