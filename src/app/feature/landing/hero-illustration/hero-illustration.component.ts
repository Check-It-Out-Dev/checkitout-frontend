import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';

/**
 * Hero dashboard preview illustration for the landing page.
 *
 * Replicates the legacy right-column composition: a large soft card with an
 * influencer↔company connection diagram, plus two floating product-shot
 * cards (Instagram analytics + Kasia campaign progress).
 *
 * Built with Tailwind composition + Material icons rather than a raster
 * asset — keeps it themable, scales cleanly, no PNG export pipeline.
 *
 * Strings are i18n-driven; numeric data (12 000 followers, 75% progress)
 * are illustrative literals locked in the template — they're part of the
 * visual story, not real data.
 */
@Component({
    selector: 'app-hero-illustration',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule, TranslocoModule],
    templateUrl: './hero-illustration.component.html'
})
export class HeroIllustrationComponent {}
