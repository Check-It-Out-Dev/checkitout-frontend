import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Greenfield rewrite showcase (ported from the legacy demo build,
 * feature/demo — content unchanged). Verified against INVENTORY §11 +
 * fe-greenfield source recon:
 *   • Contract pipeline: openapi-generator 7.10.0 (stringEnums, single request
 *     param, interfaces) → 216 models + 74 services; tools/suppress-api-types.mjs
 *     auto-fixes 3 REAL generator bugs (Observable<any>→void on 204 endpoints,
 *     caught 2026-05-10 on activateTrial; blob-fallback casting a 27 KB JSON
 *     payload to {}, caught 2026-05-09); G2 gate keeps features off the raw
 *     client behind 18 typed wrapper domains.
 *   • Proofs: 14-route × 4-device Playwright pixel parity vs the legacy UI at
 *     a deliberate 20% threshold with self-expiring waivers; Stage-5b trace
 *     equivalence (legacy :4200 vs rewrite :4201 against the same BE, traces
 *     canonicalized UUID→:id and structurally diffed); 42 integration specs,
 *     each a 1:1 Cucumber port (enforced by its own gate).
 *   • Why: the legacy FE rests on a commercial UI license — G1 check:no-legacy-ui
 *     is the forcing function so the frontend can ship open source under MIT.
 * Honesty: LICENSE is MIT (README still says Apache in 3 places — known
 * drift); webkit projects need a one-time playwright install.
 */
@Component({
  selector: 'app-greenfield-rewrite-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="REWRITE"
      [title]="'landing.survey.rewrite.title' | transloco"
      [subtitle]="'landing.survey.rewrite.subtitle' | transloco"
    >
      <!-- the contract pipeline -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.rewrite.pipelineLabel' | transloco }}
      </p>
      <div class="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        @for (s of pipeline; track s.k) {
          <div class="relative rounded-xl border border-beige bg-cream p-4">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ s.icon }}</mat-icon>
            </div>
            <div class="mt-2.5 text-xs font-semibold leading-tight text-ink">
              {{ 'landing.survey.rewrite.pipe.' + s.k + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.rewrite.pipe.' + s.k + '.d' | transloco }}
            </div>
            @if (!$last) {
              <mat-icon
                class="absolute -right-3 top-8 z-10 hidden !h-5 !w-5 !text-xl text-beige lg:block"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- two parity proofs -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.rewrite.proofLabel' | transloco }}
      </p>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
        @for (p of proofs; track p.k) {
          <div class="rounded-xl border border-beige bg-cream p-4">
            <div class="flex items-center gap-2">
              <mat-icon class="!h-4 !w-4 !text-base text-coral-600">{{ p.icon }}</mat-icon>
              <span class="text-sm font-semibold text-ink">
                {{ 'landing.survey.rewrite.proofs.' + p.k + '.t' | transloco }}
              </span>
            </div>
            <p class="mt-1.5 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.rewrite.proofs.' + p.k + '.d' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- why it exists -->
      <div class="mt-5 rounded-xl border border-coral-100 bg-coral-50 p-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">lock_open</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.rewrite.whyLabel' | transloco }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.rewrite.why' | transloco }}
        </p>
      </div>

      <!-- fact chips -->
      <div class="mt-4 flex flex-wrap gap-2">
        @for (f of facts; track f) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-cream px-3 py-1 text-xs font-medium text-ink"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-coral-600">check_circle</mat-icon>
            {{ 'landing.survey.rewrite.facts.' + f | transloco }}
          </span>
        }
      </div>

      <!-- real parity threshold + post-processor bugs -->
      <div class="mt-5">
        <app-code-panel file="parity.spec.ts · suppress-api-types.mjs">
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.rewrite.snippetCaption' | transloco }}
      </p>
      <p class="mt-1 text-[11px] text-slate2">{{ 'landing.survey.rewrite.caveat' | transloco }}</p>

      <!-- how the rewrite was actually done: methods + FE architecture -->
      <div class="mt-8 border-t border-beige pt-7">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-coral-600">
          {{ 'landing.survey.rewrite.method.eyebrow' | transloco }}
        </p>
        <h3 class="mt-2 font-display text-xl font-semibold leading-tight text-ink sm:text-2xl">
          {{ 'landing.survey.rewrite.method.headline' | transloco }}
        </h3>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate2">
          {{ 'landing.survey.rewrite.method.intro' | transloco }}
        </p>

        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          @for (b of methodBlocks; track b.k) {
            <div class="rounded-xl border border-beige bg-cream p-4">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
                >
                  <mat-icon class="!h-4 !w-4 !text-base">{{ b.icon }}</mat-icon>
                </span>
                <span class="text-sm font-semibold text-ink">
                  {{ 'landing.survey.rewrite.method.blocks.' + b.k + '.t' | transloco }}
                </span>
              </div>
              <p class="mt-2 text-xs leading-relaxed text-slate2">
                {{ 'landing.survey.rewrite.method.blocks.' + b.k + '.d' | transloco }}
              </p>
            </div>
          }
        </div>

        <!-- pull quote -->
        <figure class="mt-5 rounded-xl border-l-4 border-coral-500 bg-coral-50/60 py-3 pl-4 pr-3">
          <blockquote class="font-display text-base font-medium italic leading-snug text-ink">
            &ldquo;{{ 'landing.survey.rewrite.method.pullQuote' | transloco }}&rdquo;
          </blockquote>
        </figure>

        <!-- measured metrics strip -->
        <p class="mt-5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.rewrite.method.metricsLabel' | transloco }}
        </p>
        <p class="mt-1.5 font-mono text-[11px] leading-relaxed text-ink">
          {{ 'landing.survey.rewrite.method.metrics' | transloco }}
        </p>

        <!-- research grounding -->
        <p class="mt-3 text-[11px] italic leading-relaxed text-slate2">
          {{ 'landing.survey.rewrite.method.research' | transloco }}
        </p>
      </div>
    </app-survey-card>
  `,
})
export class GreenfieldRewriteShowcaseComponent {
  readonly pipeline = [
    { k: 'spec', icon: 'description' },
    { k: 'gen', icon: 'memory' },
    { k: 'post', icon: 'tune' },
    { k: 'wrap', icon: 'layers' },
  ];

  readonly proofs = [
    { k: 'visual', icon: 'visibility' },
    { k: 'trace', icon: 'fact_check' },
  ];

  readonly facts = ['cookies', 'refresh', 'specs'];

  /** "How the rewrite was actually done" — four method blocks. Icons are all
   * already in the Material Icons subset manifest (account_tree, analytics,
   * commit, trending_up) so this adds no font-regen churn to the slice. */
  readonly methodBlocks = [
    { k: 'types', icon: 'account_tree' },
    { k: 'pyramid', icon: 'analytics' },
    { k: 'slice', icon: 'commit' },
    { k: 'faster', icon: 'trending_up' },
  ];

  readonly snippet = `// e2e-tests/visual-parity/parity.spec.ts — 14 routes x 4 devices
const screenshotOpts = {
  fullPage: true,
  animations: 'disabled',
  maxDiffPixelRatio: route.maxDiffPixelRatio ?? 0.2,
} as const;
// Threshold deliberately looser (20%) — Material vs the legacy UI render text and
// spacing slightly differently; it fires on *real* divergence only.

// tools/suppress-api-types.mjs — real generator bugs, auto-patched:
//   Observable<any> -> Observable<void>   (204-No-Content endpoints)
//   blob-fallback cast a 27 KB JSON payload to {}   (paged endpoint)`;
}
