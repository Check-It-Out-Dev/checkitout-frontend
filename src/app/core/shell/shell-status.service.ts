import { Injectable, computed, signal } from '@angular/core';

/**
 * Shell-level UX status, driven by BE response headers tapped from every
 * authenticated API call.
 *
 * The BE emits two custom headers on responses when the current user has
 * outstanding obligations that gate full platform usage:
 *
 * - `X-Consent-Required: 1` — the user hasn't accepted the current terms /
 *   privacy / cookie versions and must review + accept before mutations
 *   work. Legacy renders an amber top-rail "Please accept our updated
 *   terms" banner with a Review & Accept CTA.
 * - `X-Email-Verification-Required: 1` — the user signed up but hasn't
 *   verified their email, blocking certain actions (e.g. campaign create).
 *
 * Both are sticky once seen — flipping back to absent doesn't clear the
 * banner without an explicit reset (e.g. after the user accepts terms,
 * call `clearConsent()`).
 *
 * `profileIncomplete` is a separate concern: it's derived by reading
 * `/api/users/me` on shell mount and checking required-field presence.
 * Set via `setProfileMissing(fields)`; the component fetches profile
 * itself and informs the service.
 *
 * Read-only signals on the public surface; mutators are instance methods
 * (called only by the interceptor + the layout's profile-fetch effect).
 */
/** Persistent trial-offer dismissal flag — survives sessions so the nudge
 *  doesn't reappear on every login once waved away. */
const TRIAL_OFFER_DISMISSED_KEY = 'cio.shell.trialOfferDismissed';

@Injectable({ providedIn: 'root' })
export class ShellStatusService {
  private readonly _consentRequired = signal(false);
  private readonly _emailVerificationRequired = signal(false);
  private readonly _profileMissingFields = signal<readonly string[]>([]);
  private readonly _blockedForTerms = signal(false);
  private readonly _blockedDaysRemaining = signal<number | null>(null);
  private readonly _consentDaysRemaining = signal<number | null>(null);
  private readonly _trialOffer = signal(false);

  /** True if the user must accept updated legal documents before continuing. */
  readonly consentRequired = this._consentRequired.asReadonly();

  /** True if the user signed up but hasn't verified their email. */
  readonly emailVerificationRequired = this._emailVerificationRequired.asReadonly();

  /** Names of required profile fields the user hasn't filled in (e.g.
   *  ['firstName', 'lastName', 'phone']). Empty when the profile is
   *  complete. */
  readonly profileMissingFields = this._profileMissingFields.asReadonly();

  /** True when `/users/me` reports accountStatus
   *  BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS — the user must re-accept the
   *  current legal documents; the BE rejects mutations until then
   *  (read-only is server-enforced; the FE surfaces the red banner +
   *  reconsent dialog, exactly like legacy). */
  readonly blockedForTerms = this._blockedForTerms.asReadonly();

  /** Days left before the BLOCKED account escalates (from
   *  `user.daysToAcceptNewTerms`); null when the BE didn't send one. */
  readonly blockedDaysRemaining = this._blockedDaysRemaining.asReadonly();

  /** Grace-period countdown while the account is still ACTIVE (from
   *  `user.daysToAcceptNewTerms`) — legacy shows "37 days remaining" on
   *  the amber banner. Null when no re-consent is pending. */
  readonly consentDaysRemaining = this._consentDaysRemaining.asReadonly();

  /** True when the shell should nudge a trial-eligible free company toward
   *  the Enterprise trial (audit P1). Set by the layout after its role- and
   *  payments-gated `/subscription/status` probe; stays false forever once
   *  the user dismisses the nudge (persisted in localStorage). */
  readonly trialOffer = this._trialOffer.asReadonly();

  /** True when at least one shell-level banner should render. */
  readonly hasAnyBanner = computed(
    () =>
      this._consentRequired() ||
      this._emailVerificationRequired() ||
      this._profileMissingFields().length > 0 ||
      this._blockedForTerms(),
  );

  /** Called by the shell-headers interceptor on every response. */
  noteResponseHeaders(headers: { get(name: string): string | null }): void {
    if (headers.get('X-Consent-Required') === '1') this._consentRequired.set(true);
    if (headers.get('X-Email-Verification-Required') === '1') {
      this._emailVerificationRequired.set(true);
    }
  }

  /** Called by the layout after fetching `/api/users/me` to record the
   *  list of profile fields the user hasn't filled in. */
  setProfileMissing(fields: readonly string[]): void {
    this._profileMissingFields.set(fields);
  }

  /** Called by the layout after fetching `/api/users/me`. */
  setBlockedForTerms(blocked: boolean, daysRemaining?: number | null): void {
    this._blockedForTerms.set(blocked);
    this._blockedDaysRemaining.set(blocked ? (daysRemaining ?? null) : null);
  }

  /** Called by the layout when `/users/me` carries a grace-period
   *  countdown while the account is still ACTIVE: the BE emits no
   *  X-Consent-Required header in this state (live-verified), so the
   *  amber banner is driven by `daysToAcceptNewTerms` exactly like
   *  legacy. */
  setConsentPending(daysRemaining: number | null): void {
    if (daysRemaining !== null) {
      this._consentRequired.set(true);
      this._consentDaysRemaining.set(daysRemaining);
    }
  }

  /** Called after the user successfully accepts new terms. */
  clearConsent(): void {
    this._consentRequired.set(false);
    this._consentDaysRemaining.set(null);
    this._blockedForTerms.set(false);
    this._blockedDaysRemaining.set(null);
  }

  /** Called after the user verifies their email. */
  clearEmailVerification(): void {
    this._emailVerificationRequired.set(false);
  }

  /**
   * Called by the layout after the payments-gated `/subscription/status`
   * probe. A prior dismissal wins over eligibility — once waved away the
   * nudge never comes back (until storage is cleared). SSR-safe: without
   * `localStorage` (Node) the dismissal check is skipped.
   */
  setTrialOffer(eligible: boolean): void {
    if (eligible && this.isTrialOfferDismissed()) return;
    this._trialOffer.set(eligible);
  }

  /** Hides the trial nudge now and persists the choice across sessions. */
  dismissTrialOffer(): void {
    this._trialOffer.set(false);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TRIAL_OFFER_DISMISSED_KEY, '1');
      }
    } catch {
      // storage blocked (private mode) — session-only dismissal still holds
    }
  }

  private isTrialOfferDismissed(): boolean {
    try {
      return (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(TRIAL_OFFER_DISMISSED_KEY) === '1'
      );
    } catch {
      return false;
    }
  }
}
