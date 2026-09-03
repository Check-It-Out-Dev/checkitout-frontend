import { CodemapPageComponent } from '../../feature/codemap/codemap-page.component';
import { TrajectoryPlayerComponent } from '../../feature/codemap/trajectory-player/trajectory-player.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * /codemap page fixtures. The trajectory player replays VERBATIM recorded
 * sessions, so determinism comes from the data itself; what these fixtures
 * pin down is the ANIMATION nondeterminism: `preset` renders a finished run
 * synchronously and `autoplay: false` keeps the idle frame idle (otherwise
 * the IntersectionObserver would start the first capture mid-screenshot).
 * The page fixture's 900px viewport deliberately keeps the player below the
 * fold for the same reason — it captures the hero + link row.
 */
export const CODEMAP_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'codemap-page-hero',
    label: 'CodeMap page · hero + link row (player below fold)',
    component: CodemapPageComponent,
    viewport: { width: 1280, height: 900 },
  },
  {
    id: 'codemap-player-idle',
    label: 'CodeMap · trajectory player (idle, autoplay off)',
    component: TrajectoryPlayerComponent,
    inputs: { autoplay: false },
    viewport: { width: 960, height: 520 },
  },
  {
    id: 'codemap-player-honest-done',
    label: 'CodeMap · trajectory player (honest run, finished: pass → consent → API)',
    component: TrajectoryPlayerComponent,
    inputs: { preset: 'honest' },
    viewport: { width: 960, height: 1050 },
  },
];
