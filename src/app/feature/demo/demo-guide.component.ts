import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SandboxDirectorService } from '../../core/demo/sandbox-director.service';
import { isDemoMode } from '../../core/demo/demo-mode';
import { hintKeyFor } from '../../core/demo/guide-hint';
import { PhoneTotpSimComponent } from './sims/phone-totp-sim.component';
import { InboxSimComponent } from './sims/inbox-sim.component';
import { FakturowniaSimComponent } from './sims/fakturownia-sim.component';
import { KsefSimComponent } from './sims/ksef-sim.component';
import { GuideSpotlightComponent } from './guide-spotlight.component';

/**
 * Demo guide — the instructor overlay for guided scenarios (ported from the
 * legacy demo build into the greenfield editorial system).
 *
 * Two modes: while a scenario runs it narrates the step the visitor is on
 * (step x/y) — the "next" control itself lives on the spotlight pill around
 * the real control (see GuideSpotlightComponent); only a step with nothing to
 * point at (a "look at this screen" beat) keeps a Next button in the panel.
 * Once the scenario is done it flips to the recap — the "what you just saw" facts, a
 * cross-link into the matching technical-survey card, the next scenario and
 * a restart. The panel is navy-900 + cream on purpose: the guide is the
 * demo's control terminal, the one dark surface the cream canvas makes room
 * for — visually outside the app it narrates. Renders nothing outside the
 * demo build (isDemoMode()).
 */
