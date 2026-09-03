import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';

/**
 * The 92-second CodeMap demo film in a lightbox (re-shot 2026-09-03 with the
 * graph-native 80B scene). The source is the real capture shot against the
 * live app (self-hosted asset, streams progressively thanks to faststart) —
 * when the Vimeo upload lands (task UX-F), FILM_SRC swaps for the player URL
 * and the <video> for the Vimeo <iframe>; everything else stays.
 */
@Component({
  selector: 'app-codemap-film-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    <div class="relative bg-ink" data-testid="codemap-film-dialog">
      <button
        type="button"
        (click)="ref.close()"
        class="absolute -top-1 right-0 z-10 m-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-cream transition hover:bg-black/80"
        [attr.aria-label]="'landing.codemap.film.close' | transloco"
        data-testid="codemap-film-close"
      >
        <mat-icon>close</mat-icon>
      </button>
      <video
        class="block max-h-[80vh] w-full"
        [src]="FILM_SRC"
        poster="assets/codemap/codemap-demo-poster.jpg"
        controls
        autoplay
        playsinline
        data-testid="codemap-film-video"
      ></video>
      <p class="px-4 py-2 text-center text-xs text-cream/60">
        {{ 'landing.codemap.film.note' | transloco }}
      </p>
    </div>
  `,
})
export class CodemapFilmDialogComponent {
  readonly ref = inject(MatDialogRef<CodemapFilmDialogComponent>);
  /** UX-F swap point: replace with the Vimeo player URL + iframe. */
  readonly FILM_SRC = 'assets/codemap/codemap-demo.mp4';
}
