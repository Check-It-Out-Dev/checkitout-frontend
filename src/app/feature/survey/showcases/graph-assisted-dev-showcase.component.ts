import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';
import { GRAPH_REPO_URL } from '../ui/survey-links';

/**
 * Graph-assisted-development showcase (ported from the legacy demo build,
 * feature/demo — content unchanged). All figures are a real snapshot of the
 * live Neo4j `LegacyBugfix2026` namespace (23 Bug nodes + the modeled FSM/
 * State/AuthStep/TokenBumpSite/Campaign/Invariant entities that surfaced
 * them). Bug titles/causes are verbatim-faithful to the graph. Honesty: 14 of
 * 23 have a recorded fix commit, 9 FE flows are live-Chrome-verified — stated
 * as such, not rounded up. Raw fix SHAs were dropped from the cards (owner
 * ask, 2026-09-02): a hex hash is noise to the reader — the provenance claim
 * ("fixed, locked by a test") is the signal; the graph keeps the SHAs.
 *
 * Editorial translation: shared <app-survey-card>; solid coral stat numbers
 * (no gradient clip-text) with tabular-nums; semantic rose/amber severity
 * badges; the legacy app-button became a plain editorial pill button (the
 * greenfield has no shared button component — preflight is off, so the
 * button carries its own resets).
 */
