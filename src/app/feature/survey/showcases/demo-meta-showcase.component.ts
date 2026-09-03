import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Demo-meta showcase — the demo explaining itself (ported from the legacy
 * demo build, feature/demo — content unchanged). Verified against
 * core/interceptors/demo.interceptor.ts + core/demo/demo-fixtures.ts:
 *   • demoInterceptor registered FIRST in the 5-stage chain (demo → auth →
 *     language → rate-limit-cache → error); short-circuits every /api call to
 *     of(new HttpResponse({status: 200, body: fixture})) — zero network.
 *   • Fixtures + a writable in-memory store (create/edit persists for the
 *     session); APP_INITIALIZER primes a COMPANY user so guards pass without
 *     login; role switcher (Company/Influencer/Admin) + reset in the demo bar.
 *   • The forensic flex: before showing the demo we diagnosed five of its own
 *     defects to file:line (scroll-clipping bar, untranslated months, dropped
 *     writes, 2FA dead-end, off-palette gradient) — then fixed each one in
 *     earlier slices. The habit is the exhibit.
 * Honesty: all mock by design (Stripe/OAuth/KSeF impression-only); the legacy
 * FE rests on a commercial UI license — the rewrite card above removes it.
 */
@Component({
  selector: 'app-demo-meta-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="META"
      [title]="'landing.survey.demometa.title' | transloco"
      [subtitle]="'landing.survey.demometa.subtitle' | transloco"
    >
      <!-- how the backend-less build answers you -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.demometa.howLabel' | transloco }}
      </p>
      <div class="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        @for (s of how; track s.k) {
          <div class="relative rounded-xl border border-beige bg-cream p-4">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ s.icon }}</mat-icon>
            </div>
            <div class="mt-2.5 text-xs font-semibold leading-tight text-ink">
              {{ 'landing.survey.demometa.how.' + s.k + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.demometa.how.' + s.k + '.d' | transloco }}
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

      <!-- fact chips -->
      <div class="mt-4 flex flex-wrap gap-2">
        @for (f of facts; track f) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-cream px-3 py-1 text-xs font-medium text-ink"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-coral-600">check_circle</mat-icon>
            {{ 'landing.survey.demometa.facts.' + f | transloco }}
          </span>
        }
      </div>

      <!-- debugged like production -->
      <div class="mt-5 rounded-xl border border-coral-100 bg-coral-50 p-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">search</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.demometa.flexTitle' | transloco }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.demometa.flexDesc' | transloco }}
        </p>
      </div>

      <!-- the one honest interceptor -->
      <div class="mt-5">
        <app-code-panel file="demo.interceptor.ts · demo-fixtures.ts">{{ snippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.demometa.snippetCaption' | transloco }}
      </p>
      <p class="mt-1 text-[11px] text-slate2">{{ 'landing.survey.demometa.caveat' | transloco }}</p>
    </app-survey-card>
  `,
})
export class DemoMetaShowcaseComponent {
  readonly how = [
    { k: 'req', icon: 'send' },
    { k: 'intercept', icon: 'commit' },
    { k: 'store', icon: 'storage' },
    { k: 'resp', icon: 'check_circle' },
  ];

  readonly facts = ['roles', 'reset', 'persist', 'offline'];

  readonly snippet = `// demo.interceptor.ts — registered FIRST in the 5-stage chain
const body = matchDemoFixture(req.method, path);     // fixtures + RULES[]
return of(new HttpResponse({ status: 200, body: body ?? {} }));

// demo-fixtures.ts — a writable in-memory store backs create/edit:
//   POST /partnership-opportunity        -> stores YOUR campaign, returns it
//   GET  /partnership-opportunity/paged  -> includes what you just created
// localStorage keeps role + tickets; "Reset demo" wipes it pristine.`;
}
