import { of, throwError } from 'rxjs';
import { SocialConnectionsSettingsComponent } from '../../feature/settings/social-connections-settings.component';
import { SocialConnectionsApi } from '../../core/social/social-connections.service';
import { ConnectionStatus } from '../../api/model/connection-status';
import type { UserSocialConnectionDtoOut } from '../../api/model/user-social-connection-dto-out';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Settings › Social connections fixtures — loaded (a CONNECTED Instagram
 * with reach + an EXPIRED one that needs re-auth), empty (the connect CTA)
 * and error (retry). The wrapper is stubbed at the fixture injector; the
 * OAuth service stays real (it does nothing until the button navigates).
 */
const CONNECTED: UserSocialConnectionDtoOut = {
  id: 11,
  platform: { id: 1, name: 'Instagram', active: true, contentTypes: new Set() },
  socialUserId: 'ania.moda',
  displayName: 'Ania Moda',
  followersCount: 12800,
  isPrimary: true,
  connectionStatus: ConnectionStatus.CONNECTED,
};

const EXPIRED: UserSocialConnectionDtoOut = {
  id: 12,
  platform: { id: 1, name: 'Instagram', active: true, contentTypes: new Set() },
  socialUserId: 'ania.podroze',
  displayName: 'Ania w podróży',
  followersCount: 3400,
  connectionStatus: ConnectionStatus.EXPIRED,
};

const stub = (connections: UserSocialConnectionDtoOut[] | 'error') => ({
  provide: SocialConnectionsApi,
  useValue: {
    list: () =>
      connections === 'error'
        ? throwError(() => new Error('boom'))
        : of({ content: connections, totalElements: connections.length }),
    disconnect: () => of({}),
  },
});

export const SOCIAL_CONNECTIONS_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'social-connections-loaded',
    label: 'Settings · Social connections — connected + expired',
    component: SocialConnectionsSettingsComponent,
    providers: [stub([CONNECTED, EXPIRED])],
  },
  {
    id: 'social-connections-empty',
    label: 'Settings · Social connections — empty (connect CTA)',
    component: SocialConnectionsSettingsComponent,
    providers: [stub([])],
  },
  {
    id: 'social-connections-error',
    label: 'Settings · Social connections — load error',
    component: SocialConnectionsSettingsComponent,
    providers: [stub('error')],
  },
];
