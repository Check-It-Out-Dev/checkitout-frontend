import { Observable } from 'rxjs';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { SecuritySettingsComponent } from '../../feature/settings/security-settings.component';
import type { SandboxFixture } from '../sandbox-registry';

/** Security tab (`/user/settings/security`) — password change + 2FA card. */

class StubAuthNever {
  changePassword(): Observable<unknown> {
    return new Observable<unknown>(() => undefined);
  }
}

export const SECURITY_SETTINGS_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'security-settings-default',
    label: 'Security settings · password form + 2FA card',
    component: SecuritySettingsComponent,
    providers: [{ provide: AuthApiService, useClass: StubAuthNever }],
  },
];
