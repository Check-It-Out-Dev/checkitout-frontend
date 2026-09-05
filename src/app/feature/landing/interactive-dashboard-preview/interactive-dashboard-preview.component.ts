import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  PLATFORM_ID,
  type WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

/** Chip temperature: waiting (pending), fresh news (alert), settled (done). */
type Tone = 'active' | 'alert' | 'pending' | 'done';

/** The two cards' chip tone at each beat. */
const TONES: Record<string, { brand: Tone; influencer: Tone }> = {
  campaign_created: { brand: 'active', influencer: 'active' },
  influencer_application: { brand: 'alert', influencer: 'active' },
  review_selection: { brand: 'active', influencer: 'done' },
  agreement_planning: { brand: 'done', influencer: 'done' },
  content_creation: { brand: 'pending', influencer: 'active' },
  content_approval: { brand: 'done', influencer: 'done' },
  publication_results: { brand: 'done', influencer: 'done' },
};

/**
 * Interactive dashboard preview — the landing's "watch a collaboration
 * happen" widget (ported from the legacy feature/demo build). Two modes:
 *
 *   • overview   — the static tableau: all seven lifecycle steps visible at
 *     once next to the brand and influencer cards. No timers.
 *   • simulation — the guided run: it starts playing the moment the visitor
 *     opens it (owner, 2026-09-04: the presentation must run, not wait for
 *     clicks), one beat every 2.6 s, with pause/step/reset controls; the
 *     influencer card joins at the application beat and the finale swaps the
 *     stage for the success panel (7 steps / 100% / 12k reach / 4.2★ — the
 *     legacy's fictional campaign result).
 *
 * Both side cards play the beat: the brand card counts applications, picks a
 * candidate, signs the terms, stamps the approval and closes with the result
 * tile; the influencer card joins with her profile, accepts, produces the reel
 * and ends on published metrics. Every beat block is re-created per beat (the
 * `@for` key is the beat) so its entry animation replays, and all motion is
 * dropped under `prefers-reduced-motion`.
 *
 * One timeline: the progress card lists the same seven `stepKeys` the
 * narration reads, so item N is "current" exactly when beat N is on stage.
 * (Until 2026-09-04 the list came from a second, differently worded i18n
 * array and ran a beat ahead of the story.)
 *
 * The autoplay interval starts ONLY from click handlers, so the prerendered
 * route never runs a timer during SSR; ngOnDestroy, every mode/reset
 * transition and a hidden tab clear it. Legacy's contact-modal CTA becomes a
 * sign-up link — the greenfield landing has no contact modal by design.
 */
