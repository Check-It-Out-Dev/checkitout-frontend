import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Observability showcase: the journald(sealed) -> Grafana Alloy -> Loki(GCS, 30d, mTLS)
 * -> Grafana pipeline + the dedicated "Pentest Activity" alert. Honesty register: the
 * collector is Grafana Alloy, NOT Promtail (some docs still say Promtail); single-node
 * Loki with GCS+WAL durability. Pipeline + alert verified live in Grafana.
 *
 * Ported from the legacy demo build into the greenfield editorial system:
 * shared <app-survey-card> + <app-code-panel>, coral accent for the pipeline,
 * semantic rose/emerald only on the live event wall (security match / live);
 * the event wall keeps the navy-900 dark-terminal surface per the code-panel
 * idiom; coral-pill Run control (house button idiom).
 */
@Component({
  selector: 'app-observability-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="INFRA"
      [title]="'landing.survey.obs.title' | transloco"
      [subtitle]="'landing.survey.obs.subtitle' | transloco"
    >
      <!-- pipeline (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.obs.pipelineLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.obs.run.indexed' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'replay' : 'play_arrow' }}</mat-icon>
            {{
              (done ? 'landing.survey.obs.run.replay' : 'landing.survey.obs.run.cta') | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        @for (s of pipeline; track s.name; let i = $index, last = $last) {
          <div
            class="relative rounded-xl border p-4 transition-all duration-300"
            [class]="isLit(i) ? 'border-coral-100 bg-white shadow-sm' : 'border-beige bg-cream'"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-300"
              [class]="isLit(i) ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-600'"
              [class.obs-current]="isCurrent(i)"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ s.icon }}</mat-icon>
            </div>
            <div
              class="mt-2.5 font-mono text-xs font-semibold leading-tight"
              [class]="isLit(i) ? 'text-ink' : 'text-slate2'"
            >
              {{ s.name }}
            </div>
            <div class="text-[10px] text-slate2">{{ s.meta }}</div>
            @if (!last) {
              <mat-icon
                class="absolute -right-3 top-8 hidden !h-5 !w-5 !text-xl transition-colors sm:block"
                [class]="isLit(i + 1) ? 'text-coral-500' : 'text-beige'"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- pentest event wall: a live Loki tail (semantic rose/emerald on dark) -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.obs.eventWallLabel' | transloco }}
      </p>
      <div class="mt-2 overflow-hidden rounded-xl bg-navy-900 shadow-sm">
        <div class="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
          <span class="h-2.5 w-2.5 rounded-full bg-coral-400/80"></span>
          <span class="h-2.5 w-2.5 rounded-full bg-amber-400/80"></span>
          <span class="h-2.5 w-2.5 rounded-full bg-emerald-400/80"></span>
          <span class="ml-2 font-mono text-[11px] text-cream/50">Loki · live tail</span>
          <span class="ml-auto inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span>
            live
          </span>
        </div>
        <div class="space-y-1 p-4 font-mono text-[11px]">
          @for (e of events; track e) {
            <div class="flex items-center gap-2">
              <span class="shrink-0 font-semibold text-rose-400">MATCH</span>
              <span class="truncate text-cream/50">{{ e }}</span>
            </div>
          }
          <div class="mt-2 flex items-center gap-2 font-semibold text-rose-300">
            <span class="h-2 w-2 animate-pulse rounded-full bg-rose-500"></span>
            {{ 'landing.survey.obs.alertFired' | transloco }}
          </div>
        </div>
      </div>

      <!-- stats -->
      <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        @for (st of stats; track st.key) {
          <div class="rounded-xl border border-beige bg-cream p-4 text-center">
            <div class="text-xl font-bold text-coral-600 tabular-nums">{{ st.value }}</div>
            <div class="mt-1 text-[11px] font-medium text-slate2">
              {{ 'landing.survey.obs.stats.' + st.key | transloco }}
            </div>
          </div>
        }
      </div>

      <!-- annotated alert rule — terminal-style panel -->
      <div class="mt-5">
        <app-code-panel file="Grafana · alert rule (LogQL)">{{ snippet }}</app-code-panel>
      </div>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .obs-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.2);
      }
    `,
  ],
})
export class ObservabilityShowcaseComponent {
  readonly pipeline = [
    { icon: 'description', name: 'journald', meta: 'sealed' },
    { icon: 'send', name: 'Grafana Alloy', meta: 'collector' },
    { icon: 'dns', name: 'Loki 3.5', meta: 'GCS · 30d · mTLS' },
    { icon: 'analytics', name: 'Grafana', meta: 'dashboards + alerts' },
  ];

  // Interactive walkthrough: each click moves a log line one hop down the pipeline.
  // Synchronous state — no timers/rAF, reliable + verifiable.
  step = 0;
  get done(): boolean {
    return this.step >= this.pipeline.length;
  }
  advance(): void {
    this.step = this.done ? 0 : this.step + 1;
  }
  isLit(i: number): boolean {
    return i < this.step;
  }
  isCurrent(i: number): boolean {
    return i === this.step - 1;
  }

  readonly events = [
    'GET /?x=${jndi:ldap://x}  ua=sqlmap',
    'GET /.env                 ua=nuclei',
    'GET /etc/passwd           ua=gobuster',
    'POST /wp-login.php        ua=wpscan',
  ];

  readonly stats = [
    { value: '7', key: 'alerts' },
    { value: '7', key: 'dashboards' },
    { value: '30d', key: 'retention' },
    { value: 'mTLS', key: 'ingress' },
  ];

  // House button idiom (marketing-toolbar CTA) — flat while running, stroked replay.
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly snippet = `# Grafana alert "Pentest Activity" — pages when scanner signatures hit the log stream
count_over_time(
  {job=~".+"} |~ "(?i)(sqlmap|nuclei|wpscan|gobuster|jndi:|/etc/passwd)"
[5m]) > 2`;
}
