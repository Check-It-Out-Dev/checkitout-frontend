import { GrantsComponent } from '../../feature/grants/grants.component';
import type { SandboxFixture } from '../sandbox-registry';

export const GRANTS_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'grants',
    label: 'Grants page · EU funding disclosure, marketing chrome (iter-56 P0 #8)',
    component: GrantsComponent,
    viewport: { width: 1280, height: 2000 },
  },
];
