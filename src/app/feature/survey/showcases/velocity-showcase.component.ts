import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';

/**
 * Velocity showcase — the "why" chapter-section behind the rewrite mechanics
 * card (#rewrite): why a strongly-typed BE contract + generated FE types under
 * strict TypeScript + an AI teammate with BE/FE log access compounds into
 * development speed. Fragment id `velocity` is a hub deep-link target.
 *
 * Grounding (kept honest, refreshed 2026-09-02):
 *   • Loops: tsc+strictTemplates seconds-fast; the twenty-step check:full
 *     (ten audit scripts + both typechecks + ng build strictTemplates + 886
 *     jest) lands in minutes on a clean tree; runtime = pm2 logs of BE :8080
 *     + FE :4200/:4201 readable by the agent live.
 *   • The end-to-end DTO journey moved to the adjacent #contract card (one
 *     symbol, three consumers) — this card cross-references it instead of
 *     repeating the dark panel two cards apart.
 *   • Research: Gao/Bird/Barr ICSE'17 (TS/Flow detect 15% of shipped public
 *     bugs — authors call it conservative); Airbnb postmortem analysis (38%
 *     of production bugs preventable by TypeScript used STRICTLY — Bunge,
 *     JSConf Hawaii '19); 2025-26 agent studies: 16–23% of contributions
 *     already agent-involved; weak-verifier agent output needs manual fixes
 *     ~72% of the time — the loop, not the model, is the product.
 *   • Fresh-boot dogfood numbers from this session: 831 unit / 242 visual /
 *     24 scenario / 136 parity / 133 BDD / 193 trace-equivalence, campaign
 *     created through the UI on first try.
 * Icons deliberately reuse the shipped subset (no font-regen churn).
 */
@Component({
  selector: 'app-velocity-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="VELOCITY"
      [title]="'landing.survey.velocity.title' | transloco"
      [subtitle]="'landing.survey.velocity.subtitle' | transloco"
    >
      <!-- the three feedback loops, ordered by latency -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.velocity.loopsLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-col gap-2">
        @for (l of loops; track l.k) {
          <div class="rounded-xl border border-beige bg-cream p-4">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
              >
                <mat-icon class="!h-4 !w-4 !text-base">{{ l.icon }}</mat-icon>
              </span>
              <span class="text-sm font-semibold text-ink">
                {{ 'landing.survey.velocity.loops.' + l.k + '.t' | transloco }}
              </span>
              <span
                class="ml-auto rounded-full bg-ink px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-cream"
              >
                {{ 'landing.survey.velocity.loops.' + l.k + '.latency' | transloco }}
              </span>
            </div>
            <!-- latency bar — width grows with loop cost -->
            <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-beige">
              <div class="h-full rounded-full bg-coral-500" [style.width]="l.bar"></div>
            </div>
            <p class="mt-2 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.velocity.loops.' + l.k + '.d' | transloco }}
            </p>
          </div>
        }
      </div>
      <p class="mt-2 text-[11px] italic text-slate2">
        {{ 'landing.survey.velocity.loopsMoral' | transloco }}
      </p>

      <!-- the type journey lives on the adjacent contract card — link, don't repeat -->
      <a
        href="#contract"
        class="mt-5 flex items-center gap-2 rounded-xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm font-medium text-coral-700 transition hover:border-coral-200"
      >
        <mat-icon class="!h-4 !w-4 shrink-0 !text-base">swap_horiz</mat-icon>
        <span>{{ 'landing.survey.velocity.contractRef' | transloco }}</span>
      </a>

      <!-- research numbers (not ours) -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.velocity.researchLabel' | transloco }}
      </p>
      <div class="mt-2 grid gap-3 sm:grid-cols-3">
        @for (s of stats; track s.k) {
          <div class="rounded-xl border border-beige bg-cream p-4 text-center">
            <div class="font-display text-4xl font-normal leading-none text-coral-700">
              {{ s.n }}
            </div>
            <p class="mt-2 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.velocity.stats.' + s.k | transloco }}
            </p>
          </div>
        }
      </div>
      <p class="mt-2 text-[11px] italic leading-relaxed text-slate2">
        {{ 'landing.survey.velocity.researchSources' | transloco }}
      </p>

      <!-- the AI teammate: autonomy = verifier quality -->
      <div class="mt-8 border-t border-beige pt-7">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-coral-600">
          {{ 'landing.survey.velocity.agent.eyebrow' | transloco }}
        </p>
        <h3 class="mt-2 font-display text-xl font-semibold leading-tight text-ink sm:text-2xl">
          {{ 'landing.survey.velocity.agent.headline' | transloco }}
        </h3>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate2">
          {{ 'landing.survey.velocity.agent.intro' | transloco }}
        </p>

        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          @for (b of agentBlocks; track b.k) {
            <div class="rounded-xl border border-beige bg-cream p-4">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
                >
                  <mat-icon class="!h-4 !w-4 !text-base">{{ b.icon }}</mat-icon>
                </span>
                <span class="text-sm font-semibold text-ink">
                  {{ 'landing.survey.velocity.agent.blocks.' + b.k + '.t' | transloco }}
                </span>
              </div>
              <p class="mt-2 text-xs leading-relaxed text-slate2">
                {{ 'landing.survey.velocity.agent.blocks.' + b.k + '.d' | transloco }}
              </p>
            </div>
          }
        </div>

        <figure class="mt-5 rounded-xl border-l-4 border-coral-500 bg-coral-50/60 py-3 pl-4 pr-3">
          <blockquote class="font-display text-base font-medium italic leading-snug text-ink">
            &ldquo;{{ 'landing.survey.velocity.agent.pullQuote' | transloco }}&rdquo;
          </blockquote>
        </figure>

        <!-- dogfood: one fresh boot, one morning -->
        <p class="mt-5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.velocity.dogfoodLabel' | transloco }}
        </p>
        <p class="mt-1.5 font-mono text-[11px] leading-relaxed text-ink">
          {{ 'landing.survey.velocity.dogfood' | transloco }}
        </p>

        <p class="mt-3 text-[11px] text-slate2">
          {{ 'landing.survey.velocity.caveat' | transloco }}
        </p>
      </div>
    </app-survey-card>
  `,
})
export class VelocityShowcaseComponent {
  /** Latency-ordered loops; bar widths are illustrative of relative cost. */
  readonly loops = [
    { k: 'compile', icon: 'check_circle', bar: '6%' },
    { k: 'suite', icon: 'analytics', bar: '30%' },
    { k: 'runtime', icon: 'visibility', bar: '100%' },
  ];

  readonly stats = [
    { k: 'icse', n: '15%' },
    { k: 'airbnb', n: '38%' },
    { k: 'agents', n: '16–23%' },
  ];

  readonly agentBlocks = [
    { k: 'refute', icon: 'fact_check' },
    { k: 'logs', icon: 'memory' },
    { k: 'graph', icon: 'account_tree' },
  ];
}
