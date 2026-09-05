import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Contract-pipeline showcase — the discipline story the rewrite and velocity
 * cards only touch in passing: schema-first, single-source-of-truth type
 * propagation. The strongly-typed Spring backend generates the OpenAPI
 * contract; the TS client is generated from it (never hand-written); and the
 * SAME generated types are imported by product services, BDD steps and the
 * L0 compile-time contract pins — so a stale shape cannot compile, cannot
 * pass a test, cannot ship. In the literature this sits between OpenAPI
 * contract-first, PactFlow's provider-contract polarity and SDD's
 * "spec-as-source"; the honest framing (research fork, 2026-09-02) is
 * "contract-driven development with drift moved from test-time to compile
 * time" — stronger than classic CDC at killing mock rot, while the live-BE
 * trace-equivalence tier + BE Testcontainers cover the runtime-conformance
 * class CDC also targets. Deliberately NOT oversold as a CDC superset.
 *
 * Every repo count re-measured 2026-09-30: 181 generated models + 41 services
 * (src/app/api), 31 typed wrapper modules (src/app/core), 27 ported Cucumber
 * features (e2e-tests/bdd), 18 L0 pins (src/testing/contract, Expect<Equal>),
 * 222 integration tests. These drifted badly once — the page claimed 216/74
 * against a repo holding 181/41 — so treat them as perishable and re-count
 * before quoting them anywhere else. Research numbers carry their sources in the caption:
 * Gao/Bird/Barr ICSE 2017 (15%), Postman 2024 (74%), arXiv 2112.10328
 * (1.4–4.5×), DORA 2021 (3.7×).
 *
 * Editorial system: shared <app-survey-card>, coral stats with tabular-nums,
 * mono uppercase eyebrows, dark <app-code-panel>. Icons all in the shipped
 * subset (G13).
 */
@Component({
  selector: 'app-contract-pipeline-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="CONTRACT"
      [title]="'landing.survey.contract.title' | transloco"
      [subtitle]="'landing.survey.contract.subtitle' | transloco"
    >
      <!-- research stat row -->
      <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        @for (s of stats; track s.key) {
          <div class="rounded-xl border border-beige bg-cream p-4 text-center">
            <div class="text-2xl font-bold text-coral-600 tabular-nums">{{ s.value }}</div>
            <div class="mt-1 text-[11px] font-medium leading-snug text-slate2">
              {{ 'landing.survey.contract.stats.' + s.key | transloco }}
            </div>
          </div>
        }
      </div>

      <!-- the source chain: BE annotation → spec → generated client -->
      <p class="mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.contract.chain.label' | transloco }}
      </p>
      <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        @for (c of chain; track c.key; let i = $index) {
          <div class="relative rounded-xl border border-beige bg-cream p-4">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ c.icon }}</mat-icon>
            </div>
            <div class="mt-2.5 text-xs font-semibold leading-tight text-ink">
              {{ 'landing.survey.contract.chain.' + c.key + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.contract.chain.' + c.key + '.d' | transloco }}
            </div>
            @if (!$last) {
              <mat-icon
                class="absolute -right-3 top-8 hidden !h-5 !w-5 !text-xl text-coral-300 sm:block"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- the branch: one import, three consumers -->
      <div class="mt-4 flex flex-col items-center" aria-hidden="true">
        <mat-icon class="!h-4 !w-4 !text-base text-coral-300">expand_more</mat-icon>
        <span
          class="rounded-full border border-coral-100 bg-coral-50 px-3 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-coral-600"
        >
          {{ 'landing.survey.contract.branch' | transloco }}
        </span>
      </div>
      <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        @for (u of consumers; track u.key) {
          <div
            class="rounded-xl border border-beige bg-white p-4 shadow-sm transition hover:border-coral-200"
          >
            <div class="flex items-center justify-between gap-2">
              <span
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
              >
                <mat-icon class="!h-4 !w-4 !text-base">{{ u.icon }}</mat-icon>
              </span>
              <span class="font-mono text-sm font-bold tabular-nums text-coral-600">
                {{ u.count }}
              </span>
            </div>
            <div class="mt-2 text-sm font-semibold text-ink">
              {{ 'landing.survey.contract.consumers.' + u.key + '.t' | transloco }}
            </div>
            <p class="mt-1 text-[11px] leading-snug text-slate2">
              {{ 'landing.survey.contract.consumers.' + u.key + '.d' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- one symbol, three consumers — the real journey -->
      <div class="mt-5">
        <app-code-panel file="SubscriptionStatusDtoOut · api/model">{{ snippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-slate2">
        {{ 'landing.survey.contract.snippetCaption' | transloco }}
      </p>

      <!-- the honest verdict: CDC compared, not oversold -->
      <div class="mt-6 rounded-2xl border border-coral-100 bg-coral-50 p-5">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">swap_horiz</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.contract.verdict.title' | transloco }}
          </span>
        </div>
        <div class="mt-3 space-y-2">
          @for (p of points; track p) {
            <div class="flex items-start gap-2 text-xs text-slate2">
              <mat-icon class="mt-0.5 !h-4 !w-4 shrink-0 !text-base text-coral-600">check</mat-icon>
              <span class="leading-relaxed">
                {{ 'landing.survey.contract.verdict.' + p | transloco }}
              </span>
            </div>
          }
        </div>
      </div>

      <p class="mt-4 text-[11px] leading-relaxed text-slate2">
        {{ 'landing.survey.contract.sources' | transloco }}
      </p>
    </app-survey-card>
  `,
})
export class ContractPipelineShowcaseComponent {
  // Research evidence — each number carries its source in the caption below.
  readonly stats = [
    { key: 'apifirst', value: '74%' },
    { key: 'types', value: '15%' },
    { key: 'schema', value: '1.4–4.5×' },
    { key: 'dora', value: '3.7×' },
  ];

  // The producer chain: annotation → spec → generated client.
  readonly chain = [
    { key: 'be', icon: 'storage' },
    { key: 'spec', icon: 'description' },
    { key: 'client', icon: 'terminal' },
  ];

  // The three consumers of the SAME generated import (live repo counts).
  readonly consumers = [
    { key: 'services', icon: 'layers', count: '31' },
    { key: 'bdd', icon: 'fact_check', count: '27' },
    { key: 'pins', icon: 'verified', count: '18' },
  ];

  readonly points = ['noRot', 'staleFail', 'runtime'];

  readonly snippet = `// ONE generated symbol — imported everywhere, re-declared nowhere
import { SubscriptionStatusDtoOut } from 'api/model';    // ← generated from @Schema

// consumer 1 · product service (src/app/core/subscription)
readonly status = signal<SubscriptionStatusDtoOut | null>(null);

// consumer 2 · BDD step (e2e-tests/bdd) — Gherkin compiles against the contract
Then('my plan is {string}', async (plan: SubscriptionStatusDtoOut['plan']) => { … });

// consumer 3 · L0 contract pin (src/testing/contract) — a test that runs at compile time
type _pin = Expect<Equal<SubscriptionStatusDtoOut['status'], SubscriptionStatus>>;

// BE renames a field → openapi.json moves → npm run openapi:gen
// → all three consumers FAIL TO COMPILE. Drift never reaches runtime.`;
}
