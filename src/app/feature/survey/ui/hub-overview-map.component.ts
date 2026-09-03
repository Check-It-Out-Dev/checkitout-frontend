import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from './survey-card.component';

/**
 * Hub overview map — the "top level overview" opening card of the README hub:
 * the request path (visitor → Cloudflare → iptables → nginx → app → data),
 * the operations band around it and the proof band underneath. Every tile is
 * a real running system and links into the chapter that explains it; hovering
 * lights a tile up (cream → white + coral ring) so the whole survey speaks
 * one visual language. Ported from the legacy demo build.
 */
@Component({
  selector: 'app-hub-overview-map',
  imports: [RouterModule, MatIconModule, TranslocoPipe, SurveyCardComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      [title]="'landing.survey.hub.map.title' | transloco"
      [subtitle]="'landing.survey.hub.map.subtitle' | transloco"
    >
      <!-- the request path -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.hub.map.flowLabel' | transloco }}
      </p>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        @for (f of flow; track f.k; let last = $last) {
          @if (f.chapter) {
            <a
              [routerLink]="['/technical-survey', f.chapter]"
              class="group relative rounded-xl border border-beige bg-cream p-4 transition-all duration-300 hover:border-coral-200 hover:bg-white hover:shadow-sm"
            >
              <div
                class="flex h-9 w-9 select-none items-center justify-center rounded-lg bg-coral-50 text-xl leading-none transition-colors duration-300 group-hover:bg-coral-100"
                aria-hidden="true"
              >
                {{ f.emoji }}
              </div>
              <div class="mt-2.5 text-xs font-semibold leading-tight text-ink">
                {{ 'landing.survey.hub.map.nodes.' + f.k + '.t' | transloco }}
              </div>
              <div class="font-mono text-[10px] leading-tight text-slate2">
                {{ 'landing.survey.hub.map.nodes.' + f.k + '.d' | transloco }}
              </div>
              @if (!last) {
                <mat-icon
                  class="absolute -right-3 top-8 z-10 hidden !h-5 !w-5 !text-xl text-beige lg:block"
                >
                  chevron_right
                </mat-icon>
              }
            </a>
          } @else {
            <div class="relative rounded-xl border border-beige bg-cream p-4">
              <div
                class="flex h-9 w-9 select-none items-center justify-center rounded-lg bg-coral-50 text-xl leading-none"
                aria-hidden="true"
              >
                {{ f.emoji }}
              </div>
              <div class="mt-2.5 text-xs font-semibold leading-tight text-ink">
                {{ 'landing.survey.hub.map.nodes.' + f.k + '.t' | transloco }}
              </div>
              <div class="font-mono text-[10px] leading-tight text-slate2">
                {{ 'landing.survey.hub.map.nodes.' + f.k + '.d' | transloco }}
              </div>
              @if (!last) {
                <mat-icon
                  class="absolute -right-3 top-8 z-10 hidden !h-5 !w-5 !text-xl text-beige lg:block"
                >
                  chevron_right
                </mat-icon>
              }
            </div>
          }
        }
      </div>

      <!-- operations + proof bands -->
      <div class="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-7">
        <div class="lg:col-span-4">
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
            {{ 'landing.survey.hub.map.opsLabel' | transloco }}
          </p>
          <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            @for (o of ops; track o.k) {
              <a
                [routerLink]="['/technical-survey', 'operations']"
                class="group rounded-xl border border-beige bg-cream p-3 transition-all duration-300 hover:border-coral-200 hover:bg-white hover:shadow-sm"
              >
                <div
                  class="flex h-8 w-8 select-none items-center justify-center rounded-lg bg-coral-50 text-lg leading-none transition-colors duration-300 group-hover:bg-coral-100"
                  aria-hidden="true"
                >
                  {{ o.emoji }}
                </div>
                <div class="mt-2 text-xs font-semibold leading-tight text-ink">
                  {{ 'landing.survey.hub.map.ops.' + o.k + '.t' | transloco }}
                </div>
                <div class="font-mono text-[10px] leading-tight text-slate2">
                  {{ 'landing.survey.hub.map.ops.' + o.k + '.d' | transloco }}
                </div>
              </a>
            }
          </div>
        </div>
        <div class="lg:col-span-3">
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
            {{ 'landing.survey.hub.map.proofLabel' | transloco }}
          </p>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            @for (p of proof; track p.k) {
              <a
                [routerLink]="['/technical-survey', p.chapter]"
                class="group rounded-xl border border-beige bg-cream p-3 transition-all duration-300 hover:border-coral-200 hover:bg-white hover:shadow-sm"
              >
                <div
                  class="flex h-8 w-8 select-none items-center justify-center rounded-lg bg-coral-50 text-lg leading-none transition-colors duration-300 group-hover:bg-coral-100"
                  aria-hidden="true"
                >
                  {{ p.emoji }}
                </div>
                <div class="mt-2 text-xs font-semibold leading-tight text-ink tabular-nums">
                  {{ 'landing.survey.hub.map.proof.' + p.k + '.t' | transloco }}
                </div>
                <div class="font-mono text-[10px] leading-tight text-slate2">
                  {{ 'landing.survey.hub.map.proof.' + p.k + '.d' | transloco }}
                </div>
              </a>
            }
          </div>
        </div>
      </div>
    </app-survey-card>
  `,
})
export class HubOverviewMapComponent {
  // The request path. `chapter` is the route segment the tile opens (null = no link).
  readonly flow: Array<{ k: string; emoji: string; chapter: string | null }> = [
    { k: 'user', emoji: '🧑‍💻', chapter: null },
    { k: 'edge', emoji: '☁️', chapter: 'security' },
    { k: 'fw', emoji: '🧱', chapter: 'security' },
    { k: 'nginx', emoji: '🚦', chapter: 'security' },
    { k: 'app', emoji: '⚙️', chapter: 'platform' },
    { k: 'data', emoji: '🗄️', chapter: 'platform' },
  ];

  readonly ops = [
    { k: 'cicd', emoji: '🚀' },
    { k: 'ansible', emoji: '🛠️' },
    { k: 'obs', emoji: '📊' },
    { k: 'backup', emoji: '💾' },
  ];

  readonly proof: Array<{ k: string; emoji: string; chapter: string }> = [
    { k: 'rodo', emoji: '⚖️', chapter: 'compliance' },
    { k: 'tests', emoji: '✅', chapter: 'engineering' },
    { k: 'graph', emoji: '🕸️', chapter: 'engineering' },
  ];
}