@Component({
  selector: 'app-interactive-dashboard-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink, TranslocoModule],
  template: `
    <section class="mx-auto max-w-6xl px-4 py-16 md:py-24" data-testid="landing-dashboard-preview">
      <div class="mb-10 text-center">
        <span class="eyebrow">{{ 'landing.dashboard_preview.subtitle' | transloco }}</span>
        <h2 class="mt-3 font-display text-4xl font-normal text-ink sm:text-5xl">
          {{ 'landing.dashboard_preview.title' | transloco }}
        </h2>
        <p class="mx-auto mt-4 max-w-2xl text-slate2">
          {{ 'landing.dashboard_preview.description' | transloco }}
        </p>

        <!-- mode toggle -->
        <div
          class="mt-6 inline-flex rounded-full border border-beige bg-white p-1"
          role="tablist"
          data-testid="dashboard-mode-toggle"
        >
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'overview'"
            (click)="setMode('overview')"
            class="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            [class]="
              mode() === 'overview' ? 'bg-coral-700 text-white' : 'text-slate2 hover:text-ink'
            "
          >
            {{ 'landing.dashboard_preview.modes.overview' | transloco }}
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'simulation'"
            (click)="setMode('simulation')"
            class="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            [class]="
              mode() === 'simulation' ? 'bg-coral-700 text-white' : 'text-slate2 hover:text-ink'
            "
            data-testid="dashboard-mode-simulation"
          >
            {{ 'landing.dashboard_preview.modes.simulation' | transloco }}
          </button>
        </div>
      </div>

      @if (!done()) {
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <!-- brand card -->
          <article class="flex flex-col gap-3 rounded-2xl border border-beige bg-white p-6">
            <span
              class="inline-flex self-start rounded-full bg-coral-50 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-coral-700"
            >
              {{ 'landing.dashboard_preview.cards.brand.badge' | transloco }}
            </span>
            <div>
              <h3 class="font-display text-2xl text-ink">
                {{ 'landing.dashboard_preview.cards.brand.name' | transloco }}
              </h3>
              <p class="text-xs text-slate2">
                {{ 'landing.dashboard_preview.cards.brand.type' | transloco }}
              </p>
            </div>
            <div class="rounded-xl border border-beige bg-cream/60 p-4">
              <p
                class="font-mono text-[0.6rem] font-medium uppercase tracking-[0.18em] text-slate2"
              >
                {{ 'landing.dashboard_preview.cards.brand.requirements.title' | transloco }}
              </p>
              <ul class="mt-2 flex flex-col gap-1.5">
                @for (
                  item of $any(
                    'landing.dashboard_preview.cards.brand.requirements.items' | transloco
                  );
                  track item
                ) {
                  <li class="flex items-start gap-2 text-xs text-slate2">
                    <mat-icon class="mt-0.5 !h-3.5 !w-3.5 shrink-0 !text-sm text-coral-500">
                      check_circle
                    </mat-icon>
                    {{ item }}
                  </li>
                }
              </ul>
            </div>

            <!-- what the brand sees at this beat. The block stays mounted so the
                 chip and the note change in place; @switch replaces only the tile,
                 which is what carries the entry animation. Re-creating the whole
                 block made it blink to nothing on every beat. -->
            <div class="flex flex-col gap-3" [attr.data-testid]="'dashboard-brand-' + beatKey()">
              <span [class]="chipClass(brandTone())">
                {{ 'landing.dashboard_preview.beats.' + beatKey() + '.brand.status' | transloco }}
              </span>

              @switch (beatKey()) {
                @case ('campaign_created') {
                  <div
                    class="rounded-xl border border-beige bg-white p-3 text-center"
                    [class.beat-enter]="animated()"
                  >
                    <p class="font-display text-3xl text-ink" data-testid="dashboard-brand-count">
                      {{ applicationCount() }}
                    </p>
                    <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                      {{ 'landing.dashboard_preview.beats.labels.applications' | transloco }}
                    </p>
                  </div>
                }
                @case ('influencer_application') {
                  <div
                    class="rounded-xl border border-coral-200 bg-coral-50/70 p-3 text-center"
                    [class.beat-enter]="animated()"
                  >
                    <p
                      class="font-display text-3xl text-coral-700"
                      [class.bump]="animated()"
                      data-testid="dashboard-brand-count"
                    >
                      {{ applicationCount() }}
                    </p>
                    <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-coral-700">
                      {{ 'landing.dashboard_preview.beats.labels.applications' | transloco }}
                    </p>
                  </div>
                }
                @case ('review_selection') {
                  <ul
                    class="flex flex-col gap-1.5"
                    [class.beat-enter]="animated()"
                    data-testid="dashboard-brand-candidates"
                  >
                    @for (person of candidates; track person.initials; let i = $index) {
                      <li
                        class="flex items-center gap-2 rounded-xl border p-2"
                        [class.beat-enter]="animated()"
                        [style.animation-delay]="i * 90 + 'ms'"
                        [class]="
                          person.chosen
                            ? 'border-coral-300 bg-coral-50/70'
                            : 'border-beige bg-white'
                        "
                      >
                        <span
                          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-50 font-mono text-[10px] text-navy-500"
                        >
                          {{ person.initials }}
                        </span>
                        <span class="truncate text-xs text-slate2">{{ person.name }}</span>
                        @if (person.chosen) {
                          <mat-icon class="ml-auto !h-4 !w-4 shrink-0 !text-base text-coral-600">
                            check_circle
                          </mat-icon>
                        }
                      </li>
                    }
                  </ul>
                }
                @case ('agreement_planning') {
                  <div
                    class="rounded-xl border border-beige bg-cream/60 p-3"
                    [class.beat-enter]="animated()"
                    data-testid="dashboard-terms"
                  >
                    <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                      {{ 'landing.dashboard_preview.beats.labels.terms.title' | transloco }}
                    </p>
                    <ul class="mt-1.5 flex flex-col gap-1">
                      @for (
                        term of $any(
                          'landing.dashboard_preview.beats.labels.terms.items' | transloco
                        );
                        track term;
                        let i = $index
                      ) {
                        <li
                          class="flex items-center gap-1.5 text-xs text-slate2"
                          [class.beat-enter]="animated()"
                          [style.animation-delay]="i * 90 + 'ms'"
                        >
                          <mat-icon class="!h-3.5 !w-3.5 shrink-0 !text-sm text-success">
                            check
                          </mat-icon>
                          {{ term }}
                        </li>
                      }
                    </ul>
                  </div>
                }
                @case ('content_creation') {
                  <div
                    class="flex items-center gap-2 rounded-xl border border-beige bg-cream/60 p-3"
                    [class.beat-enter]="animated()"
                    data-testid="dashboard-brand-waiting"
                  >
                    <mat-icon class="!h-4 !w-4 shrink-0 !text-base text-warning-strong">
                      photo_camera
                    </mat-icon>
                    <span class="text-xs text-slate2">
                      {{ 'landing.dashboard_preview.beats.labels.content' | transloco }}
                    </span>
                  </div>
                }
                @case ('content_approval') {
                  <div
                    class="relative rounded-xl border border-beige bg-cream/60 p-3"
                    [class.beat-enter]="animated()"
                    data-testid="dashboard-brand-approval"
                  >
                    <div class="h-14 rounded-lg bg-beige/70"></div>
                    <span
                      class="absolute right-4 top-4 rounded-full bg-success-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-success-strong"
                      [class.stamp-in]="animated()"
                    >
                      {{ 'landing.dashboard_preview.beats.labels.approved' | transloco }}
                    </span>
                  </div>
                }
                @case ('publication_results') {
                  <div
                    class="grid grid-cols-2 gap-2"
                    [class.beat-enter]="animated()"
                    data-testid="dashboard-brand-results"
                  >
                    <div class="rounded-xl border border-beige bg-cream/60 p-3 text-center">
                      <p class="font-display text-2xl text-ink">{{ fmt(reach()) }}</p>
                      <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                        {{ 'landing.dashboard_preview.beats.labels.reach' | transloco }}
                      </p>
                    </div>
                    <div class="rounded-xl border border-beige bg-cream/60 p-3 text-center">
                      <p class="font-display text-2xl text-ink">
                        {{ 'landing.dashboard_preview.beats.labels.roi_value' | transloco }}
                      </p>
                      <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                        {{ 'landing.dashboard_preview.beats.labels.roi' | transloco }}
                      </p>
                    </div>
                  </div>
                }
              }

              <p class="text-xs leading-relaxed text-slate2">
                {{ 'landing.dashboard_preview.beats.' + beatKey() + '.brand.note' | transloco }}
              </p>
            </div>
          </article>

          <!-- progress card — the seven-step state machine -->
          <article class="flex flex-col rounded-2xl border border-beige bg-white p-6">
            <h3 class="font-display text-xl text-ink">
              {{ 'landing.dashboard_preview.cards.progress.title' | transloco }}
            </h3>
            <ol class="mt-4 flex flex-grow flex-col gap-2.5" data-testid="dashboard-progress-steps">
              @for (key of stepKeys; track key; let i = $index) {
                <li class="flex items-start gap-2.5" [attr.data-testid]="'dashboard-step-' + key">
                  @if (stepState(i) === 'done') {
                    <mat-icon class="!h-4 !w-4 shrink-0 !text-base text-emerald-500">
                      check_circle
                    </mat-icon>
                  } @else if (stepState(i) === 'current') {
                    <span class="relative mt-0.5 flex h-3.5 w-3.5 shrink-0" aria-hidden="true">
                      <span
                        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-400 opacity-60 motion-reduce:animate-none"
                      ></span>
                      <span
                        class="relative inline-flex h-3.5 w-3.5 rounded-full bg-coral-500"
                      ></span>
                    </span>
                  } @else {
                    <span
                      class="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-beige"
                      aria-hidden="true"
                    ></span>
                  }
                  <div class="min-w-0">
                    <p
                      class="text-sm font-semibold leading-tight"
                      [class]="stepState(i) === 'todo' ? 'text-slate2/60' : 'text-ink'"
                    >
                      {{ 'landing.dashboard_preview.steps.' + key + '.title' | transloco }}
                    </p>
                    <!-- always rendered, only faded: revealing it with @if grew
                         the card by one line on every beat and shoved the
                         narration, the controls and the whole page down -->
                    <p
                      class="text-xs leading-relaxed text-slate2 transition-opacity duration-300"
                      [class.opacity-0]="stepState(i) === 'todo'"
                      [attr.aria-hidden]="stepState(i) === 'todo' ? 'true' : null"
                    >
                      {{ 'landing.dashboard_preview.steps.' + key + '.description' | transloco }}
                    </p>
                  </div>
                </li>
              }
            </ol>

            @if (mode() === 'simulation') {
              <!-- narration + controls for the current beat -->
              <div class="mt-4 rounded-xl border border-beige bg-cream/60 p-4">
                <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                  {{ 'landing.dashboard_preview.step' | transloco }} {{ step() + 1 }}
                  {{ 'landing.dashboard_preview.of' | transloco }} {{ stepKeys.length }}
                </p>
                <p class="mt-1 text-sm font-semibold text-ink">
                  {{ 'landing.dashboard_preview.steps.' + stepKeys[step()] + '.title' | transloco }}
                </p>
                <p class="mt-0.5 text-xs leading-relaxed text-slate2">
                  {{
                    'landing.dashboard_preview.steps.' + stepKeys[step()] + '.description'
                      | transloco
                  }}
                </p>
                @if (playing()) {
                  <!-- how long this beat still has; re-created per beat so the
                       fill restarts (the @for key is the beat index) -->
                  <div
                    class="mt-2.5 h-1 overflow-hidden rounded-full bg-beige"
                    aria-hidden="true"
                    data-testid="dashboard-beat-progress"
                  >
                    @for (beat of [step()]; track beat) {
                      <div
                        class="beat-bar h-full rounded-full bg-coral-500"
                        [style.animationDuration.ms]="beatMs()"
                      ></div>
                    }
                  </div>
                }
              </div>
              <div class="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  (click)="togglePlay()"
                  class="inline-flex items-center gap-1.5 rounded-full bg-coral-700 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-coral-800"
                  data-testid="dashboard-autoplay"
                >
                  <mat-icon class="!h-4 !w-4 !text-base">
                    {{ playing() ? 'pause' : 'play_arrow' }}
                  </mat-icon>
                  {{
                    (playing()
                      ? 'landing.dashboard_preview.pause'
                      : 'landing.dashboard_preview.autoplay'
                    ) | transloco
                  }}
                </button>
                <button
                  type="button"
                  (click)="advance()"
                  class="inline-flex items-center rounded-full border border-beige bg-white px-4 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-coral-300 hover:text-coral-600"
                  data-testid="dashboard-next"
                >
                  {{
                    'landing.dashboard_preview.steps.' + stepKeys[step()] + '.action' | transloco
                  }}
                </button>
                <button
                  type="button"
                  (click)="restart()"
                  [attr.aria-label]="'landing.dashboard_preview.reset' | transloco"
                  [title]="'landing.dashboard_preview.reset' | transloco"
                  class="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-slate2 transition-colors hover:bg-cream hover:text-ink"
                >
                  <mat-icon class="!h-4 !w-4 !text-base">replay</mat-icon>
                </button>
              </div>
            }
          </article>

          <!-- influencer card — joins the story at the application beat -->
          <article
            class="flex flex-col gap-3 rounded-2xl border border-beige bg-white p-6"
            [class.opacity-60]="mode() === 'simulation' && step() < 1"
          >
            <span
              class="inline-flex self-start rounded-full bg-navy-50 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-navy-500"
            >
              {{ 'landing.dashboard_preview.cards.influencer.badge' | transloco }}
            </span>
            @if (mode() === 'overview' || step() >= 1) {
              <div [class.beat-enter]="animated() && step() === 1">
                <h3 class="font-display text-2xl text-ink">Ola Kowalska</h3>
                <p class="text-xs text-slate2">
                  {{ 'landing.dashboard_preview.cards.influencer.type' | transloco }}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-beige bg-cream/60 p-3 text-center">
                  <p class="font-display text-2xl text-ink" data-testid="dashboard-followers">
                    {{ fmt(followers()) }}
                  </p>
                  <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                    {{ 'landing.dashboard_preview.cards.influencer.stats.followers' | transloco }}
                  </p>
                </div>
                <div class="rounded-xl border border-beige bg-cream/60 p-3 text-center">
                  <p class="font-display text-2xl text-ink">
                    4.8
                    <span class="text-coral-500">★</span>
                  </p>
                  <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                    {{ 'landing.dashboard_preview.cards.influencer.stats.rating' | transloco }}
                  </p>
                </div>
              </div>

              <!-- her side of the same beat; mounted once, same as his -->
              <div
                class="flex flex-col gap-3"
                [attr.data-testid]="'dashboard-influencer-' + beatKey()"
              >
                <span [class]="chipClass(influencerTone())">
                  @if (beatKey() === 'review_selection') {
                    <mat-icon class="!h-3.5 !w-3.5 !text-sm" [class.stamp-in]="animated()">
                      check
                    </mat-icon>
                  }
                  {{
                    'landing.dashboard_preview.beats.' + beatKey() + '.influencer.status'
                      | transloco
                  }}
                </span>

                @switch (beatKey()) {
                  @case ('agreement_planning') {
                    <div
                      class="rounded-xl border border-beige bg-cream/60 p-3"
                      [class.beat-enter]="animated()"
                    >
                      <p class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                        {{ 'landing.dashboard_preview.beats.labels.terms.title' | transloco }}
                      </p>
                      <ul class="mt-1.5 flex flex-col gap-1">
                        @for (
                          term of $any(
                            'landing.dashboard_preview.beats.labels.terms.items' | transloco
                          );
                          track term;
                          let i = $index
                        ) {
                          <li
                            class="flex items-center gap-1.5 text-xs text-slate2"
                            [class.beat-enter]="animated()"
                            [style.animation-delay]="i * 90 + 'ms'"
                          >
                            <mat-icon class="!h-3.5 !w-3.5 shrink-0 !text-sm text-success">
                              check
                            </mat-icon>
                            {{ term }}
                          </li>
                        }
                      </ul>
                    </div>
                  }
                  @case ('content_creation') {
                    <div
                      class="rounded-xl border border-beige bg-cream/60 p-3"
                      [class.beat-enter]="animated()"
                      data-testid="dashboard-influencer-production"
                    >
                      <div class="flex items-center gap-2">
                        <mat-icon class="!h-4 !w-4 shrink-0 !text-base text-coral-500">
                          photo_camera
                        </mat-icon>
                        <span class="text-xs text-slate2">
                          {{ 'landing.dashboard_preview.beats.labels.content' | transloco }}
                        </span>
                      </div>
                      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-beige">
                        <div class="fill-bar h-full rounded-full bg-coral-500"></div>
                      </div>
                    </div>
                  }
                  @case ('content_approval') {
                    <div
                      class="rounded-xl border border-beige bg-cream/60 p-3"
                      [class.beat-enter]="animated()"
                    >
                      <div class="h-14 rounded-lg bg-beige/70"></div>
                    </div>
                  }
                  @case ('publication_results') {
                    <dl
                      class="grid grid-cols-3 gap-2"
                      [class.beat-enter]="animated()"
                      data-testid="dashboard-influencer-metrics"
                    >
                      <div class="rounded-xl border border-beige bg-cream/60 p-2 text-center">
                        <dd class="font-display text-lg text-ink">{{ fmt(reach()) }}</dd>
                        <dt
                          class="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-slate2"
                        >
                          {{ 'landing.dashboard_preview.beats.labels.reach' | transloco }}
                        </dt>
                      </div>
                      <div class="rounded-xl border border-beige bg-cream/60 p-2 text-center">
                        <dd class="font-display text-lg text-ink">{{ fmt(likes()) }}</dd>
                        <dt
                          class="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-slate2"
                        >
                          {{ 'landing.dashboard_preview.beats.labels.likes' | transloco }}
                        </dt>
                      </div>
                      <div class="rounded-xl border border-beige bg-cream/60 p-2 text-center">
                        <dd class="font-display text-lg text-ink">{{ fmt(comments()) }}</dd>
                        <dt
                          class="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-slate2"
                        >
                          {{ 'landing.dashboard_preview.beats.labels.comments' | transloco }}
                        </dt>
                      </div>
                    </dl>
                  }
                }

                <p class="text-xs leading-relaxed text-slate2">
                  {{
                    'landing.dashboard_preview.beats.' + beatKey() + '.influencer.note' | transloco
                  }}
                </p>
              </div>
            } @else {
              <!-- Simulation step 0: no applicant yet. A pulsing skeleton here
                   read as a card that never loaded (owner, 2026-09-04); a
                   dashed drop zone with an inbox says "waiting" instead. -->
              <div class="flex flex-1 flex-col items-center justify-center gap-3">
                <div
                  aria-hidden="true"
                  class="flex h-28 w-full max-w-[14rem] items-center justify-center rounded-2xl border-2 border-dashed border-beige text-slate2"
                  data-testid="dashboard-preview-influencer-waiting"
                >
                  <mat-icon class="!h-9 !w-9 !text-4xl opacity-50">inbox</mat-icon>
                </div>
                <p role="status" class="text-center text-xs italic text-slate2">
                  {{ 'landing.dashboard_preview.waiting' | transloco }}
                </p>
              </div>
            }
          </article>
        </div>
      } @else {
        <!-- the finale — legacy success modal as an inline editorial panel -->
        <div
          class="mx-auto max-w-2xl rounded-3xl border border-beige bg-white p-8 text-center md:p-10"
          data-testid="dashboard-success"
        >
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-600"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
            {{ 'landing.dashboard_preview.success_modal.title' | transloco }}
          </span>
          <p class="mt-4 text-slate2">
            {{ 'landing.dashboard_preview.success_modal.description' | transloco }}
          </p>
          <dl class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dd class="font-display text-3xl text-ink">7</dd>
              <dt class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                {{ 'landing.dashboard_preview.success_modal.metrics.steps' | transloco }}
              </dt>
            </div>
            <div>
              <dd class="font-display text-3xl text-ink">100%</dd>
              <dt class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                {{ 'landing.dashboard_preview.success_modal.metrics.completion' | transloco }}
              </dt>
            </div>
            <div>
              <dd class="font-display text-3xl text-ink">12k</dd>
              <dt class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                {{ 'landing.dashboard_preview.success_modal.metrics.reach' | transloco }}
              </dt>
            </div>
            <div>
              <dd class="font-display text-3xl text-ink">
                4.2
                <span class="text-coral-500">★</span>
              </dd>
              <dt class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                {{ 'landing.dashboard_preview.success_modal.metrics.rating' | transloco }}
              </dt>
            </div>
          </dl>
          <p class="mt-7 text-sm text-slate2">
            {{ 'landing.dashboard_preview.success_modal.cta.description' | transloco }}
          </p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-3">
            <a routerLink="/auth/sign-up/business" class="cta-primary">
              {{ 'landing.dashboard_preview.success_modal.cta.button' | transloco }}
              <mat-icon class="!h-5 !w-5 !text-lg">arrow_forward</mat-icon>
            </a>
            <button
              type="button"
              (click)="restart()"
              class="inline-flex items-center gap-2 rounded-full border border-beige bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-all hover:border-coral-300 hover:text-coral-600"
              data-testid="dashboard-restart"
            >
              <mat-icon class="!h-4 !w-4 !text-base">replay</mat-icon>
              {{ 'landing.dashboard_preview.success_modal.actions.restart' | transloco }}
            </button>
          </div>
        </div>
      }
    </section>
  `,
  styles: `
    /* Each beat's tile enters; staggered children add their own delay. It
       starts part-visible on purpose — from zero it read as a blink. */
    .beat-enter {
      animation: beat-enter 200ms ease-out both;
    }

    @keyframes beat-enter {
      from {
        opacity: 0.25;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .bump {
      animation: bump 420ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
    }

    @keyframes bump {
      0% {
        transform: scale(0.7);
        opacity: 0;
      }
      60% {
        transform: scale(1.12);
        opacity: 1;
      }
      100% {
        transform: scale(1);
      }
    }

    .stamp-in {
      animation: stamp-in 340ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
    }

    @keyframes stamp-in {
      from {
        opacity: 0;
        transform: scale(1.25) rotate(-4deg);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    /* Both bars scale rather than animate their width: a transform is a
       compositor job, a width is a layout job on every frame. */
    .fill-bar,
    .beat-bar {
      width: 100%;
      transform-origin: left center;
    }

    /* The reel filling up while she produces it. */
    .fill-bar {
      animation: beat-fill 2200ms ease-in-out forwards;
    }

    /* Beat countdown; the element overrides the duration with its own beat's. */
    .beat-bar {
      animation: beat-fill 2600ms linear forwards;
    }

    @keyframes beat-fill {
      from {
        transform: scaleX(0);
      }
      to {
        transform: scaleX(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .beat-bar,
      .fill-bar {
        transform: scaleX(1);
        animation: none;
      }

      .beat-enter,
      .bump,
      .stamp-in {
        animation: none;
      }
    }
  `,
})
export class InteractiveDashboardPreviewComponent implements OnDestroy {
  /** The seven lifecycle beats, in play order (legacy collaborationSteps). */
  readonly stepKeys = [
    'campaign_created',
    'influencer_application',
    'review_selection',
    'agreement_planning',
    'content_creation',
    'content_approval',
    'publication_results',
  ] as const;

