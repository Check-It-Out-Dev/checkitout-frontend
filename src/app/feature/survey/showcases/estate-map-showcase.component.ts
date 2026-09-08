import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import {
  AUTHOR_LINKEDIN_URL,
  AUTHOR_NAME,
  BE_REPO_URL,
  FE_REPO_URL,
  GITHUB_ORG_URL,
  GRAPH_REPO_URL,
  beFileUrl,
  feFileUrl,
  graphFileUrl,
} from '../ui/survey-links';

/**
 * The estate in one screen — the first card of the engineering chapter, which
 * is the page a CV links to. A reader arriving cold needs three things in the
 * first screen: what this is, one piece of evidence it is real, and at most
 * three exits. The three exits are the public repositories, each with the
 * question it answers, its README and one document a step deeper; the
 * evidence is the measured figure on each card (gated by G15 against
 * docs/testing/measured-counts.json, so the site cannot drift from the code).
 * The engineer is named once, here, with two links.
 */
@Component({
  selector: 'app-estate-map-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-survey-card
      [tag]="'landing.survey.estate.tag' | transloco"
      [title]="'landing.survey.estate.title' | transloco"
      [subtitle]="'landing.survey.estate.subtitle' | transloco"
    >
      <p class="mt-5 text-sm leading-relaxed text-ink" data-testid="estate-lead">
        {{ 'landing.survey.estate.lead' | transloco }}
      </p>

      <div class="mt-5 grid gap-3 lg:grid-cols-3">
        @for (r of repos; track r.k) {
          <article
            class="flex flex-col rounded-2xl border border-beige bg-cream p-5"
            [attr.data-testid]="'estate-repo-' + r.k"
          >
            <div class="flex items-center gap-3">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                [class]="r.chip"
              >
                <mat-icon class="!h-5 !w-5 !text-xl">{{ r.icon }}</mat-icon>
              </span>
              <div class="min-w-0">
                <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                  {{ 'landing.survey.estate.repos.' + r.k + '.kind' | transloco }}
                </div>
                <div class="truncate font-semibold text-ink">{{ r.name }}</div>
              </div>
            </div>
            <p class="mt-3 text-sm leading-relaxed text-ink">
              {{ 'landing.survey.estate.repos.' + r.k + '.owns' | transloco }}
            </p>
            <p class="mt-2 font-mono text-[11px] font-medium text-coral-700">
              {{ 'landing.survey.estate.repos.' + r.k + '.figure' | transloco }}
            </p>
            <p class="mt-2 text-xs leading-relaxed text-slate2">
              <span class="font-mono text-[10px] uppercase tracking-[0.14em]">
                {{ 'landing.survey.estate.answersLabel' | transloco }}
              </span>
              {{ 'landing.survey.estate.repos.' + r.k + '.answers' | transloco }}
            </p>
            <div class="mt-auto flex flex-wrap gap-2 pt-4">
              <a
                [href]="r.readme"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-coral-600"
                [attr.data-testid]="'estate-readme-' + r.k"
              >
                README
                <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
              </a>
              <a
                [href]="r.docs"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:border-coral-300 hover:text-coral-600"
              >
                {{ 'landing.survey.estate.repos.' + r.k + '.docs' | transloco }}
                <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
              </a>
            </div>
          </article>
        }
      </div>

      <!-- the engineer, named once -->
      <div
        class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-beige bg-white px-4 py-3"
        data-testid="estate-author"
      >
        <p class="text-sm text-ink">
          {{ 'landing.survey.estate.author' | transloco }}
          <span class="font-semibold">{{ authorName }}</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <a
            [href]="linkedin"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 rounded-full border border-beige px-3 py-1 text-xs font-medium text-ink transition hover:border-coral-300 hover:text-coral-600"
            data-testid="estate-author-linkedin"
          >
            LinkedIn
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
          </a>
          <a
            [href]="github"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 rounded-full border border-beige px-3 py-1 text-xs font-medium text-ink transition hover:border-coral-300 hover:text-coral-600"
            data-testid="estate-author-github"
          >
            GitHub
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">open_in_new</mat-icon>
          </a>
        </div>
      </div>
    </app-survey-card>
  `,
})
export class EstateMapShowcaseComponent {
  readonly authorName = AUTHOR_NAME;
  readonly linkedin = AUTHOR_LINKEDIN_URL;
  readonly github = GITHUB_ORG_URL;

  /** The three repositories in the order a reader's questions arrive. */
  readonly repos = [
    {
      k: 'frontend',
      name: 'checkitout-frontend',
      icon: 'web',
      chip: 'bg-coral-500',
      readme: FE_REPO_URL,
      docs: feFileUrl('docs/testing/LAYERED-TEST-ARCHITECTURE.md'),
    },
    {
      k: 'backend',
      name: 'checkitout-backend',
      icon: 'dns',
      chip: 'bg-navy-900',
      readme: BE_REPO_URL,
      docs: beFileUrl('docs/TESTING-PHILOSOPHY.md'),
    },
    {
      k: 'method',
      name: 'graph-theory-system-modeling',
      icon: 'account_tree',
      chip: 'bg-success',
      readme: GRAPH_REPO_URL,
      docs: graphFileUrl('applications/CodeMap/docs'),
    },
  ] as const;
}
