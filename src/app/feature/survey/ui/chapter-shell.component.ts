import {
  AfterViewInit,
  Component,
  Input,
  OnInit,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { MarketingToolbarComponent } from '../../landing/marketing-toolbar/marketing-toolbar.component';
import { SURVEY_CHAPTERS, SurveyChapter, chapterByKey } from './chapter-registry';

/**
 * Chapter shell — the shared wrapper for every technical-survey chapter page
 * (ported from the legacy demo build into the greenfield editorial system).
 * Marketing toolbar on top, a compact chapter hero (back-link, "Chapter n of
 * 5" pill, the CTO question as a display-serif headline, the chapter intro)
 * and the prev/next reading footer — chapter components only project their
 * story cards.
 */
@Component({
  selector: 'app-chapter-shell',
  imports: [RouterModule, MatIconModule, TranslocoPipe, MarketingToolbarComponent],
  template: `
    <div class="min-h-screen bg-cream text-ink antialiased">
      <app-marketing-toolbar />

      <!-- chapter hero — compact: chapters are for reading, not landing -->
      <section class="relative overflow-hidden px-6 pb-12 pt-16 lg:px-8">
        <div class="chapter-grid pointer-events-none absolute inset-0"></div>
        <div class="relative mx-auto max-w-3xl text-center">
          <a
            routerLink="/technical-survey"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-slate2 transition hover:text-coral-600"
          >
            <mat-icon class="!h-4 !w-4 !text-base">arrow_back</mat-icon>
            {{ 'landing.survey.backToHub' | transloco }}
          </a>
          <div
            class="mt-5 inline-flex items-center gap-2 rounded-full bg-coral-50 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-coral-600"
          >
            <mat-icon class="!h-4 !w-4 !text-base">{{ chapter.icon }}</mat-icon>
            {{ 'landing.survey.chapterLabel' | transloco: { n: chapter.order } }} ·
            {{ name | transloco }}
          </div>
          <h1 class="font-display mt-5 text-3xl leading-tight text-ink sm:text-4xl lg:text-5xl">
            {{ question | transloco }}
          </h1>
          <p class="mt-4 text-lg leading-relaxed text-slate2">{{ intro | transloco }}</p>
        </div>
      </section>

      <!-- the story cards (projected by the chapter component) -->
      <section class="px-6 py-14 lg:px-8">
        <div class="mx-auto max-w-6xl space-y-6">
          <ng-content></ng-content>
        </div>
      </section>

      <!-- reading flow: cliffhanger handoff, then previous / next chapter -->
      <section class="px-6 pb-16 lg:px-8">
        <p class="mx-auto mb-8 max-w-2xl text-center text-lg leading-relaxed text-slate2">
          {{ 'landing.survey.chapters.' + key + '.handoff' | transloco }}
        </p>
        <div class="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2">
          @if (prev) {
            <a
              [routerLink]="['/technical-survey', prev.path]"
              class="group flex items-center gap-4 rounded-2xl border border-beige bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <mat-icon
                class="!h-5 !w-5 !text-xl shrink-0 text-slate2 transition-colors group-hover:text-coral-600"
              >
                arrow_back
              </mat-icon>
              <span class="min-w-0">
                <span class="block font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                  {{ 'landing.survey.prevLabel' | transloco }}
                </span>
                <span
                  class="mt-0.5 block truncate font-semibold text-ink transition-colors group-hover:text-coral-600"
                >
                  {{ 'landing.survey.chapters.' + prev.key + '.name' | transloco }}
                </span>
              </span>
            </a>
          } @else {
            <span class="hidden sm:block"></span>
          }
          @if (next) {
            <a
              [routerLink]="['/technical-survey', next.path]"
              class="group flex items-center justify-end gap-4 rounded-2xl border border-beige bg-white p-5 text-right shadow-sm transition hover:shadow-md"
            >
              <span class="min-w-0">
                <span class="block font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                  {{ 'landing.survey.nextLabel' | transloco }}
                </span>
                <span
                  class="mt-0.5 block truncate font-semibold text-ink transition-colors group-hover:text-coral-600"
                >
                  {{ 'landing.survey.chapters.' + next.key + '.name' | transloco }}
                </span>
              </span>
              <mat-icon
                class="!h-5 !w-5 !text-xl shrink-0 text-slate2 transition-colors group-hover:text-coral-600"
              >
                arrow_forward
              </mat-icon>
            </a>
          }
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
      /* Blueprint grid substrate — same restrained engineering texture as the hub. */
      .chapter-grid {
        background-image:
          linear-gradient(to right, rgba(14, 17, 22, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(14, 17, 22, 0.05) 1px, transparent 1px);
        background-size: 32px 32px;
        -webkit-mask-image: radial-gradient(ellipse 65% 60% at 50% 40%, #000 35%, transparent 100%);
        mask-image: radial-gradient(ellipse 65% 60% at 50% 40%, #000 35%, transparent 100%);
      }
    `,
  ],
})
export class ChapterShellComponent implements OnInit, AfterViewInit {
  private readonly route = inject(ActivatedRoute);

  /** Chapter key — must exist in SURVEY_CHAPTERS. */
  @Input({ required: true }) key!: SurveyChapter['key'];

  chapter!: SurveyChapter;
  prev?: SurveyChapter;
  next?: SurveyChapter;
  name = '';
  question = '';
  intro = '';

  ngOnInit(): void {
    this.chapter = chapterByKey(this.key);
    this.prev = SURVEY_CHAPTERS.find((c) => c.order === this.chapter.order - 1);
    this.next = SURVEY_CHAPTERS.find((c) => c.order === this.chapter.order + 1);
    const base = 'landing.survey.chapters.' + this.key;
    this.name = base + '.name';
    this.question = base + '.question';
    this.intro = base + '.intro';
  }

  // Deep links from the hub's "Cool stuff" strip arrive as URL fragments.
  // Router anchorScrolling is unreliable with lazy content, so jump manually
  // (instant scroll — native smooth-scroll pauses in backgrounded tabs; the
  // scroll-mt-24 on each card clears the sticky toolbar).
  ngAfterViewInit(): void {
    const frag = this.route.snapshot.fragment;
    if (frag) {
      setTimeout(() => document.getElementById(frag)?.scrollIntoView({ block: 'start' }), 0);
    }
  }
}
