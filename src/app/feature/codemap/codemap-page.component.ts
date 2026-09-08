import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@ngneat/transloco';
import { MarketingToolbarComponent } from '../landing/marketing-toolbar/marketing-toolbar.component';
import { TrajectoryPlayerComponent } from './trajectory-player/trajectory-player.component';

/**
 * /codemap — the public "CodeMap & AI application" page. Presents what we
 * built around the codebase-navigator model (the graph, the 4B local tier,
 * the consent-gated Claude API tier), why, and the architectural decisions —
 * with an interactive replay of REAL recorded sessions as the centerpiece.
 *
 * Sits in the same editorial system as the landing + technical survey
 * (marketing toolbar chrome, cream/ink palette, dark insets for the app's
 * own UI). The film link stays a placeholder until the Vimeo upload lands
 * ([VIMEO_DEMO_URL] — resolved by the owner, see task UX-F).
 */
@Component({
  selector: 'app-codemap-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MarketingToolbarComponent,
    TrajectoryPlayerComponent,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './codemap-page.component.html',
})
export class CodemapPageComponent {
  /** Real, resolved destinations. */
  readonly repoUrl = 'https://github.com/Check-It-Out-Dev/graph-theory-system-modeling';
  readonly installUrl =
    'https://github.com/Check-It-Out-Dev/graph-theory-system-modeling/tree/main/applications/CodeMap';
  readonly contactMail = 'norbert_marchewka@checkitout.app';

  /** The real 92-second capture, self-hosted; it plays in place under the intro. */
  readonly filmSrc = 'assets/codemap/codemap-demo.mp4';
  readonly filmPlaying = signal(false);
  playFilm(): void {
    this.filmPlaying.set(true);
  }

  /** Training journey milestones (numbers are the measured gate results). */
  readonly journey = [
    { key: 'r1', value: '0/20' },
    { key: 'r2', value: '0.95' },
    { key: 'r22', value: '0.9752' },
    { key: 'api', value: '4' },
  ] as const;

  /** The architectural decisions worth defending in an interview. */
  readonly decisions = [
    { key: 'structure', icon: 'hub' },
    { key: 'openbook', icon: 'menu_book' },
    { key: 'grammar', icon: 'rule' },
    { key: 'abstention', icon: 'front_hand' },
    { key: 'consent', icon: 'verified_user' },
    { key: 'mit', icon: 'lock_open' },
  ] as const;
}
