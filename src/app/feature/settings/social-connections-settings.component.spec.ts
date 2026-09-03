import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { SocialConnectionsApi } from '../../core/social/social-connections.service';
import { SocialAuthService } from '../../core/auth/social-auth.service';
import { ConnectionStatus } from '../../api/model/connection-status';
import type { UserSocialConnectionDtoOut } from '../../api/model/user-social-connection-dto-out';
import { SocialConnectionsSettingsComponent } from './social-connections-settings.component';

describe('SocialConnectionsSettingsComponent', () => {
  let fixture: ComponentFixture<SocialConnectionsSettingsComponent>;
  let host: HTMLElement;
  let api: { list: jest.Mock; disconnect: jest.Mock };
  let socialAuth: { starting: () => boolean; startOAuthFlow: jest.Mock };

  const CONNECTION: UserSocialConnectionDtoOut = {
    id: 11,
    platform: { id: 1, name: 'Instagram', active: true, contentTypes: new Set() },
    socialUserId: 'ania.moda',
    displayName: 'Ania Moda',
    followersCount: 12800,
    connectionStatus: ConnectionStatus.CONNECTED,
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [
        SocialConnectionsSettingsComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        { provide: SocialConnectionsApi, useValue: api },
        { provide: SocialAuthService, useValue: socialAuth },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SocialConnectionsSettingsComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = {
      list: jest.fn().mockReturnValue(of({ content: [CONNECTION], totalElements: 1 })),
      disconnect: jest.fn().mockReturnValue(of({})),
    };
    socialAuth = { starting: () => false, startOAuthFlow: jest.fn().mockReturnValue(true) };
  });

  it('lists connections with handle, platform and the connected chip', async () => {
    await setup();
    const row = host.querySelector('[data-testid="social-connection-11"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Ania Moda');
    expect(row!.textContent).toContain('Instagram');
    expect(host.querySelector('[data-testid="social-connections-empty"]')).toBeNull();
  });

  it('shows the empty CTA when nothing is connected', async () => {
    api.list.mockReturnValue(of({ content: [], totalElements: 0 }));
    await setup();
    expect(host.querySelector('[data-testid="social-connections-empty"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="social-connections-list"]')).toBeNull();
  });

  it('shows the error state with a retry that reloads', async () => {
    api.list.mockReturnValueOnce(throwError(() => new Error('boom')));
    await setup();
    expect(host.querySelector('[data-testid="social-connections-error"]')).not.toBeNull();
    host
      .querySelector<HTMLButtonElement>('[data-testid="social-connections-error"] button')!
      .click();
    fixture.detectChanges();
    // second list() call succeeded → the row renders
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-testid="social-connection-11"]')).not.toBeNull();
  });

  it('disconnect removes the row on success and guards re-entry while busy', async () => {
    const pending = new Subject<unknown>();
    api.disconnect.mockReturnValue(pending);
    await setup();
    const btn = host.querySelector<HTMLButtonElement>('[data-testid="social-disconnect-11"]')!;
    btn.click();
    fixture.detectChanges();
    // busy: a second click must not fire a second request
    fixture.componentInstance.disconnect(CONNECTION);
    expect(api.disconnect).toHaveBeenCalledTimes(1);
    expect(api.disconnect).toHaveBeenCalledWith(11);
    pending.next({});
    pending.complete();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="social-connection-11"]')).toBeNull();
  });

  it('the connect button starts the Instagram OAuth flow', async () => {
    await setup();
    host.querySelector<HTMLButtonElement>('[data-testid="social-connect-instagram"]')!.click();
    expect(socialAuth.startOAuthFlow).toHaveBeenCalledWith('instagram');
  });

  it('surfaces the unsupported-platform message when the flow refuses', async () => {
    socialAuth.startOAuthFlow.mockReturnValue(false);
    await setup();
    host.querySelector<HTMLButtonElement>('[data-testid="social-connect-instagram"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="social-connect-error"]')).not.toBeNull();
  });
});
