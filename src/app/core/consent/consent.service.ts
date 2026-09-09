import { PLATFORM_ID, Injectable, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LegalApiService } from '../legal/legal-api.service';

export interface ConsentRecord {
  /** Always true — strictly necessary cookies can't be opted out of. */
  readonly necessary: true;
  readonly analytics: boolean;
  readonly marketing: boolean;
  /** ISO timestamp of when the user made the decision. */
  readonly decidedAt: string;
}

const STORAGE_KEY = 'cio.consent.v1';

/**
 * Tracks cookie-banner / privacy consent (analytics + marketing toggles)
 * — separate concern from the registration legal-clickwrap flow which
 * uses HMAC-signed cookies and `LegalApiService` (see
 * `core/legal/legal-api.service.ts`).
 *
 * This service stores the user's banner-level decisions in localStorage
 * keyed `cio.consent.v1`. The consent decision IS user-preference data,
 * not authentication state, so localStorage is appropriate (no security
 * impact if the browser leaks it). Authentication NEVER goes through
 * localStorage — see memory `feedback_no_client_token_storage`.
 *
 * Shape on disk:
 *   { necessary: true, analytics: bool, marketing: bool, decidedAt: ISO }
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly legalApi = inject(LegalApiService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _record = signal<ConsentRecord | null>(this.read());

  /** Reactive consent record — null when the user hasn't decided yet. */
  readonly record = this._record.asReadonly();

  /**
   * True when no decision has been made; used by the banner's *ngIf.
   *
   * False on the server, always. The decision lives in localStorage, which does not exist there, so a
   * server render would show the banner to everyone — including in the prerendered index.html that the
   * static host serves as the SPA fallback for every route. That HTML then reaches the browser with
   * three buttons on it that nothing is listening to yet, and a click in the first second of the page's
   * life is swallowed: the banner stays up, and the visitor clicks again. It is the defect the cluster's
   * cookie-banner tests kept catching, and it was ours, not theirs.
   */
  readonly needsDecision = computed(() => isPlatformBrowser(this.platformId) && this._record() === null);

  /** Accept all categories. */
  acceptAll(): void {
    this.acceptCustom(true, true);
  }

  /** Necessary-only — opts out of analytics + marketing (reject-all parity). */
  acceptNecessary(): void {
    this.acceptCustom(false, false);
  }

  /**
   * Granular per-category decision from the banner's customize panel
   * (GDPR Art. 7 granularity — consent per purpose, not all-or-nothing).
   * Necessary is always on; it cannot be opted out of.
   */
  acceptCustom(analytics: boolean, marketing: boolean): void {
    const record: ConsentRecord = {
      necessary: true,
      analytics,
      marketing,
      decidedAt: new Date().toISOString(),
    };
    this.persist(record);
    this.syncToBackend(record);
  }

  /**
   * Mirror the banner decision to the BE so it sets the HMAC consent
   * cookies. ESSENTIAL is load-bearing: without the `consent_cookie_policy`
   * cookie it sets, `/auth/exchange-token` returns 451 and login fails
   * (matches legacy's cookie-consent service). localStorage already
   * reflects the decision for the FE; a BE hiccup here must not break the
   * banner, so errors are swallowed — but ESSENTIAL fires on every accept.
   */
  private syncToBackend(record: ConsentRecord): void {
    const swallow = { error: () => undefined };
    this.legalApi.toggleCookieCategory('ESSENTIAL', true).subscribe(swallow);
    this.legalApi.toggleCookieCategory('ANALYTICS', record.analytics).subscribe(swallow);
    this.legalApi.toggleCookieCategory('MARKETING', record.marketing).subscribe(swallow);
  }

  /** Reset for testing or "change my preferences" flows. */
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // SSR / privacy mode — nothing to clear.
    }
    this._record.set(null);
  }

  private persist(record: ConsentRecord): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // SSR / privacy mode — record stays in-memory only.
    }
    this._record.set(record);
  }

  private read(): ConsentRecord | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ConsentRecord;
      // Defensive — schema-guard so a corrupted blob doesn't break the app.
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        parsed.necessary === true &&
        typeof parsed.analytics === 'boolean' &&
        typeof parsed.marketing === 'boolean' &&
        typeof parsed.decidedAt === 'string'
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
}
