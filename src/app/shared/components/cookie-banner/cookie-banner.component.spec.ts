import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { ConsentService } from '../../../core/consent/consent.service';
import { SandboxDirectorService } from '../../../core/demo/sandbox-director.service';
import { CookieBannerComponent } from './cookie-banner.component';

describe('CookieBannerComponent', () => {
  let fixture: ComponentFixture<CookieBannerComponent>;
  let needsDecision: WritableSignal<boolean>;
  let tourActive: WritableSignal<boolean>;
  let consent: {
    needsDecision: WritableSignal<boolean>;
    acceptAll: jest.Mock;
    acceptNecessary: jest.Mock;
    acceptCustom: jest.Mock;
  };
  let host: HTMLElement;

  beforeEach(async () => {
    needsDecision = signal(true);
    tourActive = signal(false);
    consent = {
      needsDecision,
      acceptAll: jest.fn(),
      acceptNecessary: jest.fn(),
      acceptCustom: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        CookieBannerComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        { provide: ConsentService, useValue: consent },
        { provide: SandboxDirectorService, useValue: { active: tourActive } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CookieBannerComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  function getBanner(): HTMLElement | null {
    return host.querySelector('[data-testid="cookie-banner"]');
  }

  it('renders when consent.needsDecision() returns true', () => {
    expect(getBanner()).not.toBeNull();
  });

  it('waits while a guided demo tour runs (the guide owns the bottom edge)', () => {
    tourActive.set(true);
    fixture.detectChanges();
    expect(getBanner()).toBeNull();
    tourActive.set(false);
    fixture.detectChanges();
    expect(getBanner()).not.toBeNull();
  });

  it('hides when consent.needsDecision() returns false', () => {
    needsDecision.set(false);
    fixture.detectChanges();
    expect(getBanner()).toBeNull();
  });

  it('"accept all" button triggers consent.acceptAll()', () => {
    const btn = host.querySelector<HTMLButtonElement>('[data-testid="cookie-banner-accept-all"]');
    btn?.click();
    expect(consent.acceptAll).toHaveBeenCalledTimes(1);
    expect(consent.acceptNecessary).not.toHaveBeenCalled();
  });

  it('"necessary only" button triggers consent.acceptNecessary()', () => {
    const btn = host.querySelector<HTMLButtonElement>('[data-testid="cookie-banner-necessary"]');
    btn?.click();
    expect(consent.acceptNecessary).toHaveBeenCalledTimes(1);
    expect(consent.acceptAll).not.toHaveBeenCalled();
  });

  it('uses role="region" + aria-label for screen readers', () => {
    const banner = getBanner();
    expect(banner?.getAttribute('role')).toBe('region');
    expect(banner?.getAttribute('aria-label')).toBeTruthy();
  });

  // GDPR Art. 7 granularity — the customize panel with per-category toggles.
  describe('customize panel', () => {
    function expand(): void {
      host.querySelector<HTMLButtonElement>('[data-testid="cookie-banner-customize"]')!.click();
      fixture.detectChanges();
    }

    it('is collapsed by default and discloses via aria-expanded', () => {
      const trigger = host.querySelector('[data-testid="cookie-banner-customize"]');
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect(host.querySelector('[data-testid="cookie-banner-categories"]')).toBeNull();
      expand();
      expect(trigger?.getAttribute('aria-expanded')).toBe('true');
      expect(host.querySelector('[data-testid="cookie-banner-categories"]')).not.toBeNull();
    });

    it('renders three categories with necessary locked ON and opt-ins defaulting OFF (no pre-ticked boxes)', () => {
      expand();
      // assert via the MatSlideToggle API, not MDC DOM internals — the
      // rendered markup is Material's contract to change, the API is ours
      const toggles = fixture.debugElement
        .queryAll(By.directive(MatSlideToggle))
        .map((d) => d.componentInstance as MatSlideToggle);
      expect(toggles).toHaveLength(3);
      // necessary: checked + disabled (locked on)
      expect(toggles[0].checked).toBe(true);
      expect(toggles[0].disabled).toBe(true);
      // analytics + marketing: enabled, unchecked by default
      for (const i of [1, 2]) {
        expect(toggles[i].checked).toBe(false);
        expect(toggles[i].disabled).toBe(false);
      }
    });

    it('save passes the exact toggle states to acceptCustom', () => {
      expand();
      // switch analytics on, leave marketing off
      fixture.componentInstance.analytics.set(true);
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="cookie-banner-save"]')!.click();
      expect(consent.acceptCustom).toHaveBeenCalledWith(true, false);
      expect(consent.acceptAll).not.toHaveBeenCalled();
      expect(consent.acceptNecessary).not.toHaveBeenCalled();
    });

    it('startExpanded input opens the panel for the sandbox fixture', () => {
      fixture.componentInstance.startExpanded = true;
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="cookie-banner-categories"]')).not.toBeNull();
    });
  });
});
