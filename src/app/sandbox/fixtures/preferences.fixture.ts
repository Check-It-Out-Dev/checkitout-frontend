import { Observable, of } from 'rxjs';
import type { UserPreferencesDtoOut } from '../../api/model/user-preferences-dto-out';
import { PreferencesApiService } from '../../core/preferences/preferences.service';
import { PreferencesComponent } from '../../feature/preferences/preferences.component';
import type { SandboxFixture } from '../sandbox-registry';

const SAMPLE: UserPreferencesDtoOut = {
  id: 1,
  userId: 42,
  notificationEmailEnabled: true,
  notificationPushEnabled: true,
  notificationSmsEnabled: false,
  notificationPartnershipEnabled: true,
  notificationSupportEnabled: true,
  notificationSystemEnabled: true,
  notificationEmailPartnershipEnabled: true,
  notificationEmailSupportEnabled: false,
  communicationFrequency: 'WEEKLY_DIGEST' as UserPreferencesDtoOut['communicationFrequency'],
  sharePhoneForPayments: false,
  gdprMarketingConsent: false,
  language: 'pl' as UserPreferencesDtoOut['language'],
  timezone: 'Europe/Warsaw',
};

class StubPrefsApi {
  getMine(): Observable<UserPreferencesDtoOut> {
    return of(SAMPLE);
  }
  patchMine(): Observable<UserPreferencesDtoOut> {
    return of(SAMPLE);
  }
}

class StubPrefsApiError {
  getMine(): Observable<UserPreferencesDtoOut> {
    return new Observable<UserPreferencesDtoOut>((sub) => {
      sub.error({ status: 500, statusText: 'Internal Server Error' });
    });
  }
  patchMine(): Observable<UserPreferencesDtoOut> {
    return of(SAMPLE);
  }
}

export const PREFERENCES_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'preferences-loaded',
    label: 'Preferences · loaded',
    component: PreferencesComponent,
    providers: [{ provide: PreferencesApiService, useClass: StubPrefsApi }],
  },
  {
    id: 'preferences-error',
    label: 'Preferences · load error',
    component: PreferencesComponent,
    providers: [{ provide: PreferencesApiService, useClass: StubPrefsApiError }],
  },
];
