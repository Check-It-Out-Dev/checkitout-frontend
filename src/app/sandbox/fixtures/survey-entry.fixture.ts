import { CicdRunsShowcaseComponent } from '../../feature/survey/showcases/cicd-runs-showcase.component';
import { EstateMapShowcaseComponent } from '../../feature/survey/showcases/estate-map-showcase.component';
import { RoadmapShowcaseComponent } from '../../feature/survey/showcases/roadmap-showcase.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * The three cards that make the engineering chapter the entry page a CV links
 * to: the estate in one screen (three repositories, the engineer), what runs
 * in CI and how long it takes, and what is under way. Pure static content
 * (links + i18n), no providers. The mobile project lays each out at phone
 * width, where the repo grid and the CI rows stack.
 */
export const SURVEY_ENTRY_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'survey-estate-map',
    label: 'Survey · the estate in one screen',
    component: EstateMapShowcaseComponent,
    viewport: { width: 1180, height: 760 },
  },
  {
    id: 'survey-cicd-runs',
    label: 'Survey · CI/CD runs and durations',
    component: CicdRunsShowcaseComponent,
    viewport: { width: 1180, height: 900 },
  },
  {
    id: 'survey-roadmap',
    label: 'Survey · in progress',
    component: RoadmapShowcaseComponent,
    viewport: { width: 1180, height: 1000 },
  },
];
