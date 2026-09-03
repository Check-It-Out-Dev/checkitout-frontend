import { TestBed } from '@angular/core/testing';
import { HttpHeaders } from '@angular/common/http';
import { ShellStatusService } from './shell-status.service';

describe('ShellStatusService', () => {
  let svc: ShellStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ShellStatusService);
  });

  describe('initial state', () => {
    it('starts with no banners', () => {
      expect(svc.consentRequired()).toBe(false);
      expect(svc.emailVerificationRequired()).toBe(false);
      expect(svc.profileMissingFields()).toEqual([]);
      expect(svc.hasAnyBanner()).toBe(false);
    });
  });

  describe('noteResponseHeaders', () => {
    it('flips consentRequired when X-Consent-Required is "1"', () => {
      svc.noteResponseHeaders(new HttpHeaders({ 'X-Consent-Required': '1' }));
      expect(svc.consentRequired()).toBe(true);
      expect(svc.hasAnyBanner()).toBe(true);
    });

    it('flips emailVerificationRequired when X-Email-Verification-Required is "1"', () => {
      svc.noteResponseHeaders(new HttpHeaders({ 'X-Email-Verification-Required': '1' }));
      expect(svc.emailVerificationRequired()).toBe(true);
    });

    it('does not flip on absent headers', () => {
      svc.noteResponseHeaders(new HttpHeaders({ 'Content-Type': 'application/json' }));
      expect(svc.consentRequired()).toBe(false);
      expect(svc.emailVerificationRequired()).toBe(false);
    });

    it('does not flip on header values other than "1"', () => {
      svc.noteResponseHeaders(new HttpHeaders({ 'X-Consent-Required': 'false' }));
      expect(svc.consentRequired()).toBe(false);
    });

    it('is sticky once seen — a later response without the header does not clear it', () => {
      svc.noteResponseHeaders(new HttpHeaders({ 'X-Consent-Required': '1' }));
      svc.noteResponseHeaders(new HttpHeaders({}));
      expect(svc.consentRequired()).toBe(true);
    });
  });

  describe('setProfileMissing', () => {
    it('records the missing-field list and updates hasAnyBanner', () => {
      svc.setProfileMissing(['firstName', 'lastName']);
      expect(svc.profileMissingFields()).toEqual(['firstName', 'lastName']);
      expect(svc.hasAnyBanner()).toBe(true);
    });

    it('clears banners when set to empty array', () => {
      svc.setProfileMissing(['firstName']);
      svc.setProfileMissing([]);
      expect(svc.profileMissingFields()).toEqual([]);
      expect(svc.hasAnyBanner()).toBe(false);
    });
  });

  describe('trialOffer', () => {
    const DISMISS_KEY = 'cio.shell.trialOfferDismissed';

    afterEach(() => localStorage.removeItem(DISMISS_KEY));

    it('setTrialOffer(true) shows the nudge', () => {
      svc.setTrialOffer(true);
      expect(svc.trialOffer()).toBe(true);
    });

    it('dismissTrialOffer hides it and persists the choice', () => {
      svc.setTrialOffer(true);
      svc.dismissTrialOffer();
      expect(svc.trialOffer()).toBe(false);
      expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
    });

    it('a persisted dismissal wins over later eligibility', () => {
      localStorage.setItem(DISMISS_KEY, '1');
      svc.setTrialOffer(true);
      expect(svc.trialOffer()).toBe(false);
    });

    it('setTrialOffer(false) always hides, dismissal or not', () => {
      svc.setTrialOffer(true);
      svc.setTrialOffer(false);
      expect(svc.trialOffer()).toBe(false);
    });

    it('the nudge is not an obligation — hasAnyBanner stays false', () => {
      svc.setTrialOffer(true);
      expect(svc.hasAnyBanner()).toBe(false);
    });
  });

  describe('clearConsent / clearEmailVerification', () => {
    it('clearConsent flips consentRequired back to false', () => {
      svc.noteResponseHeaders(new HttpHeaders({ 'X-Consent-Required': '1' }));
      expect(svc.consentRequired()).toBe(true);
      svc.clearConsent();
      expect(svc.consentRequired()).toBe(false);
    });

    it('clearEmailVerification flips emailVerificationRequired back to false', () => {
      svc.noteResponseHeaders(new HttpHeaders({ 'X-Email-Verification-Required': '1' }));
      svc.clearEmailVerification();
      expect(svc.emailVerificationRequired()).toBe(false);
    });
  });
});
