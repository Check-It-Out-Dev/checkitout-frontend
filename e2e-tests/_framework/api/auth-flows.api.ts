import { ApiHttp, type ApiResult } from './http-client';

import type { FirebaseAuthResponse } from '../../../src/app/api/model/firebase-auth-response';

/**
 * Layer 1 — auth-flow domain service (magic links + credential ops).
 *
 * Typed methods over the BE's Firebase-proxy endpoints (the FE never talks to
 * Identity Toolkit directly — the BE proxies with a service-account bearer)
 * plus the `/test` hooks the magic-link oracles need to stage real Firebase
 * state. One method per endpoint; the steps stay thin.
 *
 * Contract verified against the BE Cucumber glue (MagicLinkSteps.java) and the
 * generated client (firebase-auth-proxy.api.ts).
 */
export class AuthFlowsApi {
  constructor(private readonly http: ApiHttp) {}

  // ── Production magic-link endpoints ────────────────────────────────────────

  /** Send a verification email to the CURRENT session user (authenticated). */
  requestVerificationEmail(): Promise<ApiResult<unknown>> {
    return this.http.post('/auth/send-verification-email');
  }

  /** Trigger the password-reset email (public; anti-enumeration envelope). */
  forgotPassword(email: string): Promise<ApiResult<unknown>> {
    return this.http.post('/auth/firebase/forgot-password', { email });
  }

  /** Apply an email-action oobCode (verifies the email). */
  applyActionCode(oobCode: string): Promise<ApiResult<unknown>> {
    return this.http.post('/auth/firebase/apply-action-code', { oobCode });
  }

  /** Check a password-reset oobCode is valid without consuming it. */
  verifyResetCode(oobCode: string): Promise<ApiResult<unknown>> {
    return this.http.post('/auth/firebase/verify-reset-code', { oobCode });
  }

  /** Consume the reset oobCode and set the new password. */
  confirmPasswordReset(oobCode: string, newPassword: string): Promise<ApiResult<unknown>> {
    return this.http.post('/auth/firebase/confirm-password-reset', { oobCode, newPassword });
  }

  /** Credential login through the BE's Identity-Toolkit proxy. */
  login(email: string, password: string): Promise<ApiResult<FirebaseAuthResponse>> {
    return this.http.post<FirebaseAuthResponse>('/auth/firebase/login', { email, password });
  }

  /**
   * Influencer onboarding: verify email AND set a password in ONE atomic step
   * (public endpoint — the influencer clicks the link, no session needed).
   * Guarantees every activated influencer can log in with email+password even
   * if Instagram OAuth is later revoked.
   */
  completeVerification(
    oobCode: string,
    password: string,
  ): Promise<ApiResult<{ userType?: string }>> {
    return this.http.post('/auth/firebase/complete-verification', { oobCode, password });
  }

  // ── /test hooks (e2e profile) for staging real Firebase state ─────────────

  /** Set emailVerified in BOTH Firebase Auth and PostgreSQL (mirrors the BE glue). */
  async setEmailVerified(firebaseUid: string, verified: boolean): Promise<void> {
    const fb = await this.http.post('/test/auth/update-firebase-user', {
      firebaseUid,
      emailVerified: verified,
    });
    if (!fb.ok) throw new Error(`update-firebase-user emailVerified failed: HTTP ${fb.status}`);
    const pg = await this.http.post('/test/registry/set-email-verified', {
      firebaseUid,
      verified,
    });
    if (!pg.ok) throw new Error(`set-email-verified (PG) failed: HTTP ${pg.status}`);
  }

  /** Restore/set the Firebase account password (cleanup step of the reset oracle). */
  async setPassword(firebaseUid: string, password: string): Promise<void> {
    const r = await this.http.post('/test/auth/update-firebase-user', { firebaseUid, password });
    if (!r.ok) throw new Error(`update-firebase-user password failed: HTTP ${r.status}`);
  }

  /** Clear the per-user password-reset cooldown so repeated runs can re-trigger. */
  async clearPasswordResetCooldown(firebaseUid: string): Promise<void> {
    const r = await this.http.post('/test/registry/clear-password-reset-cooldown', { firebaseUid });
    if (!r.ok) throw new Error(`clear-password-reset-cooldown failed: HTTP ${r.status}`);
  }

  /** Reset an influencer to pre-verification state (IN_VALIDATION, emailVerified=false). */
  async resetInfluencerForVerification(email: string): Promise<void> {
    const r = await this.http.post('/test/auth/reset-influencer-for-verification', { email });
    if (!r.ok) throw new Error(`reset-influencer-for-verification failed: HTTP ${r.status}`);
  }

  /**
   * Send the verification email WITHOUT Firebase's generateEmailVerificationLink:
   * a synthetic oobCode is stored in Redis and the REAL SMTP email goes out
   * (GreenMail captures it). The BE added this hook precisely because
   * Firebase's external TOO_MANY_ATTEMPTS quota on link generation makes
   * repeated e2e sends flaky; complete-verification validates against Redis,
   * so the consumed path stays production-real.
   */
  async sendVerificationEmailBypass(firebaseUid: string): Promise<void> {
    const r = await this.http.post('/test/auth/send-verification-email-bypass', { firebaseUid });
    if (!r.ok) throw new Error(`send-verification-email-bypass failed: HTTP ${r.status}`);
  }
}
