import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { AppliedOpportunityDtoOut } from '../../api/model/applied-opportunity-dto-out';
import type { AppliedOpportunityStatisticsDto } from '../../api/model/applied-opportunity-statistics-dto';
import type { PageAppliedOpportunityDtoOut } from '../../api/model/page-applied-opportunity-dto-out';
import { AppliedOpportunityApiService } from '../../core/applied-opportunities/applied-opportunity.service';
import { SessionStateService } from '../../core/auth/session-state.service';
import { CollaborationDashboardComponent } from '../../feature/collaborations/collaboration-dashboard.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Journey 5 — collaboration dashboard fixtures. The in-progress states cover
 * the workflow's mid-flight statuses with role-aware CTAs (amber = this user
 * must act); the finished state covers DONE (unrated → amber "rate") and both
 * terminal rejections.
 */

const IN_PROGRESS_SAMPLE: AppliedOpportunityDtoOut[] = [
  {
    id: 301,
    createdTime: '2026-09-01T10:00:00Z',
    lastUpdateTime: '2026-09-01T09:12:00Z',
    opportunityStatus: { value: 'ACCEPTED_BY_INFLUENCER', label: 'Offer accepted' } as never,
    influencer: { id: 9, name: 'Marta Vlogs', displayName: 'marta.vlogs' } as never,
    partnershipOpportunity: {
      id: 21,
      title: 'Summer rooftop menu launch',
      company: { id: 4, name: 'Bistro Widok' },
    } as never,
  },
  {
    id: 302,
    createdTime: '2026-06-12T15:30:00Z',
    lastUpdateTime: '2026-09-01T18:40:00Z',
    opportunityStatus: { value: 'CONTENT_SEND_TO_ACCEPT', label: 'Content under review' } as never,
    influencer: { id: 11, name: 'Kuba Runs', displayName: 'kuba.runs' } as never,
    partnershipOpportunity: {
      id: 22,
      title: 'Trail-running shoe field test',
      company: { id: 5, name: 'Peak Athletics' },
    } as never,
  },
  {
    id: 303,
    createdTime: '2026-06-05T09:00:00Z',
    lastUpdateTime: '2026-09-01T11:05:00Z',
    opportunityStatus: { value: 'CONTENT_REJECTED', label: 'Revisions requested' } as never,
    influencer: { id: 12, name: 'Ola Cooks', displayName: 'ola.cooks' } as never,
    partnershipOpportunity: {
      id: 23,
      title: 'Slow-food pasta workshop',
      company: { id: 6, name: 'Trattoria Nonna' },
    } as never,
  },
  {
    id: 304,
    createdTime: '2026-05-28T12:00:00Z',
    lastUpdateTime: '2026-09-01T16:20:00Z',
    opportunityStatus: { value: 'TO_BE_PAID', label: 'Awaiting payment' } as never,
    influencer: { id: 13, name: 'Iga Design', displayName: 'iga.design' } as never,
    partnershipOpportunity: {
      id: 24,
      title: 'Atelier open-day recap reel',
      company: { id: 7, name: 'Studio Forma' },
    } as never,
  },
];

const FINISHED_SAMPLE: AppliedOpportunityDtoOut[] = [
  {
    id: 401,
    createdTime: '2026-04-10T10:00:00Z',
    lastUpdateTime: '2026-05-30T10:00:00Z',
    opportunityStatus: { value: 'DONE', label: 'Done' } as never,
    rateStatus: { value: 'DEFAULT', label: 'Not rated' } as never,
    companyRateStatus: { value: 'POSITIVE', label: 'Positive' } as never,
    influencer: { id: 9, name: 'Marta Vlogs' } as never,
    partnershipOpportunity: {
      id: 25,
      title: 'Spring lookbook collab',
      company: { id: 8, name: 'Vintro Moda' },
    } as never,
  },
  {
    id: 402,
    createdTime: '2026-03-02T10:00:00Z',
    lastUpdateTime: '2026-03-18T10:00:00Z',
    opportunityStatus: {
      value: 'REJECTED_BY_INFLUENCER',
      label: 'Declined by influencer',
    } as never,
    influencer: { id: 14, name: 'Piotr Tech' } as never,
    partnershipOpportunity: {
      id: 26,
      title: 'Smart-home starter kit review',
      company: { id: 9, name: 'DomoTech' },
    } as never,
  },
  {
    id: 403,
    createdTime: '2026-02-14T10:00:00Z',
    lastUpdateTime: '2026-02-20T10:00:00Z',
    opportunityStatus: { value: 'REJECTED_BY_COMPANY', label: 'Rejected by company' } as never,
    influencer: { id: 15, name: 'Nina Beauty' } as never,
    partnershipOpportunity: {
      id: 27,
      title: 'Hand-cream winter push',
      company: { id: 10, name: 'Herbal Lab' },
    } as never,
  },
];

