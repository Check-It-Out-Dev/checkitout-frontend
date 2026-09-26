import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { MarketingToolbarComponent } from '../landing/marketing-toolbar/marketing-toolbar.component';
import { SURVEY_CHAPTERS } from './ui/chapter-registry';
import { HubOverviewMapComponent } from './ui/hub-overview-map.component';

/**
 * Survey hub — "Startup in the box": the README front page of the platform,
 * ported from the legacy demo build into the greenfield editorial system.
 * One calm screen: the opening pitch, the "already handled" wall, the five
 * questions a CTO will ask (each linking to its chapter), the overview map,
 * the faction chapter cards and the "cool stuff" deep-link strip.
 *
 * The faction cards keep their dark gradient + glow + oversized numeral —
 * dark showcase panels are the one place the editorial cream canvas makes
 * room for them (same logic as the code panels).
 */
@Component({
  selector: 'app-survey-hub',
  imports: [
    RouterModule,
    MatIconModule,
    TranslocoPipe,
    MarketingToolbarComponent,
    HubOverviewMapComponent,
  ],
  template: `
    <div class="min-h-screen bg-cream text-ink antialiased">
      <app-marketing-toolbar />

      <!-- hero -->
      <section class="relative overflow-hidden px-6 pb-20 pt-16 lg:px-8">
        <div class="survey-grid pointer-events-none absolute inset-0"></div>
        <div class="relative mx-auto max-w-3xl text-center">
          <div
            class="inline-flex items-center gap-2 rounded-full bg-coral-50 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-coral-600"
          >
            {{ 'landing.survey.badge' | transloco }}
          </div>
          <h1 class="font-display mt-6 text-4xl leading-tight text-ink sm:text-5xl lg:text-6xl">
            {{ 'landing.survey.title' | transloco }}
          </h1>
          <p class="mt-5 text-xl leading-relaxed text-slate2">
            {{ 'landing.survey.subtitle' | transloco }}
          </p>

          <!-- the "already handled" wall — the pitch, scannable -->
          <div class="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            @for (h of 'landing.survey.hub.handled' | transloco; track h) {
              <span
                class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1 text-xs font-medium text-ink"
              >
                <mat-icon class="!h-3.5 !w-3.5 !text-sm text-emerald-500">check</mat-icon>
                {{ h }}
              </span>
            }
          </div>

          <p class="mt-6 text-slate2">{{ 'landing.survey.intro' | transloco }}</p>
          <div
            class="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate2"
          >
            <span class="inline-flex max-w-full items-start gap-2 text-left tabular-nums">
              <span class="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500"></span>
              {{ 'landing.survey.trust.tests' | transloco }}
            </span>
            <span class="inline-flex max-w-full items-start gap-2 text-left tabular-nums">
              <span class="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500"></span>
              {{ 'landing.survey.trust.staging' | transloco }}
            </span>
            <span class="inline-flex max-w-full items-start gap-2 text-left tabular-nums">
              <span class="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500"></span>
              {{ 'landing.survey.trust.provider' | transloco }}
            </span>
          </div>

          <!-- the five questions, as spare jump-links straight to their chapter -->
          <div class="mt-9 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
            @for (c of chapters; track c.key) {
              <a
                [routerLink]="['/technical-survey', c.path]"
                class="group inline-flex items-center gap-2 rounded-full border border-beige bg-white px-3.5 py-1.5 text-sm font-semibold text-ink shadow-sm transition-all hover:border-coral-300 hover:text-coral-600"
              >
                <span class="select-none text-base leading-none" aria-hidden="true">
                  {{ c.emoji }}
                </span>
                {{ 'landing.survey.chapters.' + c.key + '.question' | transloco }}
              </a>
            }
          </div>
        </div>
      </section>

      <!-- top-level overview: the box at a glance -->
      <section class="px-6 pt-4 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <app-hub-overview-map />
        </div>
      </section>

      <!-- the chapters — each its own bold, colored "faction" card -->
      <section class="px-6 py-16 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <div class="mb-12 text-center">
            <h2 class="font-display text-2xl text-ink sm:text-3xl">
              {{ 'landing.survey.hub.questionsLabel' | transloco }}
            </h2>
            <p class="mt-2 text-slate2">{{ 'landing.survey.hub.questionsHint' | transloco }}</p>
          </div>
          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            @for (c of chapters; track c.key) {
              <a
                [routerLink]="['/technical-survey', c.path]"
                class="ch-card group relative flex min-h-[15rem] flex-col overflow-hidden rounded-2xl p-6"
                [class]="hue[c.hue].card"
              >
                <!-- faction glow + oversized faded numeral -->
                <div
                  class="ch-glow absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                  [class]="hue[c.hue].glow"
                ></div>
                <span
                  class="ch-numeral pointer-events-none absolute -bottom-6 -right-2 select-none text-[7rem] font-black leading-none"
                  [class]="hue[c.hue].numeral"
                >
                  {{ c.order }}
                </span>

                <div class="relative flex items-center gap-3">
                  <span
                    class="flex h-14 w-14 select-none items-center justify-center rounded-2xl text-3xl leading-none shadow-lg ring-1"
                    [class]="hue[c.hue].emblem"
                  >
                    {{ c.emoji }}
                  </span>
                  <span
                    class="font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
                    [class]="hue[c.hue].eyebrow"
                  >
                    {{ 'landing.survey.chapterLabel' | transloco: { n: c.order } }}
                    <br />
                    <span class="text-sm normal-case tracking-normal text-white/90">
                      {{ 'landing.survey.chapters.' + c.key + '.name' | transloco }}
                    </span>
                  </span>
                </div>

                <h3 class="relative mt-5 text-xl font-bold leading-snug text-white sm:text-2xl">
                  {{ 'landing.survey.chapters.' + c.key + '.question' | transloco }}
                </h3>

                <div class="relative mt-auto flex items-center justify-between pt-5">
                  <span class="text-xs font-semibold text-white/70 tabular-nums">
                    {{
                      'landing.survey.hub.meta' | transloco: { cards: c.cards, minutes: c.minutes }
                    }}
                  </span>
                  <span class="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                    {{ 'landing.survey.hub.openChapter' | transloco }}
                    <mat-icon
                      class="!h-4 !w-4 !text-base transition-transform duration-300 group-hover:translate-x-1"
                    >
                      arrow_forward
                    </mat-icon>
                  </span>
                </div>
              </a>
            }
          </div>
        </div>
      </section>

      <!-- cool stuff — shortcuts straight into the best moments -->
      <section class="px-6 pb-16 lg:px-8">
        <div class="mx-auto max-w-4xl text-center">
          <h2 class="font-display text-xl text-ink">
            {{ 'landing.survey.hub.cool.label' | transloco }}
          </h2>
          <p class="mt-1 text-sm text-slate2">{{ 'landing.survey.hub.cool.hint' | transloco }}</p>
          <div class="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            @for (c of coolStuff; track c.k) {
              <a
                [routerLink]="['/technical-survey', c.chapter]"
                [fragment]="c.frag"
                class="group inline-flex items-center gap-2 rounded-full border border-beige bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm transition-all duration-300 hover:border-coral-300 hover:text-coral-600"
              >
                <mat-icon class="!h-4 !w-4 !text-base text-coral-500">{{ c.icon }}</mat-icon>
                {{ 'landing.survey.hub.cool.items.' + c.k | transloco }}
                <mat-icon
                  class="!h-3.5 !w-3.5 !text-sm text-beige transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-coral-500"
                >
                  arrow_forward
                </mat-icon>
              </a>
            }
          </div>
        </div>
      </section>

      <!-- cross-journey CTAs: the survey's sibling is the interactive demo —
           the two journeys tease each other (the demo hub links back here). -->
      <section class="px-6 pb-16 text-center">
        <div class="inline-flex flex-wrap items-center justify-center gap-3">
          <a routerLink="/demo" class="cta-primary" data-testid="survey-cta-demo">
            {{ 'landing.survey.cta_demo' | transloco }}
          </a>
          <a
            routerLink="/"
            class="inline-flex items-center gap-2 rounded-full border border-beige bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition-all hover:border-coral-300 hover:text-coral-600"
            data-testid="survey-cta-home"
          >
            {{ 'landing.survey.cta_home' | transloco }}
          </a>
        </div>
      </section>

      <footer class="border-t border-beige px-6 py-10 text-center text-xs text-slate2">
        {{ 'landing.survey.footer' | transloco }}
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      /* Blueprint grid substrate — a restrained "engineers who care" texture.
         Low ink (~5%), masked to a soft ellipse so it never reads as wallpaper. */
      .survey-grid {
        background-image:
          linear-gradient(to right, rgba(14, 17, 22, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(14, 17, 22, 0.05) 1px, transparent 1px);
        background-size: 32px 32px;
        -webkit-mask-image: radial-gradient(ellipse 65% 55% at 50% 42%, #000 35%, transparent 100%);
        mask-image: radial-gradient(ellipse 65% 55% at 50% 42%, #000 35%, transparent 100%);
      }
      /* Faction cards lift and brighten on hover — bold, tactile, never gimmicky. */
      .ch-card {
        transition:
          transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
          box-shadow 0.3s;
      }
      .ch-card:hover {
        transform: translateY(-4px);
      }
      @media (prefers-reduced-motion: reduce) {
        .ch-card,
        .ch-card:hover {
          transform: none;
          transition: none;
        }
      }
    `,
  ],
})
export class SurveyHubComponent {
  readonly chapters = SURVEY_CHAPTERS;

