import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { BE_REPO_URL, FE_REPO_URL, feFileUrl } from '../ui/survey-links';

/**
 * CI/CD — what runs when, and how long it takes. Four rows, each a pipeline
 * that exists in the repositories today:
 *   • the PR run (.github/workflows/ci-tests.yml) — hermetic by design: no
 *     backend, no browsers, no Docker, so a fork's PR never touches the
 *     self-hosted infrastructure; its median duration is measured by
 *     tools/measure-test-counts.mjs from `gh run list` and gated by G15;
 *   • the nightly full-stack run — written, four shards, dispatch-only until
 *     the backend images have run in CI (a red cron nobody has seen green is
 *     worse than no cron);
 *   • the release chains — the backend's reusable-workflow chain, and the
 *     demo's tools/deploy-demo.mjs (atomic swap, three rollback copies, hash
 *     verification on both domains);
 *   • k6 — thresholds on the demo's routes, local and on demand.
 * Verified against the workflow files on 2026-09-08.
 */
@Component({
  selector: 'app-cicd-runs-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-survey-card
      tag="CI/CD"
      [title]="'landing.survey.pipelines.title' | transloco"
      [subtitle]="'landing.survey.pipelines.subtitle' | transloco"
    >
      <div class="mt-6 overflow-hidden rounded-2xl border border-beige" data-testid="cicd-runs">
        @for (r of runs; track r.k) {
          <div
            class="grid gap-3 border-b border-beige bg-white p-4 last:border-0 md:grid-cols-[minmax(0,11rem)_1fr_auto] md:items-start"
            [attr.data-run]="r.k"
          >
            <div class="flex items-center gap-2.5">
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
              >
                <mat-icon class="!h-4 !w-4 !text-base">{{ r.icon }}</mat-icon>
              </span>
              <div class="min-w-0">
                <div class="text-sm font-semibold leading-tight text-ink">
                  {{ 'landing.survey.pipelines.runs.' + r.k + '.name' | transloco }}
                </div>
                <div class="font-mono text-[10px] leading-tight text-slate2">
                  {{ 'landing.survey.pipelines.runs.' + r.k + '.trigger' | transloco }}
                </div>
              </div>
            </div>
            <p class="text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.pipelines.runs.' + r.k + '.what' | transloco }}
            </p>
            <div class="md:text-right">
              <span
                class="inline-flex rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                [class]="r.badge"
              >
                {{ 'landing.survey.pipelines.runs.' + r.k + '.figure' | transloco }}
              </span>
            </div>
          </div>
        }
      </div>

      <p class="mt-3 text-[11px] leading-relaxed text-slate2" data-testid="cicd-note">
        {{ 'landing.survey.pipelines.note' | transloco }}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <a
          [href]="ciWorkflow"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1 text-xs font-medium text-ink transition hover:border-coral-300 hover:text-coral-600"
        >
          ci-tests.yml
          <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
        </a>
        <a
          [href]="nightlyWorkflow"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1 text-xs font-medium text-ink transition hover:border-coral-300 hover:text-coral-600"
        >
          nightly-full-stack.yml
          <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
        </a>
        <a
          [href]="beWorkflows"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1 text-xs font-medium text-ink transition hover:border-coral-300 hover:text-coral-600"
        >
          {{ 'landing.survey.pipelines.beWorkflows' | transloco }}
          <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
        </a>
      </div>
    </app-survey-card>
  `,
})
export class CicdRunsShowcaseComponent {
  readonly ciWorkflow = feFileUrl('.github/workflows/ci-tests.yml');
  readonly nightlyWorkflow = feFileUrl('.github/workflows/nightly-full-stack.yml');
  readonly beWorkflows = `${BE_REPO_URL}/tree/main/.github/workflows`;
  readonly feRepo = FE_REPO_URL;

  /** One row per pipeline; the figure strings live in i18n and are gated by G15. */
  readonly runs = [
    { k: 'pr', icon: 'bolt', badge: 'bg-coral-500 text-white' },
    { k: 'nightly', icon: 'dark_mode', badge: 'bg-navy-900 text-white' },
    { k: 'release', icon: 'rocket_launch', badge: 'bg-ink text-white' },
    { k: 'perf', icon: 'speed', badge: 'border border-beige bg-cream text-ink' },
  ] as const;
}
