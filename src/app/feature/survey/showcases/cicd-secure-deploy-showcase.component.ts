import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Secure CI/CD showcase: the 6-stage reusable-workflow DAG + two safety lanes
 * (tamper-evident remote exec, auto systemd rollback) + the triple deploy gate.
 * Verified against .github/workflows + .github/scripts. Honesty: the GitHub-IP
 * network gate is built (ipset) but STAGED — said so. Snippet is faithful to
 * real scripts.
 *
 * Ported from the legacy demo build into the greenfield editorial system:
 * shared <app-survey-card> + <app-code-panel>, coral accent for the pipeline,
 * semantic rose/amber only for the safety lanes, coral-pill Run control
 * (greenfield has no shared button primitive — the toolbar CTA idiom is the
 * house button).
 */
@Component({
  selector: 'app-cicd-secure-deploy-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="INFRA"
      [title]="'landing.survey.cicd.title' | transloco"
      [subtitle]="'landing.survey.cicd.subtitle' | transloco"
    >
      <!-- 6-stage pipeline (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.cicd.stagesLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.cicd.run.deployed' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'replay' : 'play_arrow' }}</mat-icon>
            {{
              (done ? 'landing.survey.cicd.run.replay' : 'landing.survey.cicd.run.cta') | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        @for (s of stages; track s.name; let i = $index) {
          <div
            class="rounded-xl border p-3 text-center transition-all duration-300"
            [class]="isLit(i) ? 'border-coral-100 bg-white shadow-sm' : 'border-beige bg-cream'"
          >
            <div
              class="mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300"
              [class]="isLit(i) ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-600'"
              [class.cicd-current]="isCurrent(i)"
            >
              <mat-icon class="!h-4 !w-4 !text-base">{{ s.icon }}</mat-icon>
            </div>
            <div
              class="mt-1.5 font-mono text-[10px] leading-tight"
              [class]="isLit(i) ? 'text-ink' : 'text-slate2'"
            >
              {{ s.name }}
            </div>
          </div>
        }
      </div>

      <!-- two safety lanes (semantic) -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.cicd.scenariosLabel' | transloco }}
      </p>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-rose-100 bg-rose-50 p-4">
          <div class="flex items-center gap-2 text-sm font-semibold text-rose-800">
            <mat-icon class="!h-4 !w-4 !text-base text-rose-500">gpp_maybe</mat-icon>
            {{ 'landing.survey.cicd.tamperLabel' | transloco }}
            <span class="text-rose-400">&rarr;</span>
            <span class="font-mono">{{ 'landing.survey.cicd.tamperOut' | transloco }}</span>
          </div>
          <div class="mt-1.5 text-xs leading-relaxed text-rose-700/80">
            {{ 'landing.survey.cicd.tamperDetail' | transloco }}
          </div>
        </div>
        <div class="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div class="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <mat-icon class="!h-4 !w-4 !text-base text-amber-500">replay</mat-icon>
            {{ 'landing.survey.cicd.failLabel' | transloco }}
            <span class="text-amber-400">&rarr;</span>
            <span class="font-mono">{{ 'landing.survey.cicd.failOut' | transloco }}</span>
          </div>
          <div class="mt-1.5 text-xs leading-relaxed text-amber-700/80">
            {{ 'landing.survey.cicd.failDetail' | transloco }}
          </div>
        </div>
      </div>

      <!-- triple deploy gate -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.cicd.gateLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (g of gates; track g) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1 text-xs font-medium text-ink"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-coral-500"></span>
            {{ 'landing.survey.cicd.' + g | transloco }}
          </span>
        }
      </div>

      <!-- annotated real scripts — terminal-style panel -->
      <div class="mt-5">
        <app-code-panel file=".github/scripts/">{{ snippet }}</app-code-panel>
      </div>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .cicd-current {
        box-shadow: 0 0 0 3px rgba(255, 90, 54, 0.2);
      }
    `,
  ],
})
export class CicdSecureDeployShowcaseComponent {
  readonly stages = [
    { icon: 'download', name: 'config-loader' },
    { icon: 'check_circle', name: 'config-validator' },
    { icon: 'build', name: 'maven-docker-build' },
    { icon: 'backup', name: 'pre-deploy backup' },
    { icon: 'lock', name: 'deploy-and-secure' },
    { icon: 'refresh', name: 'reload-and-validate' },
  ];

  // Interactive walkthrough: each click advances the pipeline one stage.
  // Synchronous state — no timers/rAF, reliable + verifiable. Demo deploys nothing.
  step = 0;
  get done(): boolean {
    return this.step >= this.stages.length;
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

  readonly gates = ['gate1', 'gate2', 'gate3'];
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly snippet = `# deploy-and-secure.sh — abort if .env is not immutable (critical-security gate)
make_directory_immutable || critical_security_failure ".env not immutable"

# validate-and-exec-ci-script.sh — checksum + replay window before running ANY remote script
[ "$(sha256sum "$script")" = "$expected_sha" ] || refuse "checksum mismatch"
[ "$age_seconds" -le "$SCRIPT_EXECUTION_TIMEOUT_SECONDS" ] || refuse "replay window"

# 95-ubuntu-docker-cicd (sudoers) — docker push scoped to ONE registry, NOPASSWD per-command
ubuntu ALL=(root) NOPASSWD: /usr/bin/docker push ghcr.io/check-it-out-dev/checkitout-be/*`;
}
