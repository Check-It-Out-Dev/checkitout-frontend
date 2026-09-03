import { MatDialogRef } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';
import { LegalApiService } from '../../core/legal/legal-api.service';
import { RateLimitStateService } from '../../core/rate-limit/rate-limit-state.service';
import { ShellStatusService } from '../../core/shell/shell-status.service';
import { ReconsentDialogComponent } from '../../feature/legal/reconsent-dialog.component';
import { ShellBannersComponent } from '../../feature/shell/shell-banners.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * J9 blocked-account surfaces: the red blocked-terms shell banner and
 * the reconsent dialog it opens. The dialog renders bare here (no
 * overlay) so the clickwrap + days-remaining chip are baseline-able.
 */

const DOCS: LegalDocumentDtoOut[] = [
  { type: 'TERMS_OF_SERVICE', version: 3, contentHash: 'h1' } as LegalDocumentDtoOut,
  { type: 'PRIVACY_POLICY', version: 2, contentHash: 'h2' } as LegalDocumentDtoOut,
  { type: 'COOKIE_POLICY', version: 2, contentHash: 'h3' } as LegalDocumentDtoOut,
];

class StubLegalApi {
  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return of(DOCS);
  }
  prepareConsentCookie(): Observable<void> {
    return of(undefined);
  }
  recordConsentBatch(): Observable<unknown> {
    return of({});
  }
}

class StubDialogRef {
  close(): void {
    /* no-op */
  }
}

/** ShellStatusService replacement pre-set to the blocked state. */
class StubStatusBlocked extends ShellStatusService {
  constructor() {
    super();
    this.setBlockedForTerms(true, 5);
  }
}

/** RateLimitStateService pre-set to an active 429 cool-down (retry in 30s). */
class StubRateLimited extends RateLimitStateService {
  constructor() {
    super();
    this.notify(30);
  }
}

/** ShellStatusService replacement pre-set to the trial-offer nudge state. */
class StubStatusTrialOffer extends ShellStatusService {
  constructor() {
    super();
    this.setTrialOffer(true);
  }
}

export const RECONSENT_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'shell-banner-blocked-terms',
    label: 'Shell banner · account blocked for unaccepted terms (5 days left)',
    component: ShellBannersComponent,
    providers: [{ provide: ShellStatusService, useClass: StubStatusBlocked }],
  },
  {
    id: 'shell-banner-rate-limit',
    label: 'Shell banner · rate limited (429, retry in ~30s)',
    component: ShellBannersComponent,
    providers: [{ provide: RateLimitStateService, useClass: StubRateLimited }],
  },
  {
    id: 'shell-banner-trial-offer',
    label: 'Shell banner · Enterprise-trial nudge for an eligible free company',
    component: ShellBannersComponent,
    providers: [{ provide: ShellStatusService, useClass: StubStatusTrialOffer }],
  },
  {
    id: 'reconsent-dialog-default',
    label: 'Reconsent dialog · 3-doc clickwrap + days remaining',
    component: ReconsentDialogComponent,
    providers: [
      { provide: ShellStatusService, useClass: StubStatusBlocked },
      { provide: LegalApiService, useClass: StubLegalApi },
      { provide: MatDialogRef, useClass: StubDialogRef },
    ],
  },
];
