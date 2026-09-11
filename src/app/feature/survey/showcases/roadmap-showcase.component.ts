import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { GRAPH_REPO_URL, graphFileUrl } from '../ui/survey-links';

/**
 * In progress — the work under way, named so the estate never reads as
 * finished-and-abandoned. Six items, three statuses: four shipped between 2026-09-09 and 2026-09-12,
 * two that genuinely have not. The product's own hosting
 * stays on Docker Compose + systemd (the docs reject Kubernetes for that three
 * times, and still do); Kubernetes enters only as the substrate for test
 * execution — ephemeral runner pods, sharded suites, aggregated reports —
 * which is a different question. Tool names come from a 2026-09 survey of
 * the field (Testkube, ARC, Playwright blob reports, Allure → ReportPortal,
 * k6-operator, Lighthouse CI) and each item says what it changes.
 */
@Component({
  selector: 'app-roadmap-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-survey-card
      [tag]="'landing.survey.roadmap.tag' | transloco"
      [title]="'landing.survey.roadmap.title' | transloco"
      [subtitle]="'landing.survey.roadmap.subtitle' | transloco"
    >
      <p class="mt-5 text-sm leading-relaxed text-ink" data-testid="roadmap-why">
        {{ 'landing.survey.roadmap.why' | transloco }}
      </p>

      <ol class="mt-5 grid gap-3 md:grid-cols-2" data-testid="roadmap-items">
        @for (it of items; track it.k) {
          <li
            class="flex gap-3 rounded-2xl border border-beige bg-cream p-4"
            [attr.data-item]="it.k"
            [attr.data-status]="it.status"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
              [class]="
                it.status === 'done'
                  ? 'bg-emerald-600'
                  : it.status === 'progress'
                    ? 'bg-navy-900'
                    : 'bg-slate2'
              "
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ it.icon }}</mat-icon>
            </span>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold leading-tight text-ink">
                  {{ 'landing.survey.roadmap.items.' + it.k + '.t' | transloco }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]"
                  [class]="
                    it.status === 'done'
                      ? 'bg-emerald-700 text-white'
                      : it.status === 'progress'
                        ? 'bg-navy-900 text-white'
                        : 'border border-beige bg-white text-slate2'
                  "
                >
                  {{ 'landing.survey.roadmap.status.' + it.status | transloco }}
                </span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-slate2">
                {{ 'landing.survey.roadmap.items.' + it.k + '.d' | transloco }}
              </p>
              <p class="mt-1 font-mono text-[10px] leading-relaxed text-ink">
                {{ 'landing.survey.roadmap.items.' + it.k + '.tools' | transloco }}
              </p>
            </div>
          </li>
        }
      </ol>

      <div class="mt-5 rounded-xl border border-coral-100 bg-coral-50 p-4" data-testid="roadmap-ai">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">psychology</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.roadmap.ai.title' | transloco }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.roadmap.ai.present' | transloco }}
        </p>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.roadmap.ai.next' | transloco }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a
            [href]="graphRepo"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-coral-600 hover:text-coral-700"
          >
            {{ 'landing.survey.roadmap.ai.link' | transloco }}
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
          </a>
          <a
            [href]="evalDocs"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:text-coral-600"
          >
            {{ 'landing.survey.roadmap.ai.evalLink' | transloco }}
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
          </a>
          <a
            [href]="evalGate"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:text-coral-600"
          >
            {{ 'landing.survey.roadmap.ai.gateLink' | transloco }}
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
          </a>
        </div>
      </div>
    </app-survey-card>
  `,
})
export class RoadmapShowcaseComponent {
  readonly graphRepo = GRAPH_REPO_URL;
  readonly evalDocs = graphFileUrl('applications/CodeMap/docs/06-prompt-transfer-findings.md');
  readonly evalGate = graphFileUrl('applications/CodeMap/eval/ci/README.md');

  /** Status is a fact about the work, not a promise: `progress` has commits behind it, `next` has a design. */
  /**
   * Three states, declared rather than inferred. Nothing is `progress` at the moment, and `as const`
   * would narrow the union to what happens to be in the list today - which turns the template's
   * three-way branch into a type error and would quietly delete the middle state the next time
   * something is genuinely half-done.
   */
  readonly items: readonly { k: string; icon: string; status: 'done' | 'progress' | 'next' }[] = [
    { k: 'k8s', icon: 'lan', status: 'done' },
    { k: 'perf', icon: 'speed', status: 'done' },
    { k: 'reports', icon: 'summarize', status: 'done' },
    { k: 'vitals', icon: 'insights', status: 'done' },
    { k: 'schemathesis', icon: 'fact_check', status: 'next' },
    { k: 'quarantine', icon: 'gpp_maybe', status: 'next' },
  ];
}
