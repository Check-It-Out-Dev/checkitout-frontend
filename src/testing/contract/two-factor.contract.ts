/**
 * L0 contract: TwoFactorService ↔ generated models. Compile-time only;
 * see opportunities.contract.ts. If `npm run openapi:gen` moves a DTO or
 * someone widens a wrapper signature (an `any` leak, a loosened param),
 * `npm run typecheck` breaks here, naming the exact method.
 */
import type { Observable } from 'rxjs';
import type { TwoFactorService } from '../../app/core/two-factor/two-factor.service';
import type { BackupCodesResponse } from '../../app/core/api-frozen/hidden-models';
import type { TotpSetupResponse } from '../../app/core/api-frozen/hidden-models';
import type { TwoFactorOperationResponse } from '../../app/core/api-frozen/hidden-models';
import type { TwoFactorStatusResponse } from '../../app/core/api-frozen/hidden-models';
import type { Equal, Expect } from '../type-assert';

type _status = Expect<Equal<TwoFactorService['status'], () => Observable<TwoFactorStatusResponse>>>;

type _setup = Expect<Equal<TwoFactorService['setup'], () => Observable<TotpSetupResponse>>>;

type _verifySetup = Expect<
  Equal<TwoFactorService['verifySetup'], (code: string) => Observable<TwoFactorOperationResponse>>
>;

type _verify = Expect<
  Equal<TwoFactorService['verify'], (code: string) => Observable<TwoFactorOperationResponse>>
>;

type _disable = Expect<
  Equal<TwoFactorService['disable'], (code: string) => Observable<TwoFactorOperationResponse>>
>;

type _regenerateBackupCodes = Expect<
  Equal<
    TwoFactorService['regenerateBackupCodes'],
    (code: string) => Observable<BackupCodesResponse>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type TwoFactorContract = [
  _status,
  _setup,
  _verifySetup,
  _verify,
  _disable,
  _regenerateBackupCodes,
];
