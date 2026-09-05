import { InteractiveDashboardPreviewComponent } from '../../feature/landing/interactive-dashboard-preview/interactive-dashboard-preview.component';
import { LandingComponent } from '../../feature/landing/landing.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * The landing page, plus three beats of its collaboration story — the ones
 * whose cards differ most: the application arriving, the reel in production,
 * the published result. `previewBeat` jumps straight to a beat with no timers
 * running, so the pixels are stable.
 */
export const LANDING_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'landing',
    label: 'Landing page',
    component: LandingComponent,
    viewport: { width: 1280, height: 1200 },
  },
  {
    id: 'dashboard-preview-application',
    label: 'Dashboard preview — application beat',
    component: InteractiveDashboardPreviewComponent,
    inputs: { previewBeat: 1 },
    viewport: { width: 1280, height: 900 },
  },
  {
    id: 'dashboard-preview-production',
    label: 'Dashboard preview — content beat',
    component: InteractiveDashboardPreviewComponent,
    inputs: { previewBeat: 4 },
    viewport: { width: 1280, height: 900 },
  },
  {
    id: 'dashboard-preview-results',
    label: 'Dashboard preview — results beat',
    component: InteractiveDashboardPreviewComponent,
    inputs: { previewBeat: 6 },
    viewport: { width: 1280, height: 900 },
  },
];