const STATS: AppliedOpportunityStatisticsDto = {
  inProgress: 4,
  newOpportunities: 2,
  done: 3,
  total: 9,
};

function pageOf(rows: AppliedOpportunityDtoOut[]): PageAppliedOpportunityDtoOut {
  return { content: rows, totalElements: rows.length, number: 0, size: 6 };
}

class StubInProgress {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of(pageOf(IN_PROGRESS_SAMPLE));
  }
  getStatistics(): Observable<AppliedOpportunityStatisticsDto> {
    return of(STATS);
  }
}

class StubFinished {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of(pageOf(FINISHED_SAMPLE));
  }
  getStatistics(): Observable<AppliedOpportunityStatisticsDto> {
    return of(STATS);
  }
}

class StubEmpty {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return of(pageOf([]));
  }
  getStatistics(): Observable<AppliedOpportunityStatisticsDto> {
    return of({ inProgress: 0, newOpportunities: 0, done: 0, total: 0 });
  }
}

class StubError {
  list(): Observable<PageAppliedOpportunityDtoOut> {
    return new Observable<PageAppliedOpportunityDtoOut>((sub) => sub.error({ status: 500 }));
  }
  getStatistics(): Observable<AppliedOpportunityStatisticsDto> {
    return of(STATS);
  }
}

function routeWithTab(tab: 'in-progress' | 'finished'): ActivatedRoute {
  return { data: of({ collabTab: tab }) } as unknown as ActivatedRoute;
}

function sessionAs(role: 'COMPANY' | 'INFLUENCER'): Partial<SessionStateService> {
  return {
    user: signal({ id: 1, userType: { value: role } } as never).asReadonly(),
  } as Partial<SessionStateService>;
}

export const COLLABORATION_DASHBOARD_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'collaboration-dashboard-in-progress-company',
    label: 'Collaboration dashboard · in-progress, company view (review/payment CTAs)',
    component: CollaborationDashboardComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubInProgress },
      { provide: ActivatedRoute, useValue: routeWithTab('in-progress') },
      { provide: SessionStateService, useValue: sessionAs('COMPANY') },
    ],
  },
  {
    id: 'collaboration-dashboard-in-progress-influencer',
    label: 'Collaboration dashboard · in-progress, influencer view (submit/publish CTAs)',
    component: CollaborationDashboardComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubInProgress },
      { provide: ActivatedRoute, useValue: routeWithTab('in-progress') },
      { provide: SessionStateService, useValue: sessionAs('INFLUENCER') },
    ],
  },
  {
    id: 'collaboration-dashboard-finished',
    label: 'Collaboration dashboard · finished tab (unrated DONE + rejections)',
    component: CollaborationDashboardComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubFinished },
      { provide: ActivatedRoute, useValue: routeWithTab('finished') },
      { provide: SessionStateService, useValue: sessionAs('INFLUENCER') },
    ],
  },
  {
    id: 'collaboration-dashboard-empty',
    label: 'Collaboration dashboard · empty state',
    component: CollaborationDashboardComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubEmpty },
      { provide: ActivatedRoute, useValue: routeWithTab('in-progress') },
      { provide: SessionStateService, useValue: sessionAs('COMPANY') },
    ],
  },
  {
    id: 'collaboration-dashboard-error',
    label: 'Collaboration dashboard · error state',
    component: CollaborationDashboardComponent,
    providers: [
      { provide: AppliedOpportunityApiService, useClass: StubError },
      { provide: ActivatedRoute, useValue: routeWithTab('in-progress') },
      { provide: SessionStateService, useValue: sessionAs('COMPANY') },
    ],
  },
];