  /** The three applicants the brand compares at the selection beat. */
  readonly candidates = [
    { initials: 'OK', name: 'Ola Kowalska', chosen: true },
    { initials: 'MW', name: 'Marta Wójcik', chosen: false },
    { initials: 'PZ', name: 'Piotr Zieliński', chosen: false },
  ] as const;

  readonly mode = signal<'overview' | 'simulation'>('overview');
  readonly step = signal(0);
  readonly playing = signal(false);
  readonly done = signal(false);

  /** Numbers the cards show. Count-ups run only while the story plays, so a
   * paused card (and every screenshot fixture) reads the settled value. */
  readonly followers = signal(12000);
  readonly reach = signal(12000);
  readonly likes = signal(1240);
  readonly comments = signal(86);

  /** Which beat the cards render — overview shows the finished collaboration. */
  readonly beatKey = computed(() =>
    this.mode() === 'overview'
      ? this.stepKeys[this.stepKeys.length - 1]
      : this.stepKeys[this.step()],
  );
  /** Motion belongs to the running story, not to the static tableau. */
  readonly animated = computed(() => this.mode() === 'simulation');
  readonly applicationCount = computed(() =>
    this.mode() === 'overview' || this.step() >= 1 ? 1 : 0,
  );
  readonly brandTone = computed(() => TONES[this.beatKey()].brand);
  readonly influencerTone = computed(() => TONES[this.beatKey()].influencer);

