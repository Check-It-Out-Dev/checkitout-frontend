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
 *
 * The connection moves. Two signals — the creator's coral dot and the
 * company's navy ring — set off from opposite ends of the dashed line, pass
 * through each other in the middle and carry on to the far side, then turn
 * and come back without stopping. At the crossing the 12 px disc is drawn inside the 16 px
 * ring, so for a beat the two glyphs compose into one mark. That is the
 * picture of the product: a campaign is two parties' signals meeting.
 *
 * It is pure CSS, `transform` only. No layout work per frame, no change
 * detection (the class stays empty), nothing for SSR to reconcile. Travel
 * is expressed in container-query units so it scales with the card, and the
 * two keyframe sets are mirror images on one 4.8 s timeline, which is why
 * the centres coincide at exactly 25 % and 75 % of a cycle. Under
 * `prefers-reduced-motion` the dots simply sit at home with the line between
 * them, which is the illustration the page had always meant to show — it had
 * not, in fact, been showing it: at the card's 392 px the old row left the
 * line 0 px wide at every desktop viewport.
 */
@Component({
  selector: 'app-hero-illustration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoModule],
  templateUrl: './hero-illustration.component.html',
  styles: `
    .hero-connection {
      container-type: inline-size;
    }

    /* Each dot travels the container's width less its own diameter, so both
       centres land on 50cqw at the same instant. There is no hold at either
       end: the legs are ease-in-out, so a dot slows into the turn and pulls
       away from it like a pendulum, but it is never parked. The first cut had
       0.4 s rests at each end and the owner asked for them gone — continuous
       motion reads as more alive. */
    @keyframes hero-cross-ltr {
      0% {
        transform: translateX(0);
      }
      50% {
        transform: translateX(calc(100cqw - 0.75rem));
      }
      100% {
        transform: translateX(0);
      }
    }
    @keyframes hero-cross-rtl {
      0% {
        transform: translateX(0);
      }
      50% {
        transform: translateX(calc(1rem - 100cqw));
      }
      100% {
        transform: translateX(0);
      }
    }
    .hero-dot--creator {
      animation: hero-cross-ltr 4.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    }
    .hero-dot--company {
      animation: hero-cross-rtl 4.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .hero-dot {
        animation: none;
      }
    }
  `,
})
export class HeroIllustrationComponent {}