@Component({
  selector: 'app-graph-assisted-dev-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="PROCESS"
      [title]="'landing.survey.graphdev.title' | transloco"
      [subtitle]="'landing.survey.graphdev.subtitle' | transloco"
    >
      <!-- stat row -->
      <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        @for (s of stats; track s.key) {
          <div class="rounded-xl border border-beige bg-cream p-4 text-center">
            <div class="text-2xl font-bold text-coral-600 tabular-nums">{{ s.value }}</div>
            <div class="mt-1 text-[11px] font-medium text-slate2">
              {{ 'landing.survey.graphdev.stats.' + s.key | transloco }}
            </div>
          </div>
        }
      </div>

      <!-- modeled-in-graph -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.graphdev.modeled' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (m of model; track m) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-coral-100 bg-coral-50 px-3 py-1 text-xs font-medium text-coral-600"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-coral-500"></span>
            {{ m }}
          </span>
        }
      </div>

      <!-- replay a real fix (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.graphdev.replayLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (replayDone) {
            <span
              class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.graphdev.run.done' | transloco }}
            </span>
          }
          <button type="button" [class]="replayDone ? replayBtn : runBtn" (click)="advanceReplay()">
            <mat-icon class="!h-4 !w-4 !text-base">
              {{ replayDone ? 'refresh' : 'play_arrow' }}
            </mat-icon>
            {{
              (replayDone
                ? 'landing.survey.graphdev.run.replay'
                : 'landing.survey.graphdev.run.cta'
              ) | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        @for (r of replay; track r.k; let i = $index) {
          <div
            class="relative rounded-xl border p-4 transition-all duration-300"
            [class]="replayRowCls(i)"
          >
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300"
              [class]="replayIconCls(i)"
              [class.graph-current]="replayCurrent(i)"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ r.icon }}</mat-icon>
            </div>
            <div
              class="mt-2.5 text-xs font-semibold leading-tight"
              [class]="replayLit(i) ? 'text-ink' : 'text-slate2'"
            >
              {{ 'landing.survey.graphdev.replay.' + r.k + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.graphdev.replay.' + r.k + '.d' | transloco }}
            </div>
            @if (!$last) {
              <mat-icon
                class="absolute -right-3 top-8 hidden !h-5 !w-5 !text-xl transition-colors sm:block"
                [class]="replayLit(i + 1) ? 'text-coral-500' : 'text-beige'"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>
      <div class="mt-3">
        <app-code-panel file="LegacyBugfix2026 · Neo4j">{{ querySnippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.graphdev.queryCaption' | transloco }}
      </p>

      <!-- the method is public -->
      <div class="mt-5 rounded-xl border border-coral-100 bg-coral-50 p-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">menu_book</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.graphdev.repoTitle' | transloco }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.graphdev.repoDesc' | transloco }}
        </p>
        <a
          [href]="repoUrl"
          target="_blank"
          rel="noopener"
          class="mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-coral-600 underline-offset-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
        >
          {{ 'landing.survey.graphdev.repoCta' | transloco }}
          <mat-icon class="!h-4 !w-4 !text-base">open_in_new</mat-icon>
        </a>
      </div>

      <!-- representative bugs (verbatim from the graph) -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.graphdev.examples' | transloco }}
      </p>
      <div class="mt-2 grid gap-3 md:grid-cols-2">
        @for (b of bugs; track b.id) {
          <div
            class="rounded-xl border border-beige bg-cream p-4 transition hover:border-coral-200"
          >
            <div class="mb-1.5 flex items-center gap-2">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                [class]="sevCls[b.sev]"
              >
                {{ b.sev }}
              </span>
              <span class="font-mono text-[11px] text-slate2">{{ b.id }} · {{ b.repo }}</span>
              <span
                class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"
              >
                <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
                {{ 'landing.survey.graphdev.fixedChip' | transloco }}
              </span>
            </div>
            <div class="text-sm font-semibold text-ink">{{ b.title }}</div>
            <div class="mt-1 text-xs leading-relaxed text-slate2">{{ b.rc }}</div>
          </div>
        }
      </div>

      <p class="mt-4 text-[11px] text-slate2">
        {{ 'landing.survey.graphdev.snapshot' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      /* Coral halo on the currently-advancing replay step (coral-500 @ 18%). */
      .graph-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.18);
      }
    `,
  ],
})
export class GraphAssistedDevShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly repoUrl = GRAPH_REPO_URL;

  // "Replay a real fix" — BUG-7's lifecycle: model → query → surface → fix.
  // Surface lights rose (it's the bug), the fix lights emerald (locked by a test).
  readonly replay = [
    { k: 'model', icon: 'account_tree' },
    { k: 'query', icon: 'search' },
    { k: 'surface', icon: 'error_outline' },
    { k: 'fix', icon: 'commit' },
  ];
  replayStep = 0;
  get replayDone(): boolean {
    return this.replayStep >= this.replay.length;
  }
  advanceReplay(): void {
    this.replayStep = this.replayDone ? 0 : this.replayStep + 1;
  }
  replayLit(i: number): boolean {
    return i < this.replayStep;
  }
  replayCurrent(i: number): boolean {
    return i === this.replayStep - 1;
  }
  replayRowCls(i: number): string {
    if (!this.replayLit(i)) {
      return 'border-beige bg-cream';
    }
    if (i === 2) {
      return 'border-rose-200 bg-white shadow-sm';
    }
    if (i === 3) {
      return 'border-emerald-200 bg-white shadow-sm';
    }
    return 'border-coral-200 bg-white shadow-sm';
  }
  replayIconCls(i: number): string {
    if (!this.replayLit(i)) {
      return 'bg-coral-50 text-coral-600';
    }
    if (i === 2) {
      return 'bg-rose-500 text-white';
    }
    if (i === 3) {
      return 'bg-emerald-500 text-white';
    }
    return 'bg-coral-500 text-white';
  }

  readonly querySnippet = `// the invariant, as a query — every role change must bump tokenVersion
MATCH (s:AuthStep)-[:TRANSITIONS_TO]->(t:State)
WHERE s.changesRole = true
  AND NOT (s)-[:BUMPS]->(:TokenBumpSite)
RETURN s.name AS missingBump   // BUG-7 fell out of this list`;
  readonly sevCls: Record<string, string> = {
    HIGH: 'bg-rose-100 text-rose-800',
    MEDIUM: 'bg-amber-100 text-amber-800',
    LOW: 'bg-beige/70 text-slate2',
  };

  readonly stats = [
    { key: 'surfaced', value: '23' },
    { key: 'severity', value: '8·11·4' },
    { key: 'split', value: '15·8' },
    { key: 'fixes', value: '14' },
    { key: 'verified', value: '9' },
  ];

  readonly model = [
    '1 FSM',
    '6 States',
    '5 AuthSteps',
    '7 TokenBumpSites',
    '2 Campaigns',
    'Invariants',
  ];

  // Verbatim-faithful to LegacyBugfix2026 (5 representative HIGH findings across fe + be + be2).
  readonly bugs = [
    {
      id: 'BUG-1',
      sev: 'HIGH',
      repo: 'fe',
      title: 'Admin logged out while editing an influencer',
      rc: 'AuthService.silentRefresh navigated on a background 419, tearing down the open admin dialog.',
    },
    {
      id: 'BUG-7',
      sev: 'HIGH',
      repo: 'be',
      title: '2FA-disable retained ADMIN authority',
      rc: 'Disabling 2FA set PENDING_ADMIN but never bumped tokenVersion, so the old ADMIN token kept access.',
    },
    {
      id: 'BUG-12',
      sev: 'HIGH',
      repo: 'be',
      title: 'Boot guard bricked startup after a GDPR deletion',
      rc: 'PaymentsDisabledBootGuard counted terminal ACCOUNT_DEACTIVATED users, so the app refused to start.',
    },
    {
      id: 'BUG-22',
      sev: 'HIGH',
      repo: 'be2',
      title: 'Browse-campaigns 400 on null compensation',
      rc: 'compensationAmountMin/Max were primitive int but the column is nullable, so listing campaigns 400d.',
    },
    {
      id: 'BUG-23',
      sev: 'HIGH',
      repo: 'be2',
      title: 'Admin 401 when activating a user',
      rc: 'A deferred Firebase claim-write for the target user surfaced as the caller 401, not the write failure.',
    },
  ];
}
