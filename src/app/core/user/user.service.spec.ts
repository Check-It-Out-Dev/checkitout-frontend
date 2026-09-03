import { HttpContext } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UserControllerService as GeneratedUserService } from '../../api/api/user-controller.api';
import type { UserDtoIn } from '../../api/model/user-dto-in';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { STEP_UP_TOKEN } from '../step-up/step-up-context';
import { UserApiService } from './user.service';

describe('UserApiService', () => {
  let service: UserApiService;
  let api: { getCurrentUser: jest.Mock; patch: jest.Mock };

  beforeEach(() => {
    api = {
      getCurrentUser: jest.fn(),
      patch: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [UserApiService, { provide: GeneratedUserService, useValue: api }],
    });
    service = TestBed.inject(UserApiService);
  });

  it('getCurrent() delegates to getCurrentUser with no params', () => {
    const user = { id: 1, email: 'a@b' } as unknown as UserDtoOut;
    api.getCurrentUser.mockReturnValue(of(user));

    let received: UserDtoOut | undefined;
    service.getCurrent().subscribe((r) => (received = r));

    expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(api.getCurrentUser).toHaveBeenCalledWith();
    expect(received).toBe(user);
  });

  it('patch(id, dto) without stepUpToken passes options=undefined', () => {
    const dto = { firstName: 'Alice' } as unknown as UserDtoIn;
    const updated = { id: 7, firstName: 'Alice' } as unknown as UserDtoOut;
    api.patch.mockReturnValue(of(updated));

    let received: UserDtoOut | undefined;
    service.patch(7, dto).subscribe((r) => (received = r));

    expect(api.patch).toHaveBeenCalledTimes(1);
    // BE PATCH takes an allowlisted free-form map (base-patch hardening);
    // the codegen types the param as `requestBody`.
    expect(api.patch).toHaveBeenCalledWith({ id: 7, requestBody: dto }, 'body', false, undefined);
    expect(received).toBe(updated);
  });

  it('patch(id, dto, stepUpToken) builds the step-up HttpContext', () => {
    const dto = { email: 'new@example.com' } as unknown as UserDtoIn;
    api.patch.mockReturnValue(of({} as UserDtoOut));

    service.patch(7, dto, 'totp-12345').subscribe();

    expect(api.patch).toHaveBeenCalledTimes(1);
    const [params, observe, reportProgress, options] = api.patch.mock.calls[0] ?? [];
    expect(params).toEqual({ id: 7, requestBody: dto });
    expect(observe).toBe('body');
    expect(reportProgress).toBe(false);

    // Options.context should carry the step-up token via the
    // STEP_UP_TOKEN HttpContextToken — the step-up interceptor reads
    // this token to add the X-Step-Up-Token header.
    expect(options?.context).toBeInstanceOf(HttpContext);
    expect(options?.context?.get(STEP_UP_TOKEN)).toBe('totp-12345');
  });

  it('treats empty-string stepUpToken as truthy → builds context', () => {
    // Edge case: callers passing '' (empty string) — the truthy check
    // in the service uses `stepUpToken ?` which treats '' as falsy, so
    // empty-string SHOULD result in no context (verifies the negative-
    // case branch).
    const dto = { firstName: 'A' } as unknown as UserDtoIn;
    api.patch.mockReturnValue(of({} as UserDtoOut));

    service.patch(7, dto, '').subscribe();

    const options = api.patch.mock.calls[0]?.[3];
    expect(options).toBeUndefined();
  });

  it('passes dto by reference — no clone', () => {
    const dto = { firstName: 'A' } as unknown as UserDtoIn;
    api.patch.mockReturnValue(of({} as UserDtoOut));

    service.patch(7, dto).subscribe();

    const params = api.patch.mock.calls[0]?.[0];
    expect(params.requestBody).toBe(dto);
  });
});