  // Per-chapter "faction" palette — each card is a bold dark panel with its own
  // colored glow, emblem and oversized numeral. Tailwind-safe literal classes.
  readonly hue: Record<
    string,
    { card: string; glow: string; numeral: string; emblem: string; eyebrow: string }
  > = {
    indigo: {
      card: 'bg-gradient-to-br from-indigo-950 to-slate-900 ring-1 ring-indigo-500/30 hover:ring-indigo-400/60 shadow-lg shadow-indigo-950/30',
      glow: 'bg-indigo-500',
      numeral: 'text-indigo-500/15',
      emblem: 'bg-indigo-500/15 ring-indigo-400/40',
      eyebrow: 'text-indigo-300',
    },
    rose: {
      card: 'bg-gradient-to-br from-rose-950 to-slate-900 ring-1 ring-rose-500/30 hover:ring-rose-400/60 shadow-lg shadow-rose-950/30',
      glow: 'bg-rose-500',
      numeral: 'text-rose-500/15',
      emblem: 'bg-rose-500/15 ring-rose-400/40',
      eyebrow: 'text-rose-300',
    },
    amber: {
      card: 'bg-gradient-to-br from-amber-900 to-slate-900 ring-1 ring-amber-500/30 hover:ring-amber-400/60 shadow-lg shadow-amber-950/30',
      glow: 'bg-amber-500',
      numeral: 'text-amber-500/15',
      emblem: 'bg-amber-500/15 ring-amber-400/40',
      eyebrow: 'text-amber-300',
    },
    sky: {
      card: 'bg-gradient-to-br from-sky-950 to-slate-900 ring-1 ring-sky-500/30 hover:ring-sky-400/60 shadow-lg shadow-sky-950/30',
      glow: 'bg-sky-500',
      numeral: 'text-sky-500/15',
      emblem: 'bg-sky-500/15 ring-sky-400/40',
      eyebrow: 'text-sky-300',
    },
    violet: {
      card: 'bg-gradient-to-br from-violet-950 to-slate-900 ring-1 ring-violet-500/30 hover:ring-violet-400/60 shadow-lg shadow-violet-950/30',
      glow: 'bg-violet-500',
      numeral: 'text-violet-500/15',
      emblem: 'bg-violet-500/15 ring-violet-400/40',
      eyebrow: 'text-violet-300',
    },
  };

  // "Cool stuff" — deep links straight to the strongest cards. `frag` must match
  // a card wrapper id in the target chapter (the shell scrolls to it on load).
  readonly coolStuff: Array<{ k: string; icon: string; chapter: string; frag: string }> = [
    { k: 'geoip', icon: 'place', chapter: 'security', frag: 'geoip' },
    { k: 'tamper', icon: 'lock', chapter: 'operations', frag: 'immutability' },
    { k: 'saga', icon: 'credit_card', chapter: 'platform', frag: 'billing-saga' },
    { k: 'zerotrust', icon: 'layers', chapter: 'security', frag: 'zero-trust' },
    { k: 'graph', icon: 'account_tree', chapter: 'engineering', frag: 'graph-dev' },
    { k: 'contract', icon: 'verified', chapter: 'engineering', frag: 'contract' },
    { k: 'topology', icon: 'share', chapter: 'engineering', frag: 'graph-topology' },
    { k: 'velocity', icon: 'trending_up', chapter: 'engineering', frag: 'velocity' },
    { k: 'pq', icon: 'cloud', chapter: 'security', frag: 'zero-trust' },
  ];
}
