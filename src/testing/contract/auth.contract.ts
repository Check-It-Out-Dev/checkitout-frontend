/**
 * L0 contract: AuthApiService ↔ generated models. Compile-time only;
 * see opportunities.contract.ts. If `npm run openapi:gen` moves a DTO
 * or someone widens a wrapper signature (an `any` leak, a loosened
 * param, dropped optionality), `npm run typecheck` breaks here, naming
 * the exact method.
 */
import type { Observable } from 'rxjs';
import type { AuthApiService } from '../../app/core/auth/auth-api.service';
import type { AuthOperationResponse } from '../../app/api/model/auth-operation-response';
import type { FirebaseAuthResponse } from '../../app/api/model/firebase-auth-response';
import type { ForgotPasswordResponse } from '../../app/api/model/forgot-password-response';
import type { TokenExchangeResponse } from '../../app/api/model/token-exchange-response';
import type { Equal, Expect } from '../type-assert';

type _signIn = Expect<
  Equal<
    AuthApiService['signIn'],
    (email: string, password: string) => Observable<FirebaseAuthResponse>
  >
>;

type _forgotPassword = Expect<
  Equal<AuthApiService['forgotPassword'], (email: string) => Observable<ForgotPasswordResponse>>
>;

type _changePassword = Expect<
  Equal<
    AuthApiService['changePassword'],
    (currentPassword: string, newPassword: string) => Observable<AuthOperationResponse>
  >
>;

type _verifyResetCode = Expect<
  Equal<AuthApiService['verifyResetCode'], (oobCode: string) => Observable<AuthOperationResponse>>
>;

type _confirmPasswordReset = Expect<
  Equal<
    AuthApiService['confirmPasswordReset'],
    (oobCode: string, newPassword: string) => Observable<AuthOperationResponse>
  >
>;

type _signOut = Expect<Equal<AuthApiService['signOut'], () => Observable<AuthOperationResponse>>>;

type _register = Expect<
  Equal<
    AuthApiService['register'],
    (email: string, password: string) => Observable<FirebaseAuthResponse>
  >
>;

type _verifyEmail = Expect<
  Equal<AuthApiService['verifyEmail'], (oobCode: string) => Observable<AuthOperationResponse>>
>;

type _completeVerification = Expect<
  Equal<
    AuthApiService['completeVerification'],
    (oobCode: string, password?: string) => Observable<AuthOperationResponse>
  >
>;

type _exchangeTokenForSession = Expect<
  Equal<
    AuthApiService['exchangeTokenForSession'],
    (expirationDays?: number) => Observable<TokenExchangeResponse>
  >
>;

type _refreshSession = Expect<
  Equal<AuthApiService['refreshSession'], () => Observable<TokenExchangeResponse>>
>;

type _sendVerificationEmail = Expect<
  Equal<AuthApiService['sendVerificationEmail'], () => Observable<AuthOperationResponse>>
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type AuthContract = [
  _signIn,
  _forgotPassword,
  _changePassword,
  _verifyResetCode,
  _confirmPasswordReset,
  _signOut,
  _register,
  _verifyEmail,
  _completeVerification,
  _exchangeTokenForSession,
  _refreshSession,
  _sendVerificationEmail,
];
