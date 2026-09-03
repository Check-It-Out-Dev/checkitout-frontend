import { TeamComponent } from '../../feature/team/team.component';
import type { SandboxFixture } from '../sandbox-registry';

export const TEAM_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'team',
    label: 'Team page · 8 members, marketing chrome (iter-55 P0 #8)',
    component: TeamComponent,
    viewport: { width: 1280, height: 1600 },
  },
];