  /** Jump straight to a beat with no timers — the sandbox fixtures' hook. */
  set previewBeat(index: number) {
    this.stopTimer();
    this.mode.set('simulation');
    this.step.set(Math.min(Math.max(index, 0), this.stepKeys.length - 1));
    this.playing.set(false);
    this.done.set(false);
  }

  /** How long each beat holds the stage. A beat that brings in three candidate
   * cards needs longer than one that flips a chip: a single tempo read as too
   * fast on the busy beats and too slow on the sparse ones (owner, 2026-09).
   * The countdown bar is bound to the same number. */
  private readonly beatHold: Readonly<Record<string, number>> = {
    campaign_created: 2400,
    influencer_application: 2800,
    review_selection: 3400,
    agreement_planning: 3000,
    content_creation: 2800,
    content_approval: 2400,
    publication_results: 3600,
  };

  /** The current beat's hold. */
  readonly beatMs = computed(() => this.beatHold[this.stepKeys[this.step()]] ?? 2600);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private frameId: number | null = null;

  constructor() {
    // A backgrounded tab keeps firing timers, so a visitor who switches
    // away and returns finds the run already over. Pause on hide, resume on
    // show — `playing()` stays true, only the timer stops.
    if (this.isBrowser) {
      this.doc.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /** 12000 → "12 000". Locale-independent so baselines stay byte-stable. */
  fmt(value: number): string {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }

  /** Chip styling per tone — the beat's temperature at a glance. */
  chipClass(tone: Tone): string {
    const base =
      'inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] transition-colors duration-300';
    switch (tone) {
      case 'done':
        return `${base} bg-success-soft text-success-strong`;
      case 'pending':
        return `${base} bg-warning-soft text-warning-strong`;
      case 'alert':
        return `${base} bg-coral-50 text-coral-700`;
      default:
        return `${base} bg-navy-50 text-navy-500`;
    }
  }

  /** In overview every step shows settled; simulation reveals progressively. */
  stepState(index: number): 'done' | 'current' | 'todo' {
    if (this.mode() === 'overview') {
      return 'done';
    }
    const current = this.step();
    return index < current ? 'done' : index === current ? 'current' : 'todo';
  }

  setMode(mode: 'overview' | 'simulation'): void {
    this.mode.set(mode);
    this.reset();
    // Opening the presentation starts it. Owner, 2026-09-04: a visitor had to
    // click through the beats to see anything move.
    if (mode === 'simulation') {
      this.play();
    }
  }

  togglePlay(): void {
    if (this.playing()) {
      this.stopTimer();
      this.playing.set(false);
      return;
    }
    this.play();
  }

  advance(): void {
    if (this.step() >= this.stepKeys.length - 1) {
      this.stopTimer();
      this.playing.set(false);
      this.done.set(true);
      return;
    }
    this.step.update((s) => s + 1);
    this.onBeatEnter();
  }

  /** "Spróbuj ponownie" / the reset icon: back to the first beat, playing —
   * a presentation that restarts into a still frame reads as broken. */
  restart(): void {
    this.reset();
    this.play();
  }

  reset(): void {
    this.stopTimer();
    this.stopCountUp();
    this.playing.set(false);
    this.step.set(0);
    this.done.set(false);
    this.followers.set(12000);
    this.reach.set(12000);
    this.likes.set(1240);
    this.comments.set(86);
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.stopCountUp();
    if (this.isBrowser) {
      this.doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private play(): void {
    this.playing.set(true);
    this.startTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    // Click-started only — the prerendered route never runs this during SSR.
    // A timeout that reschedules itself, not an interval: every beat has its
    // own hold, so the tempo follows the story instead of a metronome.
    this.timerId = setTimeout(() => {
      this.advance();
      if (this.playing()) this.startTimer();
    }, this.beatMs());
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (this.doc.hidden) {
      this.stopTimer();
    } else if (this.playing()) {
      this.startTimer();
    }
  };

  /** Numbers that land on a beat count themselves up as it opens. */
  private onBeatEnter(): void {
    const beat = this.beatKey();
    if (beat === 'influencer_application') {
      this.countUp([[this.followers, 12000]]);
    } else if (beat === 'publication_results') {
      this.countUp([
        [this.reach, 12000],
        [this.likes, 1240],
        [this.comments, 86],
      ]);
    }
  }

  private countUp(pairs: readonly (readonly [WritableSignal<number>, number])[]): void {
    // Paused cards, the server render and reduced-motion visitors get the
    // settled number; only a running story counts.
    if (!this.isBrowser || !this.playing() || this.reducedMotion()) {
      for (const [target, to] of pairs) target.set(to);
      return;
    }
    this.stopCountUp();
    const started = performance.now();
    const duration = 800;
    for (const [target] of pairs) target.set(0);
    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      for (const [target, to] of pairs) target.set(Math.round(to * eased));
      this.frameId = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private stopCountUp(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private reducedMotion(): boolean {
    try {
      return this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
      return false;
    }
  }
}
