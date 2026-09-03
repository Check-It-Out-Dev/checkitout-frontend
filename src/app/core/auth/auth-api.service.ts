import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthControllerService as AuthenticationService } from '../../api/api/auth-controller.api';
import { FirebaseAuthProxyControllerService as FirebaseAuthProxyService } from '../../api/api/firebase-auth-proxy-controller.api';
import { AuthOperationResponse } from '../../api/model/auth-operation-response';
import { FirebaseAuthResponse } from '../../api/model/firebase-auth-response';
import { ForgotPasswordResponse } from '../../api/model/forgot-password-response';
import type { TokenExchangeResponse } from '../../api/model/token-exchange-response';

/**
 * Thin wrapper over the generated `FirebaseAuthProxyService` and
 * `AuthenticationService` that exposes the shape the components want
 * (`signIn(email, password)`, etc.) without leaking the generator's
 * `requestParameters` envelope.
 *
 * Covers the full Stage-6 auth surface: email/password login + register,
 * /auth/exchange-token bridge, password reset (forgot + verify-code +
 * confirm), email verification + influencer atomic complete-verification,
 * supported-platforms / refresh-session / send-verification-email, and
 * sign-out.
 *
 * Cookies-only end to end — see memory `feedback_no_client_token_storage`.
 * No client-side token persistence anywhere; BE sets HttpOnly session +
 * partial-session + Firebase ID token cookies and the FE only reads the
 * minimal flags off response bodies (`requires2FA`, `requires2FASetup`).
 *
 * reCAPTCHA: not sent from this client. Dev BE runs with
 * `recaptcha.enabled: false`; the `@RequiresRecaptcha` aspect on the BE
 * controller short-circuits when disabled. Production gating ships
 * alongside cutover prep.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(FirebaseAuthProxyService);
  private readonly authApi = inject(AuthenticationService);

  signIn(email: string, password: string): Observable<FirebaseAuthResponse> {
    return this.api.login({
      firebaseAuthRequest: { email, password },
    });
  }

  /**
   * BE replies with an identical envelope whether the email exists or not
   * (anti-enumeration). FE just shows the "check your inbox" message on
   * any 2xx — never branches on `success`.
   */
  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.api.forgotPassword({ forgotPasswordRequest: { email } });
  }

  /**
   * Authenticated in-profile password change (legacy Security-tab
   * parity). The BE re-verifies `currentPassword` against Firebase
   * before updating — a wrong current password surfaces as 400/401.
   */
  changePassword(currentPassword: string, newPassword: string): Observable<AuthOperationResponse> {
    return this.api.changePassword({ passwordChangeRequest: { currentPassword, newPassword } });
  }

  /**
   * Verify the oobCode is still valid before showing the new-password form.
   * Returning the email lets the FE render "resetting password for foo@bar"
   * which avoids a class of phishing UX where someone hands you a link.
   */
  verifyResetCode(oobCode: string): Observable<AuthOperationResponse> {
    return this.api.verifyResetCode({ verifyResetCodeRequest: { oobCode } });
  }

  /**
   * Final step — exchange the oobCode + new password for an actual change
   * in Firebase Auth. After this the user can sign in with the new password.
   */
  confirmPasswordReset(oobCode: string, newPassword: string): Observable<AuthOperationResponse> {
    return this.api.confirmPasswordReset({
      confirmPasswordResetRequest: { oobCode, newPassword },
    });
  }

  /**
   * Asks BE to clear server-side session cookies. The FE-side token wipe is
   * done in `SignOutComponent` regardless of this call's outcome — even if
   * the BE is unreachable, we still want the local state cleared.
   */
  signOut(): Observable<AuthOperationResponse> {
    return this.authApi.signOut();
  }

  /**
   * BE registration — same email/password envelope as sign-in. Role
   * (INFLUENCER vs COMPANY) is NOT set here; the role surfaces from the
   * sign-up form chosen (influencer vs business). Influencer profile gets
   * its real social-account link via the Instagram OAuth flow; company
   * profile finishes setup at /company/setup.
   *
   * BE rejects the call with 400 + `error.consent.required` unless the 3
   * HMAC-signed consent cookies are present (set by `LegalApiService.
   * prepareConsentCookie` via the `LegalClickwrapComponent` on the form).
   */
  register(email: string, password: string): Observable<FirebaseAuthResponse> {
    return this.api.register({ firebaseAuthRequest: { email, password } });
  }

  /**
   * Confirms an email-verification link click. The oobCode comes from the
   * verification email URL. Single-use; expires fast.
   */
  verifyEmail(oobCode: string): Observable<AuthOperationResponse> {
    return this.api.applyActionCode({ applyActionCodeRequest: { oobCode } });
  }

  /**
   * INFLUENCER atomic verify+set-password. Used when an influencer who
   * came in via Instagram OAuth clicks the verify-email link with `?ut=I`
   * marker. BE runs Firebase Admin SDK + transactional PG mutation +
   * compensating Firebase rollback on PG failure (atomic). This is what
   * gives an Instagram-OAuth influencer their first password so they can
   * later sign in via email/password.
   */
  completeVerification(oobCode: string, password?: string): Observable<AuthOperationResponse> {
    return this.api.completeVerification({
      completeVerificationRequest: password ? { oobCode, password } : { oobCode },
    });
  }

  /**
   * THE BRIDGE. Exchanges a Firebase ID token (already in the
   * `FirebaseIdToken` HttpOnly cookie BE just set on /auth/firebase/login,
   * or the `oauth_token` cookie set on /auth/social/callback/instagram)
   * for backend session cookies (`session` + `session_sig`, or partial
   * variants for ADMIN-pre-2FA).
   *
   * Body is empty — BE reads the HttpOnly cookies. The response carries
   * a `cookieType` flag (`FULL` or `PARTIAL`) and `requires2FA` /
   * `requires2FASetup` markers so the FE can route into the TOTP dialog
   * or the PENDING_ADMIN setup page when relevant.
   *
   * Sign-in flow: `signIn()` → `exchangeTokenForSession()` → on
   * `requires2FA`: open TOTP dialog → `verifyTwoFactor()` → second
   * `exchangeTokenForSession()` for the full session.
   */
  exchangeTokenForSession(expirationDays?: number): Observable<TokenExchangeResponse> {
    return this.authApi.exchangeToken({
      tokenExchangeRequest: expirationDays !== undefined ? { expirationDays } : {},
    });
  }

  /**
   * GET /auth/supported-platforms — set of OAuth platforms BE has wired
   * up. Currently `{'Instagram'}` only. The sign-in / sign-up forms use
   * this to gate the OAuth-button visibility — anything not in the set
   * stays hidden so we never offer a flow BE will refuse.
   */
  getSupportedPlatforms(): Observable<Set<string>> {
    return this.authApi.getSupportedPlatforms();
  }

  /**
   * POST /auth/refresh-session — silent re-auth that mints a fresh
   * session cookie with the latest role + permissions. Used after the
   * BE rotates `tokenVersion` (admin ban/unban/role-change). Without
   * this, a banned user keeps seeing their cached page until the next
   * 401 round-trip lands.
   *
   * Returns 401 when the user can no longer sign in — caller should
   * route to /auth/sign-in and clear the SessionState cache.
   */
  refreshSession(): Observable<TokenExchangeResponse> {
    return this.authApi.refreshSession();
  }

  /**
   * POST /auth/send-verification-email — re-sends the verification email
   * to the currently-authenticated user. BE rate-limits to 10 req / 60s.
   * Used by the "resend" CTA on confirmation-required.
   */
  sendVerificationEmail(): Observable<AuthOperationResponse> {
    return this.authApi.sendVerificationEmail();
  }
}
