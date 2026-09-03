import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LegalApiService } from '../legal/legal-api.service';
import { ConsentService } from './consent.service';

describe('ConsentService', () => {
  let toggleCookieCategory: jest.Mock;

  beforeEach(() => {
    toggleCookieCategory = jest.fn().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [{ provide: LegalApiService, useValue: { toggleCookieCategory } }],
    });
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('mirrors accept-all to the BE — ESSENTIAL true sets the login-gate cookie', () => {
    const svc = TestBed.inject(ConsentService);
    svc.acceptAll();
    expect(toggleCookieCategory).toHaveBeenCalledWith('ESSENTIAL', true);
    expect(toggleCookieCategory).toHaveBeenCalledWith('ANALYTICS', true);
    expect(toggleCookieCategory).toHaveBeenCalledWith('MARKETING', true);
  });

  it('necessary-only still fires ESSENTIAL true but ANALYTICS/MARKETING false', () => {
    const svc = TestBed.inject(ConsentService);
    svc.acceptNecessary();
    expect(toggleCookieCategory).toHaveBeenCalledWith('ESSENTIAL', true);
    expect(toggleCookieCategory).toHaveBeenCalledWith('ANALYTICS', false);
    expect(toggleCookieCategory).toHaveBeenCalledWith('MARKETING', false);
  });

  it('starts with needsDecision=true and record=null when storage is empty', () => {
    const svc = TestBed.inject(ConsentService);
    expect(svc.needsDecision()).toBe(true);
    expect(svc.record()).toBeNull();
  });

  it('acceptAll persists analytics+marketing and flips needsDecision', () => {
    const svc = TestBed.inject(ConsentService);
    svc.acceptAll();
    const r = svc.record();
    expect(r).not.toBeNull();
    expect(r!.analytics).toBe(true);
    expect(r!.marketing).toBe(true);
    expect(svc.needsDecision()).toBe(false);
    expect(JSON.parse(localStorage.getItem('cio.consent.v1')!)).toMatchObject({
      analytics: true,
      marketing: true,
    });
  });

  it('acceptNecessary opts out of analytics+marketing', () => {
    const svc = TestBed.inject(ConsentService);
    svc.acceptNecessary();
    const r = svc.record();
    expect(r!.analytics).toBe(false);
    expect(r!.marketing).toBe(false);
  });

  // GDPR Art. 7 granularity — the customize panel's per-category decision.
  it('acceptCustom persists the mixed choice and mirrors it per-category to the BE', () => {
    const svc = TestBed.inject(ConsentService);
    svc.acceptCustom(true, false);
    const r = svc.record();
    expect(r!.necessary).toBe(true);
    expect(r!.analytics).toBe(true);
    expect(r!.marketing).toBe(false);
    expect(svc.needsDecision()).toBe(false);
    // ESSENTIAL is load-bearing (login gate) — always true, regardless of choice
    expect(toggleCookieCategory).toHaveBeenCalledWith('ESSENTIAL', true);
    expect(toggleCookieCategory).toHaveBeenCalledWith('ANALYTICS', true);
    expect(toggleCookieCategory).toHaveBeenCalledWith('MARKETING', false);
    expect(JSON.parse(localStorage.getItem('cio.consent.v1')!)).toMatchObject({
      analytics: true,
      marketing: false,
    });
  });

  it('hydrates from localStorage on construction', () => {
    localStorage.setItem(
      'cio.consent.v1',
      JSON.stringify({
        necessary: true,
        analytics: true,
        marketing: false,
        decidedAt: '2026-05-08T00:00:00.000Z',
      }),
    );
    const svc = TestBed.inject(ConsentService);
    expect(svc.needsDecision()).toBe(false);
    expect(svc.record()!.analytics).toBe(true);
    expect(svc.record()!.marketing).toBe(false);
  });

  it('treats a malformed blob as no decision', () => {
    localStorage.setItem('cio.consent.v1', '{not-json');
    const svc = TestBed.inject(ConsentService);
    expect(svc.needsDecision()).toBe(true);
  });

  it('clear() resets to needsDecision', () => {
    const svc = TestBed.inject(ConsentService);
    svc.acceptAll();
    expect(svc.needsDecision()).toBe(false);
    svc.clear();
    expect(svc.needsDecision()).toBe(true);
    expect(localStorage.getItem('cio.consent.v1')).toBeNull();
  });
});
