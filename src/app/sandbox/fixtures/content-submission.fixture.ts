import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import { AppliedOpportunityContentApiService } from '../../core/applied-opportunities/applied-opportunity-content.service';
import { ContentSubmissionComponent } from '../../feature/applied-opportunities/content-submission.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Influencer content-submission fixtures
 * (`/collaborations/registrations/:id/content`). The form + existing-
 * submissions list load together via forkJoin, so both stub methods live
 * on one service class per state. First-visit state renders the form
 * with an empty history; the returning state shows prior rows with
 * their approval badges.
 */

function routeWithId(id: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: convertToParamMap(id ? { id } : {}) },
  } as unknown as ActivatedRoute;
}

const CONTENT_TYPES: ContentTypeDtoOut[] = [
  { id: 1, name: 'Video' },
  { id: 2, name: 'Reel' },
  { id: 3, name: 'Story' },
  { id: 4, name: 'Post' },
];

const PRIOR_SUBMISSIONS: AppliedOpportunityContentDtoOut[] = [
  {
    id: 302,
    appliedOpportunityId: 102,
    contentTypeName: 'Reel',
    contentCount: 2,
    socialMediaLink: 'https://instagram.com/reel/teaser-01',
    description: 'Teaser reels for launch week.',
    approvalStatus: 'APPROVED' as never,
    createdTime: '2026-04-28T14:30:00Z',
    // Reported engagement (audit P1) — renders the metrics row + the
    // "Update engagement" affordance in the baseline.
    likesCount: 1520,
    commentsCount: 248,
    viewsCount: 11400,
    sharesCount: 77,
  },
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
];

class StubWithHistory {
  listForAppliedOpportunity(): Observable<AppliedOpportunityContentDtoOut[]> {
    return of(PRIOR_SUBMISSIONS);
  }
  listContentTypes(): Observable<ContentTypeDtoOut[]> {
    return of(CONTENT_TYPES);
  }
}

class StubFirstVisit {
  listForAppliedOpportunity(): Observable<AppliedOpportunityContentDtoOut[]> {
    return of([]);
  }
  listContentTypes(): Observable<ContentTypeDtoOut[]> {
    return of(CONTENT_TYPES);
  }
}

class StubLoadError {
  listForAppliedOpportunity(): Observable<AppliedOpportunityContentDtoOut[]> {
    return new Observable<AppliedOpportunityContentDtoOut[]>((sub) => sub.error({ status: 500 }));
  }
  listContentTypes(): Observable<ContentTypeDtoOut[]> {
    return of(CONTENT_TYPES);
  }
}

export const CONTENT_SUBMISSION_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'content-submission-with-history',
    label: 'Content submission · form + 2 prior rows (approved + pending)',
    component: ContentSubmissionComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('102') },
      { provide: AppliedOpportunityContentApiService, useClass: StubWithHistory },
    ],
  },
  {
    id: 'content-submission-first-visit',
    label: 'Content submission · blank form, no history yet',
    component: ContentSubmissionComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('102') },
      { provide: AppliedOpportunityContentApiService, useClass: StubFirstVisit },
    ],
  },
  {
    id: 'content-submission-error',
    label: 'Content submission · load error',
    component: ContentSubmissionComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('102') },
      { provide: AppliedOpportunityContentApiService, useClass: StubLoadError },
    ],
  },
];
