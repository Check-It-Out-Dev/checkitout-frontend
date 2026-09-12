import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';

/** Where the reel is in its life: being shot, sent for approval, approved, live. */
export type PostState = 'recording' | 'review' | 'approved' | 'published';

/**
 * The reel Ola makes for the campaign, as a small post card.
 *
 * The presentation used to stand in for "content" with an empty beige
 * rectangle (`h-14 rounded-lg bg-beige/70`) in both panes — a placeholder
 * that read as a card that never loaded (owner, 2026-09-12: "it should rather
 * show already filled components"). This is the filled version: a creator
 * header, a media area with the reel glyph and its length, the caption, and
 * the reactions row. The same card plays four states so the two panes can
 * show the same object from two sides: she sees it recording, the brand sees
 * it arrive for review, both see the approval stamp, and at publication the
 * reactions fill in.
 *
 * Nothing here is data. The handle, caption and numbers are the story's
 * literals, like the 12 000 followers.
 */
@Component({
  selector: 'app-dashboard-post-mock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoModule],
  template: `
    <div
      class="overflow-hidden rounded-xl border border-beige bg-white"
      [attr.data-testid]="'dashboard-post-' + state()"
    >
      <!-- creator row -->
      <div class="flex items-center gap-2 px-3 py-2">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-coral-400 to-coral-600 text-cream"
        >
          <mat-icon class="!h-3.5 !w-3.5 !text-sm">face</mat-icon>
        </span>
        <span class="truncate text-xs font-semibold text-ink">
          {{ 'landing.dashboard_preview.post.handle' | transloco }}
        </span>
        <span
          class="ml-auto rounded-full bg-navy-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-navy-500"
        >
          {{ 'landing.dashboard_preview.post.kind' | transloco }}
        </span>
      </div>

      <!-- the reel itself. A warm gradient, not a photo: a photo would need a
           licence and a story of its own; the gradient reads as "media" and
           stays byte-stable for the pixel baselines. -->
      <div
        class="relative flex h-[5.5rem] items-center justify-center bg-gradient-to-br from-coral-200 via-coral-100 to-navy-50"
      >
        @if (state() === 'recording') {
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-coral-700"
          >
            <span class="h-2 w-2 rounded-full bg-coral-500 rec-dot" aria-hidden="true"></span>
            {{ 'landing.dashboard_preview.post.recording' | transloco }}
          </span>
        } @else {
          <span
            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm"
            aria-hidden="true"
          >
            <mat-icon class="!text-xl">play_arrow</mat-icon>
          </span>
          <span
            class="absolute bottom-2 right-2 rounded-md bg-ink/70 px-1.5 py-0.5 font-mono text-[10px] text-cream"
          >
            {{ 'landing.dashboard_preview.post.duration' | transloco }}
          </span>
        }
        @if (state() === 'approved' || state() === 'published') {
          <span
            class="absolute left-2 top-2 rounded-full bg-success-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-success-strong"
            [class.stamp-in]="animated()"
            data-testid="dashboard-post-stamp"
          >
            {{ 'landing.dashboard_preview.beats.labels.approved' | transloco }}
          </span>
        }
      </div>

      <!-- caption + reactions -->
      <div class="flex items-center gap-3 px-3 py-2">
        <p class="min-w-0 flex-1 truncate text-xs text-slate2">
          {{ 'landing.dashboard_preview.post.caption' | transloco }}
        </p>
        <span class="flex shrink-0 items-center gap-2 text-slate2">
          <span class="inline-flex items-center gap-0.5 text-[11px]">
            <mat-icon class="!h-3.5 !w-3.5 !text-sm" [class.text-coral-500]="live()">
              favorite
            </mat-icon>
            {{ live() ? likes() : '–' }}
          </span>
          <span class="inline-flex items-center gap-0.5 text-[11px]">
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">chat_bubble</mat-icon>
            {{ live() ? comments() : '–' }}
          </span>
        </span>
      </div>
    </div>
  `,
  styles: `
    p {
      margin: 0;
    }
    /* The record light. Finite: it blinks while the beat lasts and no longer,
       so nothing in the section animates forever (demo-access asserts that
       under reduced motion, where this is off entirely). */
    .rec-dot {
      animation: rec-blink 900ms steps(2, start) 4;
    }
    @keyframes rec-blink {
      to {
        opacity: 0.2;
      }
    }
    .stamp-in {
      animation: stamp-in 340ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
    }
    @keyframes stamp-in {
      from {
        opacity: 0;
        transform: scale(1.25) rotate(-4deg);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .rec-dot,
      .stamp-in {
        animation: none;
      }
    }
  `,
})
export class DashboardPostMockComponent {
  readonly state = input.required<PostState>();
  /** Whether entry animations run — the story's `animated()`; false in the tableau. */
  readonly animated = input(false);
  /** Reactions, formatted by the parent (12 000 style) — shown once published. */
  readonly likes = input('');
  readonly comments = input('');

  readonly live = computed(() => this.state() === 'published');
}
