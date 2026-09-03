import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TwoFactorStatusControllerService as GeneratedTwoFactorService } from '../../api/api/two-factor-status-controller.api';
import type { BackupCodesResponse } from '../api-frozen/hidden-models';
import type { TotpSetupResponse } from '../api-frozen/hidden-models';
import type { TwoFactorOperationResponse } from '../api-frozen/hidden-models';
import type { TwoFactorStatusResponse } from '../api-frozen/hidden-models';

/**
 * Wrapper around the generated `/twofactor/*` client.
 *
 * Two distinct flows the service supports:
 *
 * 1. **Login-time challenge (existing ADMIN).** After `/auth/firebase/login`
 *    returns `requires2FA=true`, FE calls `/auth/exchange-token` to get a
 *    `partialSession` cookie. Then opens the TOTP dialog → calls
 *    `verify(code)` → BE marks `twoFactorVerified=true` + returns
 *    `reuseIdToken=true`. FE re-calls `/auth/exchange-token` to get the
 *    full `session` cookie (handled by SignInComponent).
 *
 * 2. **First-time setup (PENDING_ADMIN).** After `/auth/firebase/login`
 *    returns `requires2FASetup=true`, FE redirects to /auth/2fa-setup →
 *    calls `setup()` → renders QR + backup codes + secret → user
 *    confirms with `verifySetup(code)` → BE upgrades role to ADMIN +
 *    auto-issues full session.
 */
@Injectable({ providedIn: 'root' })
export class TwoFactorService {
  private readonly api = inject(GeneratedTwoFactorService);

  /** Post-login status query (role, has2FA, requires2FASetup, integrity warnings). */
  status(): Observable<TwoFactorStatusResponse> {
    return this.api.check2FAStatus();
  }

  /** PENDING_ADMIN-only: generate a fresh TOTP secret + backup codes. */
  setup(): Observable<TotpSetupResponse> {
    return this.api.setup2FA();
  }

  /** PENDING_ADMIN-only: confirm the first TOTP code and upgrade to ADMIN. */
  verifySetup(code: string): Observable<TwoFactorOperationResponse> {
    return this.api.verifySetup2FA({ totpVerifyRequest: { code } });
  }

  /** PARTIAL_AUTH-only: the login-time TOTP challenge. */
  verify(code: string): Observable<TwoFactorOperationResponse> {
    return this.api.verify2FA({ totpVerifyRequest: { code } });
  }

  /** ADMIN-only: downgrade to PENDING_ADMIN (requires fresh TOTP). */
  disable(code: string): Observable<TwoFactorOperationResponse> {
    return this.api.disable2FA({ totpVerifyRequest: { code } });
  }

  /** ADMIN-only: regenerate backup codes (requires fresh TOTP). */
  regenerateBackupCodes(code: string): Observable<BackupCodesResponse> {
    return this.api.generateBackupCodes({ totpVerifyRequest: { code } });
  }
}
