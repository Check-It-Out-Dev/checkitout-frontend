import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { ShellStatusService } from '../../core/shell/shell-status.service';
import { ShellBannersComponent } from './shell-banners.component';

describe('ShellBannersComponent', () => {
  let fixture: ComponentFixture<ShellBannersComponent>;
  let status: ShellStatusService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ShellBannersComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideHttpClient(withXhr()), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ShellBannersComponent);
    status = TestBed.inject(ShellStatusService);
    fixture.detectChanges();
  });

  function findBanner(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  afterEach(() => localStorage.removeItem('cio.shell.trialOfferDismissed'));

  it('renders nothing when no obligations are outstanding', () => {
    expect(findBanner('shell-banner-profile-incomplete')).toBeNull();
    expect(findBanner('shell-banner-consent-required')).toBeNull();
    expect(findBanner('shell-banner-email-verification')).toBeNull();
    expect(findBanner('shell-banner-trial-offer')).toBeNull();
  });

  it('shows the trial-offer nudge with its plan-billing CTA', () => {
    status.setTrialOffer(true);
    fixture.detectChanges();

    expect(findBanner('shell-banner-trial-offer')).not.toBeNull();
    const cta = findBanner('shell-banner-trial-offer-cta');
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('href')).toBe('/user/settings/plan-billing');
  });

  it('dismissing the trial offer hides it and persists across re-eligibility', () => {
    status.setTrialOffer(true);
    fixture.detectChanges();

    (findBanner('shell-banner-trial-offer-dismiss') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(findBanner('shell-banner-trial-offer')).toBeNull();
    expect(localStorage.getItem('cio.shell.trialOfferDismissed')).toBe('1');

    // A later eligible probe must NOT resurface a dismissed nudge.
    status.setTrialOffer(true);
    fixture.detectChanges();
    expect(findBanner('shell-banner-trial-offer')).toBeNull();
  });

  it('shows the profile-incomplete banner when fields are missing', () => {
    status.setProfileMissing(['firstName', 'lastName']);
    fixture.detectChanges();

    const banner = findBanner('shell-banner-profile-incomplete');
    expect(banner).not.toBeNull();
    // CTA link to the profile-edit page is present.
    expect(findBanner('shell-banner-profile-cta')).not.toBeNull();
  });

  it('hides profile-incomplete banner when fields list is cleared', () => {
    status.setProfileMissing(['firstName']);
    fixture.detectChanges();
    expect(findBanner('shell-banner-profile-incomplete')).not.toBeNull();

    status.setProfileMissing([]);
    fixture.detectChanges();
    expect(findBanner('shell-banner-profile-incomplete')).toBeNull();
  });

  it('shows the terms-update banner when consentRequired is set', () => {
    expect(findBanner('shell-banner-consent-required')).toBeNull();

    (
      status as unknown as { _consentRequired: { set: (v: boolean) => void } }
    )._consentRequired?.set(true);
    // Use the public sticky-flip path: simulate the header-driven flip
    // via the response-headers entrypoint.
    status.noteResponseHeaders({
      get: (name: string) => (name === 'X-Consent-Required' ? '1' : null),
    } as unknown as { get(name: string): string | null });
    fixture.detectChanges();

    expect(findBanner('shell-banner-consent-required')).not.toBeNull();
  });

  it('shows the email-verification banner when emailVerificationRequired is set', () => {
    status.noteResponseHeaders({
      get: (name: string) => (name === 'X-Email-Verification-Required' ? '1' : null),
    } as unknown as { get(name: string): string | null });
    fixture.detectChanges();

    expect(findBanner('shell-banner-email-verification')).not.toBeNull();
  });

  it('renders all three banners simultaneously when all obligations are outstanding', () => {
    status.setProfileMissing(['firstName']);
    status.noteResponseHeaders({
      get: (name: string) =>
        name === 'X-Consent-Required' || name === 'X-Email-Verification-Required' ? '1' : null,
    } as unknown as { get(name: string): string | null });
    fixture.detectChanges();

    expect(findBanner('shell-banner-profile-incomplete')).not.toBeNull();
    expect(findBanner('shell-banner-consent-required')).not.toBeNull();
    expect(findBanner('shell-banner-email-verification')).not.toBeNull();
  });

  it('shows the blocked-terms banner with days remaining and clears via clearConsent', () => {
    status.setBlockedForTerms(true, 5);
    fixture.detectChanges();

    const banner = findBanner('shell-banner-blocked-terms');
    expect(banner).not.toBeNull();
    expect(findBanner('shell-banner-blocked-cta')).not.toBeNull();

    status.clearConsent();
    fixture.detectChanges();
    expect(findBanner('shell-banner-blocked-terms')).toBeNull();
  });

  it('setBlockedForTerms(false) clears the days-remaining signal', () => {
    status.setBlockedForTerms(true, 3);
    expect(status.blockedDaysRemaining()).toBe(3);
    status.setBlockedForTerms(false);
    expect(status.blockedForTerms()).toBe(false);
    expect(status.blockedDaysRemaining()).toBeNull();
  });

  it('clearConsent hides the consent banner without affecting the others', () => {
    status.setProfileMissing(['firstName']);
    status.noteResponseHeaders({
      get: (name: string) => (name === 'X-Consent-Required' ? '1' : null),
    } as unknown as { get(name: string): string | null });
    fixture.detectChanges();
    expect(findBanner('shell-banner-consent-required')).not.toBeNull();
    expect(findBanner('shell-banner-profile-incomplete')).not.toBeNull();

    status.clearConsent();
    fixture.detectChanges();

    expect(findBanner('shell-banner-consent-required')).toBeNull();
    expect(findBanner('shell-banner-profile-incomplete')).not.toBeNull();
  });
});
