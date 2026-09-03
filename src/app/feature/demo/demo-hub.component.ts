import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { MarketingToolbarComponent } from '../landing/marketing-toolbar/marketing-toolbar.component';
import { SCENARIOS, ScenarioDef, ScenarioRole } from '../../core/demo/scenario-registry';
import { SandboxDirectorService } from '../../core/demo/sandbox-director.service';
import { isDemoMode } from '../../core/demo/demo-mode';

/**
 * /demo hub — "act like one of our users". The guided-scenario launcher
 * (ported from the legacy demo build into the greenfield editorial system):
 * scenario cards (role, duration, what you'll do, what it proves), each
 * starting a step machine that drives the REAL app components with the
 * DemoGuide instructor. Sibling page to the technical-survey hub — same
 * editorial language: cream canvas, blueprint substrate, white cards with
 * beige borders, coral accent, serif display headings, mono eyebrows.
 * The honesty register stays word-for-word under the cards.
 */
@Component({
  selector: 'app-demo-hub',
  imports: [RouterModule, MatIconModule, TranslocoPipe, MarketingToolbarComponent],
  template: `
    <div class="min-h-screen bg-cream text-ink antialiased">
      <app-marketing-toolbar />

      <!-- hero -->
      <section class="relative overflow-hidden px-6 pb-16 pt-16 lg:px-8">
        <div class="demo-grid pointer-events-none absolute inset-0"></div>
        <div class="relative mx-auto max-w-3xl text-center">
          <div
            class="inline-flex items-center gap-2 rounded-full bg-coral-50 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-coral-600"
          >
            {{ 'demo.hub.badge' | transloco }}
          </div>
          <h1 class="font-display mt-6 text-4xl leading-tight text-ink sm:text-5xl lg:text-6xl">
            {{ 'demo.hub.title' | transloco }}
          </h1>
          <p class="mt-5 text-xl leading-relaxed text-slate2">
            {{ 'demo.hub.subtitle' | transloco }}
          </p>
          <p class="mt-3 text-slate2">{{ 'demo.hub.intro' | transloco }}</p>
        </div>
      </section>

      <!-- scenario cards -->
      <section class="px-6 pb-16 lg:px-8">
        <div class="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (s of scenarios; track s.key) {
            <div
              class="group flex flex-col rounded-2xl border border-beige bg-white p-6 shadow-sm transition-all duration-300 hover:border-coral-200 hover:shadow-md"
            >
              <div class="flex items-center gap-3">
                <span
                  class="flex h-11 w-11 select-none items-center justify-center rounded-xl bg-coral-50 text-2xl leading-none transition-colors duration-300 group-hover:bg-coral-100"
                  aria-hidden="true"
                >
                  {{ s.emoji }}
                </span>
                <div class="min-w-0">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
                    [class]="roleCls[s.role]"
                  >
                    {{ 'demo.hub.roles.' + s.role | transloco }}
                  </span>
                  <div class="mt-0.5 text-[11px] tabular-nums text-slate2">
                    {{ 'demo.hub.minutes' | transloco: { m: s.minutes } }}
                  </div>
                </div>
              </div>

              <h2 class="font-display mt-4 text-xl text-ink">
                {{ 'demo.sandboxes.' + s.key + '.title' | transloco }}
              </h2>
              <p class="mt-1.5 flex-grow text-sm leading-relaxed text-slate2">
                {{ 'demo.sandboxes.' + s.key + '.tagline' | transloco }}
              </p>

              <div class="mt-3 flex items-start gap-2 text-xs text-slate2">
                <mat-icon class="mt-0.5 !h-4 !w-4 shrink-0 !text-base text-emerald-500">
                  check_circle
                </mat-icon>
                <span class="leading-relaxed">
                  {{ 'demo.sandboxes.' + s.key + '.proves' | transloco }}
                </span>
              </div>

              <div class="mt-5">
                @if (s.steps.length) {
                  <button
                    type="button"
                    (click)="start(s)"
                    class="inline-flex items-center gap-2 rounded-full bg-coral-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-coral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                  >
                    <mat-icon class="!h-4 !w-4 !text-base">play_arrow</mat-icon>
                    {{ 'demo.hub.start' | transloco }}
                  </button>
                } @else {
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-cream px-3 py-1.5 text-xs font-medium text-slate2"
                  >
                    <mat-icon class="!h-3.5 !w-3.5 !text-sm">schedule</mat-icon>
                    {{ 'demo.hub.soon' | transloco }}
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- the honest line + survey cross-link -->
        <div class="mx-auto mt-12 max-w-3xl text-center">
          <p class="text-[11px] leading-relaxed text-slate2">
            {{ 'demo.hub.honesty' | transloco }}
          </p>
          <div class="mt-6 inline-flex">
            <a
              routerLink="/technical-survey"
              class="group inline-flex items-center gap-2 rounded-full border border-beige bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition-all hover:border-coral-300 hover:text-coral-600"
            >
              {{ 'demo.hub.surveyCta' | transloco }}
              <mat-icon
                class="!h-4 !w-4 !text-base transition-transform duration-300 group-hover:translate-x-1"
              >
                arrow_forward
              </mat-icon>
            </a>
          </div>
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
      /* Blueprint grid substrate — same restrained texture as the survey hub.
         Low ink (~5%), masked to a soft ellipse so it never reads as wallpaper. */
      .demo-grid {
        background-image:
          linear-gradient(to right, rgba(14, 17, 22, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(14, 17, 22, 0.05) 1px, transparent 1px);
        background-size: 32px 32px;
        -webkit-mask-image: radial-gradient(ellipse 65% 60% at 50% 38%, #000 35%, transparent 100%);
        mask-image: radial-gradient(ellipse 65% 60% at 50% 38%, #000 35%, transparent 100%);
      }
    `,
  ],
})
export class DemoHubComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly director = inject(SandboxDirectorService);

  readonly scenarios = SCENARIOS;

  // Role badges as editorial mono chips — coral for the company persona (the
  // brand's own), navy for influencers, amber for admin/back-office.
  readonly roleCls: Record<ScenarioRole, string> = {
    COMPANY: 'bg-coral-50 text-coral-700',
    INFLUENCER: 'bg-navy-50 text-navy-500',
    ADMIN: 'bg-amber-100 text-amber-800',
  };

  ngOnInit(): void {
    // Deep link from the home page minis: /demo?start=<key> launches the
    // scenario straight away (only if it exists and has steps to play).
    if (!isDemoMode()) {
      return;
    }
    const start = this.route.snapshot.queryParamMap.get('start');
    const def = SCENARIOS.find((s) => s.key === start);
    if (def && def.steps.length > 0) {
      this.director.start(def.key);
    }
  }

  start(s: ScenarioDef): void {
    if (!isDemoMode() || !s.steps.length) {
      return;
    }
    this.director.start(s.key);
  }
}
