import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

/**
 * Interactive dashboard preview — the landing's "watch a collaboration
 * happen" widget (ported from the legacy feature/demo build). Two modes:
 *
 *   • overview   — the static tableau: all seven lifecycle steps visible at
 *     once next to the brand and influencer cards. No timers.
 *   • simulation — the guided run: steps advance one by one (autoplay or
 *     manual), the influencer card joins at the application step, and the
 *     finale swaps the stage for the success panel (7 steps / 100% / 12k
 *     reach / 4.2★ — the legacy's fictional campaign result).
 *
 * The autoplay interval starts ONLY from click handlers, so the prerendered
 * route never runs a timer during SSR; ngOnDestroy and every mode/reset
 * transition clear it. Legacy's contact-modal CTA becomes a sign-up link —
 * the greenfield landing has no contact modal by design.
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
          </article>

          <!-- progress card — the seven-step state machine -->
          <article class="flex flex-col rounded-2xl border border-beige bg-white p-6">
            <h3 class="font-display text-xl text-ink">
              {{ 'landing.dashboard_preview.cards.progress.title' | transloco }}
            </h3>
            <ol class="mt-4 flex flex-grow flex-col gap-2.5" data-testid="dashboard-progress-steps">
              @for (
                s of $any('landing.dashboard_preview.cards.progress.steps' | transloco);
                track $index
              ) {
                <li class="flex items-start gap-2.5">
                  @if (stepState($index) === 'done') {
                    <mat-icon class="!h-4 !w-4 shrink-0 !text-base text-emerald-500">
                      check_circle
                    </mat-icon>
                  } @else if (stepState($index) === 'current') {
                    <span class="relative mt-0.5 flex h-3.5 w-3.5 shrink-0" aria-hidden="true">
                      <span
                        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-400 opacity-60"
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
                      [class]="stepState($index) === 'todo' ? 'text-slate2/60' : 'text-ink'"
                    >
                      {{ s.title }}
                    </p>
                    @if (mode() === 'overview' || stepState($index) !== 'todo') {
                      <p class="text-xs leading-relaxed text-slate2">{{ s.description }}</p>
                    }
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
                  (click)="reset()"
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
              <div>
                <h3 class="font-display text-2xl text-ink">Ola Kowalska</h3>
                <p class="text-xs text-slate2">
                  {{ 'landing.dashboard_preview.cards.influencer.type' | transloco }}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-beige bg-cream/60 p-3 text-center">
                  <p class="font-display text-2xl text-ink">12 000</p>
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
            } @else {
              <p class="my-auto text-center text-sm italic text-slate2">
                {{ 'landing.dashboard_preview.waiting' | transloco }}
              </p>
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
              (click)="reset()"
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
  `
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

  readonly mode = signal<'overview' | 'simulation'>('overview');
  readonly step = signal(0);
  readonly playing = signal(false);
  readonly done = signal(false);

  /** In overview every step shows settled; simulation reveals progressively. */
  stepState(index: number): 'done' | 'current' | 'todo' {
    if (this.mode() === 'overview') {
      return 'done';
    }
    const current = this.step();
    return index < current ? 'done' : index === current ? 'current' : 'todo';
  }

  private intervalId: ReturnType<typeof setInterval> | null = null;

  setMode(mode: 'overview' | 'simulation'): void {
    this.mode.set(mode);
    this.reset();
  }

  togglePlay(): void {
    if (this.playing()) {
      this.stopTimer();
      this.playing.set(false);
      return;
    }
    this.playing.set(true);
    // Click-started only — the prerendered route never runs this during SSR.
    this.intervalId = setInterval(() => this.advance(), 2800);
  }

  advance(): void {
    if (this.step() >= this.stepKeys.length - 1) {
      this.stopTimer();
      this.playing.set(false);
      this.done.set(true);
      return;
    }
    this.step.update((s) => s + 1);
  }

  reset(): void {
    this.stopTimer();
    this.playing.set(false);
    this.step.set(0);
    this.done.set(false);
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
