import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatDialogTitle } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type DialogHeaderTone = 'warn' | 'coral' | 'navy';

const TONES: Record<DialogHeaderTone, { tile: string; icon: string; eyebrow: string }> = {
  warn: { tile: 'bg-red-50', icon: 'text-red-600', eyebrow: 'text-red-700' },
  coral: { tile: 'bg-coral-50', icon: 'text-coral-700', eyebrow: 'text-coral-700' },
  navy: { tile: 'bg-slate-100', icon: 'text-navy-900', eyebrow: 'text-slate2' },
};

/**
 * The brand dialog header: icon tile, serif title, small-caps eyebrow — the
 * pattern the reject-applicant and account-deletion dialogs introduced, shared
 * so the older dialogs (step-up, 2FA, plan changes, trial consent) stop
 * showing Material's plain sans heading next to them.
 *
 * The title keeps the `mat-dialog-title` directive so the dialog container is
 * still labelled for assistive tech; its MDC styles (padding, typography and
 * the 40 px `::before` spacer) are overridden so the row lays out as a flex
 * pair with the tile.
 */
@Component({
  selector: 'app-dialog-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogTitle, MatIconModule],
  template: `
    <div class="flex items-start gap-3 p-6 pb-0">
      <span [class]="tileClass()" data-testid="dialog-header-tile">
        <mat-icon [class]="iconClass()">{{ icon() }}</mat-icon>
      </span>
      <div class="min-w-0">
        <h2
          mat-dialog-title
          class="!m-0 !p-0 !font-display !text-3xl !font-normal !leading-tight !tracking-[-0.02em] !text-ink before:!hidden"
          [attr.data-testid]="titleTestId() ?? null"
        >
          <ng-content />
        </h2>
        @if (eyebrow()) {
          <p [class]="eyebrowClass()" data-testid="dialog-header-eyebrow">{{ eyebrow() }}</p>
        }
      </div>
    </div>
  `,
})
export class DialogHeaderComponent {
  /** Material icon name — must be in the subset (`check:icon-subset`). */
  readonly icon = input.required<string>();
  readonly tone = input<DialogHeaderTone>('coral');
  /** Small-caps line under the title; omitted when empty. */
  readonly eyebrow = input<string>('');
  /** Forwarded to the `<h2>` so existing specs and tours keep their hook. */
  readonly titleTestId = input<string | undefined>(undefined);

  readonly tileClass = computed(
    () =>
      `inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TONES[this.tone()].tile}`,
  );
  readonly iconClass = computed(() => `!h-7 !w-7 !text-2xl ${TONES[this.tone()].icon}`);
  readonly eyebrowClass = computed(
    () => `mt-1 font-mono text-[10px] uppercase tracking-[0.18em] ${TONES[this.tone()].eyebrow}`,
  );
}
