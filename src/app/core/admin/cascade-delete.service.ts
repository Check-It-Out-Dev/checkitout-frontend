import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminCascadeDeleteControllerService as GeneratedCascadeApi } from '../../api/api/admin-cascade-delete-controller.api';
import type { CascadeDeletePreview } from '../../api/model/cascade-delete-preview';
import type { CascadeDeleteResult } from '../../api/model/cascade-delete-result';

/**
 * Wrapper over the generated admin cascade-delete client — the
 * partnership-opportunity subset only (legacy FE consumed exactly this;
 * user-level cascade endpoints exist on the BE but had no legacy UI —
 * see PARITY iter-101 verification).
 *
 * Two-step protocol: `previewPartnership` returns entity counts +
 * warnings + a one-time `confirmationCode`; `forceDeletePartnership`
 * must echo the code AND the expected total count — the BE re-verifies
 * both so a stale preview can't delete more than the admin saw.
 */
@Injectable({ providedIn: 'root' })
export class CascadeDeleteApiService {
  private readonly api = inject(GeneratedCascadeApi);

  previewPartnership(poId: number): Observable<CascadeDeletePreview> {
    return this.api.previewPartnershipOpportunityDeletion({ poId });
  }

  forceDeletePartnership(
    poId: number,
    confirmationCode: string,
    expectedEntityCount: number,
    reason?: string,
  ): Observable<CascadeDeleteResult> {
    return this.api.forceDeletePartnershipOpportunity({
      poId,
      cascadeDeleteConfirmationRequest: { confirmationCode, expectedEntityCount, reason },
    });
  }
}
