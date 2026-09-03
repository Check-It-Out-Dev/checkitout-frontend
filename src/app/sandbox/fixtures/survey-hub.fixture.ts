import { SurveyHubComponent } from '../../feature/survey/survey-hub.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Technical-survey hub ("Startup in the box" README front page, ported from
 * the legacy demo build). Fully static content — chapters, overview map and
 * deep-link strip all render from the const registry + i18n, so one fixture
 * covers the page.
 */
export const SURVEY_HUB_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'survey-hub',
    label: 'Technical survey · hub',
    component: SurveyHubComponent,
  },
];
