import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UserPreferencesControllerService as GeneratedUserPreferencesService } from '../../api/api/user-preferences-controller.api';
import type { UserPreferencesDtoIn } from '../../api/model/user-preferences-dto-in';
import type { UserPreferencesDtoOut } from '../../api/model/user-preferences-dto-out';
import { PreferencesApiService } from './preferences.service';

describe('PreferencesApiService', () => {
  let service: PreferencesApiService;
  let api: {
    getCurrentUserPreferences: jest.Mock;
    patchCurrentUserPreferences: jest.Mock;
  };

  beforeEach(() => {
    api = {
      getCurrentUserPreferences: jest.fn(),
      patchCurrentUserPreferences: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        PreferencesApiService,
        { provide: GeneratedUserPreferencesService, useValue: api },
      ],
    });
    service = TestBed.inject(PreferencesApiService);
  });

  it('getMine() delegates to getCurrentUserPreferences with no params', () => {
    const prefs = { language: 'pl' } as unknown as UserPreferencesDtoOut;
    api.getCurrentUserPreferences.mockReturnValue(of(prefs));

    let received: UserPreferencesDtoOut | undefined;
    service.getMine().subscribe((r) => (received = r));

    expect(api.getCurrentUserPreferences).toHaveBeenCalledTimes(1);
    expect(api.getCurrentUserPreferences).toHaveBeenCalledWith();
    expect(received).toBe(prefs);
  });

  it('patchMine(dto) sends the dto as the BE requestBody map', () => {
    const dto = {
      language: 'en',
      emailNotificationsEnabled: false,
    } as unknown as UserPreferencesDtoIn;
    const updated = {
      language: 'en',
      emailNotificationsEnabled: false,
    } as unknown as UserPreferencesDtoOut;
    api.patchCurrentUserPreferences.mockReturnValue(of(updated));

    let received: UserPreferencesDtoOut | undefined;
    service.patchMine(dto).subscribe((r) => (received = r));

    // BE PATCH takes an allowlisted free-form map (base-patch hardening);
    // the codegen types the param as `requestBody`, so the wrapper passes
    // the dto there.
    expect(api.patchCurrentUserPreferences).toHaveBeenCalledTimes(1);
    expect(api.patchCurrentUserPreferences).toHaveBeenCalledWith({
      requestBody: dto,
    });
    expect(received).toBe(updated);
  });

  it('patchMine() passes the dto by reference — no clone or normalisation', () => {
    // Same pattern as registry/step-up: BE owns input validation. If the
    // wrapper started shallow-cloning, callers that mutated their local
    // dto post-call (e.g. for optimistic UI) would have stale data hit
    // the BE.
    const dto = { language: 'en' } as unknown as UserPreferencesDtoIn;
    api.patchCurrentUserPreferences.mockReturnValue(of({} as UserPreferencesDtoOut));

    service.patchMine(dto).subscribe();

    const callArg = api.patchCurrentUserPreferences.mock.calls[0]?.[0];
    expect(callArg.requestBody).toBe(dto);
  });
});
