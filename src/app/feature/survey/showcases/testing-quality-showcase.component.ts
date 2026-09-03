import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Testing + quality gates showcase. Verified against domains/quality.md +
 * be2/pom.xml + application-e2e.yml recon, refreshed 2026-09-02 with live
 * FE-rewrite counts:
 *   • BE pyramid: ~11,129 @Test across one reused JVM (one reused JVM, embedded
 *     Redis, UTC-pinned) · 886 integration methods in 71 suites on REAL
 *     PostgreSQL 15 + Redis 7 via Testcontainers (H2 deliberately removed) ·
 *     175 Cucumber scenarios / 34 features / 15 isolated Failsafe runners with
 *     real Firebase + GreenMail SMTP.
 *   • FE pyramid (live snapshot): 949 jest specs · 261 committed baselines
 *     (131 fixtures across 2 chromium engines, minus documented per-engine
 *     skips) · 42 live-BE trace-equivalence specs · 26
 *     BDD features — standing on a plinth of 18 L0 Expect<Equal<…>> contract
 *     pins that run at compile time (the tie-in to the #contract card).
 *   • Build wall: JaCoCo, SpotBugs+FindSecBugs (effort=Max, failOnError),
 *     PMD, OWASP dependency-check (CVSS ≥ 7 fails), Spotless, Enforcer.
 *   • FE rewrite gate: the REAL fourteen-step check:full chain, verbatim from
 *     package.json (10 audit scripts + 2 typechecks + ng build strictTemplates
 *     + jest --bail).
 *   • AI-native test infra (owner framing): dedicated @Profile("e2e") state
 *     controllers (mock-session / set-state / simulate-webhook / publish
 *     terms / stub GUS-KRS) let an AI agent read a feature, design, compile,
 *     run every level and read the app's error logs in one monorepo; Cucumber
 *     scenarios are the business logic in human language.
 * Honesty: 11,129 counts @Test annotations (parameterized cases expand
 * further); FE counts are a live snapshot and grow with every commit; the
 * rewrite's gates run locally by design. Pyramid bar widths are sqrt-ish
 * hand-tuned so small tiers stay visible next to the base.
 */
@Component({
  selector: 'app-testing-quality-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="QUALITY"
      [title]="'landing.survey.testing.title' | transloco"
      [subtitle]="'landing.survey.testing.subtitle' | transloco"
    >
      <!-- the two pyramids, side by side -->
      <div class="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
        <!-- backend -->
        <div>
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
            {{ 'landing.survey.testing.pyramidLabel' | transloco }}
          </p>
          <div class="mt-3 space-y-2.5">
            @for (t of beTiers; track t.k) {
              <div>
                <div
                  class="mx-auto flex h-8 items-center justify-center rounded-lg bg-coral-700 shadow-sm"
                  [style.width.%]="t.pct"
                >
                  <span class="text-xs font-bold tabular-nums text-white">
                    {{ 'landing.survey.testing.tiers.' + t.k + '.count' | transloco }}
                  </span>
                </div>
                <div class="mt-1 text-center text-xs font-semibold text-ink">
                  {{ 'landing.survey.testing.tiers.' + t.k + '.name' | transloco }}
                </div>
                <p class="mx-auto max-w-xs text-center text-[11px] leading-snug text-slate2">
                  {{ 'landing.survey.testing.tiers.' + t.k + '.detail' | transloco }}
                </p>
              </div>
            }
          </div>
        </div>

        <!-- frontend rewrite — the pyramid stands on the contract -->
        <div>
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
            {{ 'landing.survey.testing.pyramidLabelFe' | transloco }}
          </p>
          <div class="mt-3 space-y-2.5">
            @for (t of feTiers; track t.k) {
              <div>
                <div
                  class="mx-auto flex h-8 items-center justify-center rounded-lg bg-coral-700 shadow-sm"
                  [style.width.%]="t.pct"
                >
                  <span class="text-xs font-bold tabular-nums text-white">
                    {{ 'landing.survey.testing.feTiers.' + t.k + '.count' | transloco }}
                  </span>
                </div>
                <div class="mt-1 text-center text-xs font-semibold text-ink">
                  {{ 'landing.survey.testing.feTiers.' + t.k + '.name' | transloco }}
                </div>
                <p class="mx-auto max-w-xs text-center text-[11px] leading-snug text-slate2">
                  {{ 'landing.survey.testing.feTiers.' + t.k + '.detail' | transloco }}
                </p>
              </div>
            }
            <!-- the plinth: L0 compile-time contract pins -->
            <div class="rounded-lg bg-navy-900 px-4 py-2.5 shadow-sm">
              <div class="flex items-center justify-center gap-2">
                <mat-icon class="!h-4 !w-4 !text-base text-coral-400">verified</mat-icon>
                <span class="text-xs font-bold tabular-nums text-cream">18</span>
                <span class="text-xs font-semibold text-cream">
                  {{ 'landing.survey.testing.plinth.name' | transloco }}
                </span>
              </div>
              <p class="mt-0.5 text-center text-[11px] leading-snug text-cream/70">
                {{ 'landing.survey.testing.plinth.detail' | transloco }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- the build wall -->
      <p class="mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.testing.gatesLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (g of gates; track g) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-cream px-3 py-1 text-xs font-medium text-ink"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-coral-600">shield</mat-icon>
            {{ g }}
          </span>
        }
      </div>

      <!-- the FE rewrite gate chain — verbatim from package.json check:full -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.testing.feGateLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-y-1.5">
        @for (s of feGates; track s) {
          <span
            class="rounded-md border border-beige bg-cream px-2 py-0.5 font-mono text-[10px] text-slate2"
          >
            {{ s }}
          </span>
          @if (!$last) {
            <mat-icon class="mx-0.5 !h-3.5 !w-3.5 !text-sm text-beige">chevron_right</mat-icon>
          }
        }
      </div>

      <!-- built for AI teammates -->
      <div class="mt-6 rounded-xl border border-coral-100 bg-coral-50 p-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">memory</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.testing.aiTitle' | transloco }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.testing.aiDesc' | transloco }}
        </p>
        <div class="mt-3 space-y-2">
          @for (a of aiPoints; track a) {
            <div class="flex items-start gap-2 text-xs text-slate2">
              <mat-icon class="mt-0.5 !h-4 !w-4 shrink-0 !text-base text-coral-600">check</mat-icon>
              <span class="leading-relaxed">
                {{ 'landing.survey.testing.ai.' + a | transloco }}
              </span>
            </div>
          }
        </div>
      </div>

      <!-- real E2E state machinery -->
      <div class="mt-5">
        <app-code-panel file="TestSubscriptionController.java · application-e2e.yml">
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.testing.snippetCaption' | transloco }}
      </p>
      <p class="mt-1 text-[11px] text-slate2">{{ 'landing.survey.testing.caveat' | transloco }}</p>
    </app-survey-card>
  `,
})
export class TestingQualityShowcaseComponent {
  // Pyramids render narrow→wide (top→base). Widths ~ sqrt scale so the small
  // tiers stay visible next to 11,129 / 886. Counts live in i18n because
  // number grouping is locale-specific ("11,129" reads as a decimal in Polish).
  readonly beTiers = [
    { k: 'e2e', pct: 32 },
    { k: 'it', pct: 55 },
    { k: 'unit', pct: 100 },
  ];

  // FE rewrite tiers (live snapshot — grows with every commit). The 16 L0
  // compile-time pins render as the plinth the pyramid stands on.
  readonly feTiers = [
    { k: 'bdd', pct: 30 },
    { k: 'integration', pct: 42 },
    { k: 'visual', pct: 62 },
    { k: 'unit', pct: 100 },
  ];

  readonly gates = [
    'JaCoCo coverage',
    'SpotBugs + FindSecBugs · effort=Max',
    'PMD',
    'OWASP · CVSS ≥ 7 fails the build',
    'Spotless',
    'Enforcer',
  ];

  // Verbatim from package.json check:full — the real fourteen-step chain.
  readonly feGates = [
    'check:no-legacy-ui',
    'check:api-wrappers',
    'check:i18n-parity',
    'check:visual-fixture-coverage',
    'check:visual-baseline-freshness',
    'check:integration-cucumber-citation',
    'check:bdd-corpus',
    'check:component-pair-sync',
    'check:contract-coverage',
    'check:icon-subset',
    'typecheck',
    'typecheck:e2e',
    'build:check',
    'jest --bail',
  ];

  readonly aiPoints = ['state', 'levels', 'human'];

  readonly snippet = `// E2E state machinery — deterministic scenarios against a REAL stack
@Profile("e2e & !prod & !test")   // bean absent in prod -> endpoints 404
POST /test/subscription/set-state         // jump the 9-state Stripe FSM
POST /test/subscription/simulate-webhook  // replay Stripe events, no Stripe
POST /test/auth/mock-session              // real HMAC cookies + UA fingerprint
POST /test/legal/publish-document-version // version the terms, test the grace
POST /test/registry/configure-krs-company // stub Polish GUS/KRS lookups

# application-e2e.yml: cooldowns 0s · recaptcha off · GreenMail SMTP :3025`;
}
