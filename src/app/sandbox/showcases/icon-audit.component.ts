import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

interface IconSize {
  readonly label: string;
  /** The exact `!h-* !w-* !text-*` idiom used across the app (survey, cards). */
  readonly boxClass: string;
}

/**
 * Icon-clip audit sandbox — a regression guard for the mat-icon bottom-clip
 * bug (styles.scss `mat-icon.mat-icon { line-height: 1 }`). Renders every
 * `!h-N !w-N !text-*` sizing idiom the app uses, each glyph framed by a 1px
 * box matching its declared bounds. A glyph whose ink crosses the bottom edge
 * is a clip regression; all glyphs must sit fully inside their frame.
 *
 * Not a production surface — sandbox-only, so it takes a visual baseline
 * (`icon-audit`) but no legacy component-pair.
 */
@Component({
    selector: 'app-icon-audit',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    template: `
    <div class="min-h-screen bg-cream p-8 text-ink">
      <header class="mx-auto mb-8 max-w-5xl">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-coral-600">Icon audit</p>
        <h1 class="font-display mt-2 text-3xl text-ink">mat-icon sizing · clip guard</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate2">
          Each glyph sits inside a 1px frame matching its
          <code>!h-* !w-*</code>
          box. A glyph touching or crossing the bottom edge is the
          <code>!text-*</code>
          line-height clip regression — all should sit fully inside their frame.
        </p>
      </header>

      <div class="mx-auto max-w-5xl space-y-8">
        @for (size of sizes; track size.label) {
          <section>
            <h2 class="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-slate2">
              {{ size.label }}
            </h2>
            <div class="flex flex-wrap gap-2">
              @for (name of icons; track name) {
                <span
                  class="inline-flex items-center justify-center rounded-[3px] bg-white p-2 ring-1 ring-beige"
                  [attr.data-icon]="name"
                >
                  <span class="inline-flex ring-1 ring-coral-300">
                    <mat-icon [class]="size.boxClass + ' text-ink'">{{ name }}</mat-icon>
                  </span>
                </span>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `
})
export class IconAuditComponent {
  readonly sizes: readonly IconSize[] = [
    { label: 'sm · !h-3.5 !w-3.5 !text-sm', boxClass: '!h-3.5 !w-3.5 !text-sm' },
    { label: 'base · !h-4 !w-4 !text-base', boxClass: '!h-4 !w-4 !text-base' },
    { label: 'xl · !h-5 !w-5 !text-xl', boxClass: '!h-5 !w-5 !text-xl' },
    { label: 'default · 24px', boxClass: '' },
  ];

  /** Curated from the shipped subset — mixes descenders, full-height glyphs
   * and the exact icons the technical survey + collaboration cards render. */
  readonly icons: readonly string[] = [
    'arrow_forward',
    'arrow_back',
    'extension',
    'check_circle',
    'bolt',
    'block',
    'cloud_off',
    'fact_check',
    'fingerprint',
    'download',
    'lock',
    'explore',
    'engineering',
    'campaign',
    'build',
    'description',
    'memory',
    'layers',
    'paid',
    'gavel',
    'handshake',
    'notifications',
    'done_all',
    'error_outline',
  ];
}
