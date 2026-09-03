import { SupportComponent } from '../../feature/support/support.component';
import type { SandboxFixture } from '../sandbox-registry';

export const SUPPORT_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'support-home',
    label: 'Support home · contact card + FAQ accordion (iter-57 P0 #8)',
    component: SupportComponent,
    viewport: { width: 1280, height: 1500 },
  },
];
