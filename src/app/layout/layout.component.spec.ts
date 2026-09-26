import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { of, throwError } from 'rxjs';
import { UserApiService } from '../core/user/user.service';
import { AddressApi } from '../core/address/address.service';
import { ShellStatusService } from '../core/shell/shell-status.service';
import { PublicConfigApiService } from '../core/config/public-config.service';
import { SubscriptionApiService } from '../core/subscription/subscription.service';
import { LayoutComponent } from './layout.component';

describe('LayoutComponent', () => {
  let userApi: { getCurrent: jest.Mock };
  let addressApi: { primaryForUser: jest.Mock };
  let shellStatus: {
    setProfileMissing: jest.Mock;
    setBlockedForTerms: jest.Mock;
    setConsentPending: jest.Mock;
    setTrialOffer: jest.Mock;
  };
  let publicConfig: { paymentsEnabled: jest.Mock };
  let subscriptionApi: { getStatus: jest.Mock };
  let breakpointObserver: { observe: jest.Mock };

  function configure(): void {
    TestBed.configureTestingModule({
      imports: [
        LayoutComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { pl: {}, en: {} },
          translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: UserApiService, useValue: userApi },
        { provide: AddressApi, useValue: addressApi },
        { provide: ShellStatusService, useValue: shellStatus },
        { provide: PublicConfigApiService, useValue: publicConfig },
        { provide: SubscriptionApiService, useValue: subscriptionApi },
        { provide: BreakpointObserver, useValue: breakpointObserver },
      ],
    });
  }

  beforeEach(() => {
    userApi = { getCurrent: jest.fn().mockReturnValue(of({})) };
    addressApi = { primaryForUser: jest.fn().mockReturnValue(of({ id: 1 })) };
    shellStatus = {
      setProfileMissing: jest.fn(),
      setBlockedForTerms: jest.fn(),
      setConsentPending: jest.fn(),
      setTrialOffer: jest.fn(),
    };
    publicConfig = { paymentsEnabled: jest.fn().mockReturnValue(of(false)) };
    subscriptionApi = { getStatus: jest.fn().mockReturnValue(of({})) };
    breakpointObserver = { observe: jest.fn().mockReturnValue(of({ matches: false })) };
  });

  describe('nav surface', () => {
    it('exposes 5 standard nav entries in the expected order', () => {
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      const entries = fixture.componentInstance.navEntries().map((e) => e.route);
      expect(entries).toEqual([
        '/collaborations/list',
        '/collaborations/registrations',
        '/collaborations/my-campaigns',
        '/user/settings/account',
        '/user/settings/plan-billing',
      ]);
    });

    it('ADMIN gets the legacy admin surface (users, browse, registrations, dictionary, tickets)', () => {
      userApi.getCurrent.mockReturnValue(of({ id: 9, userType: { value: 'ADMIN' } }));
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      const entries = fixture.componentInstance.navEntries().map((e) => e.route);
      expect(entries).toEqual([
        '/user/list',
        '/collaborations/list',
        '/collaborations/registrations',
        '/admin/dictionary',
        '/support/admin/tickets',
      ]);
    });

    it('COMPANY gets the campaign-owner surface (campaigns, board, billing — no applications)', () => {
      userApi.getCurrent.mockReturnValue(of({ id: 7, userType: { value: 'COMPANY' } }));
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      const routes = fixture.componentInstance.navEntries().map((e) => e.route);
      expect(routes).toEqual([
        '/collaborations/list',
        '/collaborations/my-campaigns',
        '/collaborations/in-progress',
        '/user/settings/account',
        '/user/settings/plan-billing',
      ]);
    });

    it('INFLUENCER gets the applicant surface (applications, board — no campaigns, no billing)', () => {
      userApi.getCurrent.mockReturnValue(of({ id: 8, userType: { value: 'INFLUENCER' } }));
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      const routes = fixture.componentInstance.navEntries().map((e) => e.route);
      expect(routes).toEqual([
        '/collaborations/list',
        '/collaborations/registrations',
        '/collaborations/in-progress',
        '/user/settings/account',
      ]);
    });

    it('/users/me error → standard surface (nav never blanks)', () => {
      userApi.getCurrent.mockReturnValue(throwError(() => new Error('BE down')));
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      expect(fixture.componentInstance.navEntries()).toHaveLength(5);
    });
  });

  describe('responsive sidenav', () => {
    it('on desktop (matches=false): isMobile=false, sidenavOpen=true', () => {
      breakpointObserver.observe.mockReturnValue(of({ matches: false }));
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      expect(fixture.componentInstance.isMobile()).toBe(false);
      expect(fixture.componentInstance.sidenavOpen()).toBe(true);
    });

    it('on mobile (matches=true): isMobile=true, sidenavOpen=false', () => {
      breakpointObserver.observe.mockReturnValue(of({ matches: true }));
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      expect(fixture.componentInstance.isMobile()).toBe(true);
      expect(fixture.componentInstance.sidenavOpen()).toBe(false);
    });

    it('toggleSidenav flips the open signal', () => {
      configure();
      const fixture = TestBed.createComponent(LayoutComponent);
      const initial = fixture.componentInstance.sidenavOpen();
      fixture.componentInstance.toggleSidenav();
      expect(fixture.componentInstance.sidenavOpen()).toBe(!initial);
      fixture.componentInstance.toggleSidenav();
      expect(fixture.componentInstance.sidenavOpen()).toBe(initial);
    });
  });

  describe('profile-missing detection on shell mount', () => {
    it('fully-populated user → setProfileMissing([])', () => {
      userApi.getCurrent.mockReturnValue(
        of({
          firstName: 'Acme',
          lastName: 'Studios',
          phoneNumber: '+48123456789',
        }),
      );
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setProfileMissing).toHaveBeenCalledTimes(1);
      expect(shellStatus.setProfileMissing).toHaveBeenCalledWith([]);
    });

    it('missing firstName → reports ["firstName"]', () => {
      userApi.getCurrent.mockReturnValue(of({ firstName: '', lastName: 'A', phoneNumber: '1' }));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setProfileMissing).toHaveBeenCalledWith(['firstName']);
    });

    it('all three missing → ["firstName", "lastName", "phone"]', () => {
      userApi.getCurrent.mockReturnValue(of({}));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setProfileMissing).toHaveBeenCalledWith([
        'firstName',
        'lastName',
        'phone',
      ]);
    });

    it('whitespace-only fields counted as missing', () => {
      userApi.getCurrent.mockReturnValue(of({ firstName: '  ', lastName: 'A', phoneNumber: '\t' }));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setProfileMissing).toHaveBeenCalledWith(['firstName', 'phone']);
    });

    it('/users/me error: leaves the missing-fields signal untouched (banner stays hidden)', () => {
      userApi.getCurrent.mockReturnValue(throwError(() => new Error('BE down')));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setProfileMissing).not.toHaveBeenCalled();
    });
  });

  describe('primary-address + NIP derivation (parity sweep finding B)', () => {
    it('appends primaryAddress when the primary-address probe 404s', () => {
      userApi.getCurrent.mockReturnValue(
        of({ id: 7, firstName: 'A', lastName: 'B', phoneNumber: '1' }),
      );
      addressApi.primaryForUser.mockReturnValue(throwError(() => new Error('404')));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(addressApi.primaryForUser).toHaveBeenCalledWith(7);
      expect(shellStatus.setProfileMissing).toHaveBeenLastCalledWith(['primaryAddress']);
    });

    it('flags nip for COMPANY users without one', () => {
      userApi.getCurrent.mockReturnValue(
        of({
          id: 7,
          firstName: 'A',
          lastName: 'B',
          phoneNumber: '1',
          userType: { value: 'COMPANY' },
        }),
      );
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setProfileMissing).toHaveBeenCalledWith(['nip']);
    });
  });

  describe('trial-offer probe (audit P1)', () => {
    const COMPANY_USER = { id: 7, userType: { value: 'COMPANY' } };

    it('eligible free company on a payments-enabled deploy → setTrialOffer(true)', () => {
      userApi.getCurrent.mockReturnValue(of(COMPANY_USER));
      publicConfig.paymentsEnabled.mockReturnValue(of(true));
      subscriptionApi.getStatus.mockReturnValue(
        of({ trialEligible: true, trialUsed: false, status: 'FREE_ACTIVE' }),
      );
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setTrialOffer).toHaveBeenCalledWith(true);
    });

    it('payments disabled → the /subscription/status probe never fires', () => {
      userApi.getCurrent.mockReturnValue(of(COMPANY_USER));
      publicConfig.paymentsEnabled.mockReturnValue(of(false));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(subscriptionApi.getStatus).not.toHaveBeenCalled();
      expect(shellStatus.setTrialOffer).not.toHaveBeenCalled();
    });

    it('influencer → neither the config nor the status probe fires', () => {
      userApi.getCurrent.mockReturnValue(of({ id: 8, userType: { value: 'INFLUENCER' } }));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(publicConfig.paymentsEnabled).not.toHaveBeenCalled();
      expect(subscriptionApi.getStatus).not.toHaveBeenCalled();
    });

    it('trial already used → setTrialOffer(false)', () => {
      userApi.getCurrent.mockReturnValue(of(COMPANY_USER));
      publicConfig.paymentsEnabled.mockReturnValue(of(true));
      subscriptionApi.getStatus.mockReturnValue(
        of({ trialEligible: false, trialUsed: true, status: 'FREE_ACTIVE' }),
      );
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setTrialOffer).toHaveBeenCalledWith(false);
    });

    it('status probe error → silent no-op, nudge stays hidden', () => {
      userApi.getCurrent.mockReturnValue(of(COMPANY_USER));
      publicConfig.paymentsEnabled.mockReturnValue(of(true));
      subscriptionApi.getStatus.mockReturnValue(throwError(() => new Error('403')));
      configure();
      TestBed.createComponent(LayoutComponent);
      expect(shellStatus.setTrialOffer).not.toHaveBeenCalled();
    });
  });
});
