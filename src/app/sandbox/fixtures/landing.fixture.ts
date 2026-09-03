import { LandingComponent } from '../../feature/landing/landing.component';
import type { SandboxFixture } from '../sandbox-registry';

export const LANDING_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'landing',
    label: 'Landing page',
    component: LandingComponent,
    viewport: { width: 1280, height: 1200 },
  },
];
