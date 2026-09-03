/**
 * L0 contract: CascadeDeleteApiService ↔ generated models. Compile-time
 * only; see opportunities.contract.ts.
 */
import type { Observable } from 'rxjs';
import type { CascadeDeleteApiService } from '../../app/core/admin/cascade-delete.service';
import type { CascadeDeletePreview } from '../../app/api/model/cascade-delete-preview';
import type { CascadeDeleteResult } from '../../app/api/model/cascade-delete-result';
import type { Equal, Expect } from '../type-assert';

type _previewPartnership = Expect<
  Equal<
    CascadeDeleteApiService['previewPartnership'],
    (poId: number) => Observable<CascadeDeletePreview>
  >
>;

type _forceDeletePartnership = Expect<
  Equal<
    CascadeDeleteApiService['forceDeletePartnership'],
    (
      poId: number,
      confirmationCode: string,
      expectedEntityCount: number,
      reason?: string,
    ) => Observable<CascadeDeleteResult>
  >
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type AdminContract = [_previewPartnership, _forceDeletePartnership];
