import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * World-sim shell — the shared backdrop/frame for "outside world" simulators
 * (phone authenticator, inbox, Fakturownia, KSeF). Visually distinct from the
 * app on purpose: the user should instantly read "this is the world around
 * the app, not the app". Always carries the honesty caption underneath.
 * No close button by design — a sim lives exactly as long as its scenario
 * step; the guide drives when it appears and disappears.
 *
 * Editorial restyle (ported from the legacy demo build): the center scrim is
 * navy-900 (the greenfield dark), the dock caption sits on a white card with
 * a beige border instead of the legacy slate chip.
 */
@Component({
  selector: 'app-world-sim-shell',
  standalone: true,
  template: `
    <!-- center: the sim IS the scene (backdrop). dock: the sim sits beside the
         app (bottom-left, no backdrop) so dialogs/forms stay usable next to it.
         ONE ng-content only — Angular projects content once, so branching the
         slot across two @if trees silently swallows it. -->
    <div
      class="fixed z-[99980]"
      [class]="
        position === 'center' ? 'inset-0 flex items-center justify-center p-4' : 'bottom-4 left-4'
      "
      [attr.role]="position === 'center' ? 'dialog' : 'complementary'"
      [attr.aria-modal]="position === 'center' ? 'true' : null"
    >
      @if (position === 'center') {
        <!-- explicit z pair: the filled simPop transform animation promotes the
             card to its own compositor layer, and Chrome then paints the
             z-auto scrim ABOVE the later sibling — integer z-indexes pin the
             intended order instead of trusting tree-order heuristics.
             Opaque color + element opacity (not bg alpha): Chrome skipped
             compositing the rgba() fill on this huge fixed-context layer
             entirely — layer opacity renders everywhere. -->
        <div class="absolute inset-0 z-0 bg-navy-900 opacity-50"></div>
      }
      <div class="sim-pop relative z-10">
        <ng-content></ng-content>
        <p
          class="mt-2.5 text-center text-[11px] font-medium"
          [class]="
            position === 'center'
              ? 'text-cream/90'
              : 'max-w-[18rem] rounded-lg border border-beige bg-white/95 px-2 py-1 text-slate2 shadow-sm'
          "
        >
          {{ caption }}
        </p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .sim-pop {
        animation: simPop 0.3s ease-out both;
      }
      @keyframes simPop {
        from {
          opacity: 0;
          transform: scale(0.96) translateY(8px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .sim-pop {
          animation: none;
        }
      }
    `,
  ],
})
export class WorldSimShellComponent {
  /** The "symulacja…" honesty line under the frame. */
  @Input({ required: true }) caption!: string;

  /** center = sole scene with backdrop; dock = beside the app, no backdrop. */
  @Input() position: 'center' | 'dock' = 'center';
}