@Component({
  selector: 'app-demo-guide',
  imports: [
    MatIconModule,
    TranslocoPipe,
    PhoneTotpSimComponent,
    InboxSimComponent,
    FakturowniaSimComponent,
    KsefSimComponent,
    GuideSpotlightComponent,
  ],
  template: `
    @if (demoMode) {
      <!-- world simulators: live exactly as long as their step -->
      @switch (director.step()?.sim) {
        @case ('totp') {
          <app-phone-totp-sim />
        }
        @case ('inbox-verify') {
          <app-inbox-sim variant="verify" />
        }
        @case ('inbox-code') {
          <app-inbox-sim variant="code" />
        }
        @case ('fakturownia') {
          <app-fakturownia-sim />
        }
        @case ('ksef') {
          <app-ksef-sim />
        }
      }

      <!-- the ring around the step's control, and the pill on it that runs
           the step in the app — the tour's only "next" -->
      <app-guide-spotlight
        [target]="target()"
        [busy]="director.performing()"
        [settling]="director.awaiting()"
        [acts]="acts()"
        (act)="director.next()"
        (found)="onScreen.set($event)"
        (drawing)="pillUp.set($event)"
      />

      @if (director.scenario(); as d) {
        @if (director.state(); as s) {
          <div
            class="guide-pop fixed bottom-4 right-4 z-[99990] w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-navy-900 text-cream shadow-2xl ring-1 ring-white/10"
          >
            <!-- running: narrate the current step -->
            @if (!s.done) {
              <div class="p-4">
                <div class="flex items-center gap-2">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full bg-coral-500/15 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-coral-400"
                  >
                    <mat-icon class="!h-3.5 !w-3.5 !text-sm">{{ d.icon }}</mat-icon>
                    {{ 'demo.guide.badge' | transloco }}
                  </span>
                  <span class="truncate text-[11px] font-semibold text-cream/70">
                    {{ 'demo.sandboxes.' + d.key + '.title' | transloco }}
                  </span>
                  <span class="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-cream/50">
                    {{ s.step + 1 }}/{{ d.steps.length }}
                  </span>
                </div>
                <!-- step progress -->
                <div class="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full bg-coral-400 transition-all duration-500"
                    [style.width.%]="progressPct()"
                  ></div>
                </div>
                <!-- The guidance itself. The region is mounted with the panel
                     and never replaced — a live region that arrives together
                     with its first text is not registered by some screen
                     readers, and one that is destroyed per step announces
                     nothing at all (W3C ARIA practices). -->
                <div role="status" data-testid="guide-narration">
                  @if (director.step(); as st) {
                    <p class="mt-3 text-sm leading-relaxed text-cream/95">
                      {{ 'demo.sandboxes.' + d.key + '.steps.' + st.id | transloco }}
                    </p>
                  }
                </div>
                @if (director.step(); as st) {
                  <!-- the pill on the ring is what runs the step; the panel
                       only says where it is -->
                  @if (st.advanceOn === 'manual') {
                    <p
                      class="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cream/40"
                    >
                      {{ hintKey() | transloco }}
                    </p>
                  }
                  <!-- the application did not do what this step describes -->
                  @if (director.stalled() === st.id) {
                    <p
                      role="status"
                      class="mt-1.5 text-[11px] font-medium text-coral-300"
                      data-testid="guide-retry"
                    >
                      {{ 'demo.guide.retry' | transloco }}
                    </p>
                  }
                  <div class="mt-3.5 flex items-center gap-2">
                    @if (director.performing()) {
                      <span
                        class="inline-flex items-center gap-1.5 text-[11px] font-medium text-coral-300"
                        data-testid="guide-performing"
                      >
                        <span
                          class="guide-pulse h-1.5 w-1.5 rounded-full bg-coral-400"
                          aria-hidden="true"
                        ></span>
                        {{ 'demo.guide.performing' | transloco }}
                      </span>
                    } @else if (st.advanceOn === 'manual' && !pointing()) {
                      <!-- nothing to point at: a "look at this screen" beat -->
                      <button
                        type="button"
                        (click)="director.next()"
                        data-testid="guide-next"
                        class="inline-flex items-center gap-1.5 rounded-lg bg-coral-700 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-coral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                      >
                        {{ 'demo.guide.next' | transloco }}
                        <mat-icon class="!h-4 !w-4 !text-base">arrow_forward</mat-icon>
                      </button>
                    } @else if (st.advanceOn === 'manual') {
                      <span
                        class="inline-flex items-center gap-1.5 text-[11px] font-medium text-coral-300"
                        data-testid="guide-pointer"
                      >
                        <mat-icon class="!h-4 !w-4 !text-base">arrow_forward</mat-icon>
                        {{ 'demo.guide.clickHere' | transloco }}
                      </span>
                    } @else {
                      <span
                        class="inline-flex items-center gap-1.5 text-[11px] font-medium text-coral-300"
                      >
                        <span
                          class="guide-pulse h-1.5 w-1.5 rounded-full bg-coral-400"
                          aria-hidden="true"
                        ></span>
                        {{ 'demo.guide.waiting' | transloco }}
                      </span>
                    }
                    <span class="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        (click)="director.reset()"
                        [attr.aria-label]="'demo.guide.reset' | transloco"
                        [title]="'demo.guide.reset' | transloco"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-transparent text-cream/60 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                      >
                        <mat-icon class="!h-4 !w-4 !text-base">replay</mat-icon>
                      </button>
                      <button
                        type="button"
                        (click)="director.exit()"
                        [attr.aria-label]="'demo.guide.exit' | transloco"
                        [title]="'demo.guide.exit' | transloco"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-transparent text-cream/60 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                      >
                        <mat-icon class="!h-4 !w-4 !text-base">close</mat-icon>
                      </button>
                    </span>
                  </div>
                }
              </div>
            } @else {
              <!-- done: the recap -->
              <div class="p-4">
                <div class="flex items-center gap-2">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300"
                  >
                    <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
                    {{ 'demo.guide.recapBadge' | transloco }}
                  </span>
                  <span class="truncate text-[11px] font-semibold text-cream/70">
                    {{ 'demo.sandboxes.' + d.key + '.title' | transloco }}
                  </span>
                </div>
                <div class="mt-3 space-y-2">
                  @for (f of recapFacts; track f) {
                    <div class="flex items-start gap-2 text-[13px] leading-snug text-cream/90">
                      <mat-icon class="mt-0.5 !h-4 !w-4 shrink-0 !text-base text-emerald-400">
                        check
                      </mat-icon>
                      <span>{{ 'demo.sandboxes.' + d.key + '.recap.' + f | transloco }}</span>
                    </div>
                  }
                </div>
                <div class="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    (click)="startNext()"
                    class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-coral-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-coral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                  >
                    {{ 'demo.guide.nextSandbox' | transloco }}
                    <mat-icon class="!h-4 !w-4 !text-base">arrow_forward</mat-icon>
                  </button>
                  <button
                    type="button"
                    (click)="openSurvey()"
                    class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-cream transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                  >
                    {{ 'demo.guide.openSurvey' | transloco }}
                    <mat-icon class="!h-4 !w-4 !text-base">menu_book</mat-icon>
                  </button>
                </div>
                <div class="mt-2 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    (click)="director.reset()"
                    class="inline-flex items-center gap-1 rounded text-cream/50 transition-colors hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                  >
                    <mat-icon class="!h-3.5 !w-3.5 !text-sm">replay</mat-icon>
                    {{ 'demo.guide.reset' | transloco }}
                  </button>
                  <button
                    type="button"
                    (click)="director.exit()"
                    class="inline-flex items-center gap-1 rounded text-cream/50 transition-colors hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                  >
                    <mat-icon class="!h-3.5 !w-3.5 !text-sm">arrow_back</mat-icon>
                    {{ 'demo.guide.backToHub' | transloco }}
                  </button>
                </div>
              </div>
            }
          </div>
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .guide-pop {
        animation: guidePop 0.35s ease-out both;
      }
      @keyframes guidePop {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .guide-pulse {
        animation: guidePulse 1.6s ease-in-out infinite;
      }
      @keyframes guidePulse {
        0%,
        100% {
          opacity: 0.5;
        }
        50% {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .guide-pop,
        .guide-pulse {
          animation: none;
        }
      }
    `,
  ],
})
export class DemoGuideComponent {
  readonly director = inject(SandboxDirectorService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /** Control the current step waits for — the spotlight follows it. */
  readonly target = computed(() => this.director.step()?.target);

  /** Whether the spotlight has that control on screen right now. A new step
   * starts optimistic: the ring usually needs a frame or two to find its
   * control, and a Next button that appears in the panel and vanishes again
   * when the ring arrives is its own kind of jitter — it was measured
   * flashing for 330 ms after the checkout reload. The spotlight says so
   * only once the control has really failed to turn up. */
  readonly onScreen = signal(true);
  /** Whether the ring is drawing its pill this instant — no grace. */
  readonly pillUp = signal(false);

  /**
   * Whether pressing this step's control does anything in the application.
   *
   * A beat with a ring and no recipe is a reading beat: the ring is around the
   * thing to look at, and pressing only moves the tour on. Two reviewers, on two
   * tours, objected that such a beat still told the visitor "kliknij podświetlony
   * element — wykona ten krok w aplikacji" over a highlight sitting on a posted
   * reply and on a receipt. Neither claim held; the work had already happened.
   */
  readonly acts = computed(() => !!this.director.step()?.perform?.length);

  /**
   * What the footer tells the visitor to do: act, type, read, or just look on.
   * The rule itself is in `core/demo/guide-hint.ts`, so that it can be asserted
   * against every step of every scenario rather than against the beats that
   * happened to be filmed — E-PROMISE in the class register.
   */
  readonly hintKey = computed(() => hintKeyFor(this.director.step(), this.pointing()));

  /** True while the ring is carrying the tour: the panel then only narrates.
   * With nothing on screen to point at, the panel takes its Next back. */
  readonly pointing = computed(() => {
    if (!this.target() || !this.onScreen()) return false;
    // A step that has already failed once is being asked to be pressed again,
    // so there had better be something to press. The ring takes its pill off
    // the screen the instant its control goes, but goes on reporting the
    // control for up to two seconds — the grace that stops a Next flashing into
    // the panel between steps. Measured on the ksef beat with its simulator
    // button removed: from the moment the guide said "spróbuj ponownie" there
    // were 1.5 s with no pill, no Next, and a message asking for a press that
    // nothing on the page could take.
    const st = this.director.step();
    if (st && this.director.stalled() === st.id && !this.pillUp()) return false;
    return true;
  });

  constructor() {
    // Every new control gets the benefit of the doubt.
    effect(() => {
      this.target();
      untracked(() => this.onScreen.set(true));
    });
    // While a tour runs, the fixed guide (bottom-right) and the world
    // simulators (bottom-left) cover the page's last rows — paginators,
    // the sign-in page's account cards. A body class lets the layouts
    // reserve that strip (styles.scss `.demo-guide-active`).
    effect(() => {
      if (typeof document === 'undefined') return;
      document.body.classList.toggle('demo-guide-active', this.director.active());
    });
    // …and how wide that strip has to be is the panel's own height, not a
    // guess. It was a flat 18rem, which is 288 px; the recap panel measures 279
    // plus its 16 px offset, so it reached 7 px past the reservation and the
    // marketplace paginator underneath it came out cut at "Wiersze na stron" —
    // reported on four separate films, always on the closing screen the visitor
    // is being told to look at. A ResizeObserver keeps it honest as the panel
    // grows with its caption.
    afterNextRender(() => {
      const panel = this.host.nativeElement.querySelector('.guide-pop');
      const write = (h: number): void => {
        document.body.style.setProperty('--demo-guide-h', `${String(Math.round(h))}px`);
      };
      if (!panel || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) write(e.contentRect.height);
      });
      this.zone.runOutsideAngular(() => ro.observe(panel));
      write(panel.getBoundingClientRect().height);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  readonly demoMode = isDemoMode();

  /** The recap's three "what you just saw" fact keys. */
  readonly recapFacts = ['f1', 'f2', 'f3'] as const;

  /**
   * The bar and the numeral say the same thing.
   *
   * Legacy counted steps COMPLETED, and every step here is manual, so the fill
   * was always one behind its own caption: "6/6" over a bar at 83 per cent, and
   * on the first beat a bar at zero beside "1/6". Two reviewers measured the
   * fill across a whole film and both wrote it up — one noting that the bar is
   * the only thing that could have signalled "still going" during the longest
   * still stretch in the film, and does not. The numeral is what a person reads;
   * the bar now agrees with it.
   */
  readonly progressPct = computed(() => {
    const d = this.director.scenario();
    const s = this.director.state();
    if (!d || !s || !d.steps.length) {
      return 0;
    }
    return Math.min(((s.step + 1) / d.steps.length) * 100, 100);
  });

  startNext(): void {
    const d = this.director.scenario();
    if (!d) {
      return;
    }
    const all = this.director.all;
    const i = all.findIndex((s) => s.key === d.key);
    this.director.startNext(all[(i + 1) % all.length].key);
  }

  openSurvey(): void {
    const d = this.director.scenario();
    if (!d) {
      return;
    }
    this.director.exit();
    void this.router.navigate(['/technical-survey', d.surveyPath], {
      fragment: d.surveyFragment,
    });
  }
}
