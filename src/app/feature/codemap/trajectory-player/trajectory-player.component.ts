import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { RECORDED_RUNS, RecordedRun } from '../codemap-recordings';

/** How far a replay has progressed; each stage reveals one more block. */
type Stage = 'idle' | 'typing' | 'local-steps' | 'local-done' | 'consent' | 'api-steps' | 'done';

const TYPE_MS = 22; // per-character cadence while "typing" the question

/**
 * Interactive replay of REAL CodeMap sessions (see codemap-recordings.ts —
 * verbatim captures, never generated client-side). Pick a question chip and
 * the player re-enacts the trajectory: the question types itself, DSL steps
 * appear one by one, then the grounded answer; the "honest" run continues
 * through the consent card into the API-tier trace with its real token
 * receipt. The first run auto-plays once when the player scrolls into view.
 *
 * SSR + motion discipline: every timer and the IntersectionObserver are
 * browser-only (the SSR-hang lesson — recurring timers on the server freeze
 * route rendering); `prefers-reduced-motion` users get finished states
 * instantly, and the step-entry animation collapses to none.
 *
 * `preset` renders a finished run synchronously — used by the sandbox
 * fixtures so visual baselines are deterministic frames, not mid-animation.
 */
@Component({
  selector: 'app-trajectory-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  templateUrl: './trajectory-player.component.html',
  styles: `
    @keyframes cm-step-in {
      from {
        opacity: 0;
        transform: translateY(5px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .anim-step {
      animation: cm-step-in 0.28s ease-out both;
    }
    @media (prefers-reduced-motion: reduce) {
      .anim-step {
        animation: none;
      }
    }
  `,
})
export class TrajectoryPlayerComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private observer?: IntersectionObserver;

  /** Render this run's finished state synchronously (sandbox fixtures). */
  @Input() preset?: string;
  /** Auto-play the first capture on scroll-into-view (fixtures turn it off). */
  @Input() autoplay = true;

  readonly runs = RECORDED_RUNS;
  readonly active = signal<RecordedRun>(RECORDED_RUNS[0]);
  readonly stage = signal<Stage>('idle');
  /** The question as typed so far (grows during the 'typing' stage). */
  readonly typedQ = signal('');
  /** Count of local / api steps currently revealed. */
  readonly localShown = signal(0);
  readonly apiShown = signal(0);

  ngOnInit(): void {
    if (this.preset) {
      const run = this.runs.find((r) => r.id === this.preset) ?? this.runs[0];
      this.active.set(run);
      this.finish(run);
      return;
    }
    // Auto-play the first capture once, when a third of the player is visible.
    // Never under the sandbox harness — visual baselines must be timing-free
    // (the page-hero fixture caught autoplay typing mid-screenshot).
    if (
      this.autoplay &&
      isPlatformBrowser(this.platformId) &&
      !window.location.pathname.includes('__sandbox') &&
      typeof IntersectionObserver !== 'undefined' &&
      !this.reducedMotion()
    ) {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting) && this.stage() === 'idle') {
            this.observer?.disconnect();
            this.observer = undefined;
            this.play(this.runs[0]);
            this.cdr.markForCheck();
          }
        },
        { threshold: 0.35 },
      );
      this.observer.observe(this.host.nativeElement);
    }
  }

  play(run: RecordedRun): void {
    this.clearTimers();
    this.active.set(run);
    this.typedQ.set('');
    this.localShown.set(0);
    this.apiShown.set(0);

    if (!isPlatformBrowser(this.platformId) || this.reducedMotion()) {
      this.finish(run);
      return;
    }

    this.stage.set('typing');
    let at = 250;
    for (let i = 1; i <= run.question.length; i++) {
      const upto = i;
      this.at(at, () => this.typedQ.set(run.question.slice(0, upto)));
      at += TYPE_MS;
    }
    at += 350;
    this.at(at, () => this.stage.set('local-steps'));
    run.localSteps.forEach((_, i) => {
      at += i === 0 ? 500 : 680;
      this.at(at, () => this.localShown.set(i + 1));
    });
    at += 800;
    this.at(at, () => this.stage.set('local-done'));
    if (run.api) {
      at += 1400;
      this.at(at, () => this.stage.set('consent'));
      at += 1600;
      this.at(at, () => this.stage.set('api-steps'));
      run.api.steps.forEach((_, i) => {
        at += i === 0 ? 500 : 620;
        this.at(at, () => this.apiShown.set(i + 1));
      });
      at += 700;
      this.at(at, () => this.stage.set('done'));
    } else {
      at += 400;
      this.at(at, () => this.stage.set('done'));
    }
  }

  /** Jump straight to the fully revealed state (also the reduced-motion path). */
  skip(): void {
    this.clearTimers();
    this.finish(this.active());
  }

  /** Re-run the active capture from the beginning. */
  replay(): void {
    this.play(this.active());
  }

  private reducedMotion(): boolean {
    return (
      isPlatformBrowser(this.platformId) &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private finish(run: RecordedRun): void {
    this.typedQ.set(run.question);
    this.localShown.set(run.localSteps.length);
    this.apiShown.set(run.api?.steps.length ?? 0);
    this.stage.set('done');
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push(
      setTimeout(() => {
        fn();
        this.cdr.markForCheck();
      }, ms),
    );
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.observer?.disconnect();
  }
}
