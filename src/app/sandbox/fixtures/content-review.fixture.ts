import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { AppliedOpportunityContentApiService } from '../../core/applied-opportunities/applied-opportunity-content.service';
import { ContentReviewComponent } from '../../feature/opportunities/content-review.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Company content-review fixtures
 * (`/collaborations/applications/:id/review`). Loaded state carries one
 * row per approval status — PENDING (Approve/Reject pair), APPROVED,
 * REJECTED (+notes) — and an APPROVED row exists, so the
 * rate-the-influencer block is also visible in the same baseline.
 */

function routeWithId(id: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: convertToParamMap(id ? { id } : {}) },
  } as unknown as ActivatedRoute;
}

const CONTENT_ROWS: AppliedOpportunityContentDtoOut[] = [
  {
    id: 301,
    appliedOpportunityId: 102,
    contentTypeName: 'Video',
    contentCount: 1,
    socialMediaLink: 'https://instagram.com/p/sneaker-longform',
    description: 'Long-form review, first cut.',
    approvalStatus: 'PENDING' as never,
    createdTime: '2026-05-02T10:00:00Z',
  },
  {
    id: 302,
    appliedOpportunityId: 102,
    contentTypeName: 'Reel',
    contentCount: 2,
    socialMediaLink: 'https://instagram.com/reel/teaser-01',
    description: 'Teaser reels for launch week.',
    approvalStatus: 'APPROVED' as never,
    createdTime: '2026-04-28T14:30:00Z',
    // Influencer-reported engagement (audit P1) — renders the read-only
    // metrics row on the company side.
    likesCount: 1520,
    commentsCount: 248,
    viewsCount: 11400,
    sharesCount: 77,
  },
  {
    id: 303,
    appliedOpportunityId: 102,
    contentTypeName: 'Story',
    contentCount: 3,
    description: 'Story set — draft frames.',
    approvalStatus: 'REJECTED' as never,
    approvalNotes: 'Logo obscured in frames 2–3; please reshoot.',
    createdTime: '2026-04-25T09:15:00Z',
  },
];

const APPLICATION: AppliedOpportunityDtoOut = {
  id: 102,
  opportunityStatus: { value: 'CONTENT_SEND_TO_ACCEPT', label: 'Content under review' } as never,
  companyRateStatus: { value: 'DEFAULT', label: 'Default' } as never,
  influencer: { firstName: 'Anna', lastName: 'Kowalska' } as never,
  partnershipOpportunity: { id: 1, title: 'Spring sneaker drop — long-form review' } as never,
};

class StubContentLoaded {
  listForAppliedOpportunity(): Observable<AppliedOpportunityContentDtoOut[]> {
    return of(CONTENT_ROWS);
  }
}

class StubContentEmpty {
  listForAppliedOpportunity(): Observable<AppliedOpportunityContentDtoOut[]> {
    return of([]);
  }
}

class StubContentError {
  listForAppliedOpportunity(): Observable<AppliedOpportunityContentDtoOut[]> {
    return new Observable<AppliedOpportunityContentDtoOut[]>((sub) => sub.error({ status: 500 }));
  }
}

class StubApplication {
  getById(): Observable<AppliedOpportunityDtoOut> {
    return of(APPLICATION);
  }
}

export const CONTENT_REVIEW_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'content-review-loaded',
    label: 'Content review · pending decision pair + approved + rejected (+rating block)',
    component: ContentReviewComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('102') },
      { provide: AppliedOpportunityContentApiService, useClass: StubContentLoaded },
      { provide: AppliedOpportunityApiService, useClass: StubApplication },
    ],
  },
  {
    id: 'content-review-empty',
    label: 'Content review · nothing submitted yet',
    component: ContentReviewComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('102') },
      { provide: AppliedOpportunityContentApiService, useClass: StubContentEmpty },
      { provide: AppliedOpportunityApiService, useClass: StubApplication },
    ],
  },
  {
    id: 'content-review-error',
    label: 'Content review · load error',
    component: ContentReviewComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('102') },
      { provide: AppliedOpportunityContentApiService, useClass: StubContentError },
      { provide: AppliedOpportunityApiService, useClass: StubApplication },
    ],
  },
];
