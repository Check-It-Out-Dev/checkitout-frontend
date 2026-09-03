import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SandboxDirectorService } from '../../core/demo/sandbox-director.service';
import { isDemoMode } from '../../core/demo/demo-mode';
import { PhoneTotpSimComponent } from './sims/phone-totp-sim.component';
import { InboxSimComponent } from './sims/inbox-sim.component';
import { FakturowniaSimComponent } from './sims/fakturownia-sim.component';
import { KsefSimComponent } from './sims/ksef-sim.component';

/**
 * Demo guide — the instructor overlay for guided scenarios (ported from the
 * legacy demo build into the greenfield editorial system).
 *
 * Two modes: while a scenario runs it narrates the current step ("now click
 * Create campaign", step x/y) and offers Next on manual steps; once the
 * scenario is done it flips to the recap — the "what you just saw" facts, a
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
                @if (director.step(); as st) {
                  <p class="mt-3 text-sm leading-relaxed text-cream/95">
                    {{ 'demo.sandboxes.' + d.key + '.steps.' + st.id | transloco }}
                  </p>
                  <!-- interim honesty line: while steps advance manually, say so —
                       imperative narration reads as "what happens at this beat",
                       not a promise the sandbox already enforces the action.
                       Drops out with the event-hooks slice. -->
                  @if (st.advanceOn === 'manual') {
                    <p
                      class="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cream/40"
                    >
                      {{ 'demo.guide.sandboxHint' | transloco }}
                    </p>
                  }
                  <div class="mt-3.5 flex items-center gap-2">
                    @if (st.advanceOn === 'manual') {
                      <button
                        type="button"
                        (click)="director.advance()"
                        class="inline-flex items-center gap-1.5 rounded-lg bg-coral-700 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-coral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                      >
                        {{ 'demo.guide.next' | transloco }}
                        <mat-icon class="!h-4 !w-4 !text-base">arrow_forward</mat-icon>
                      </button>
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
                        class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-cream/50 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                      >
                        <mat-icon class="!h-4 !w-4 !text-base">replay</mat-icon>
                      </button>
                      <button
                        type="button"
                        (click)="director.exit()"
                        [attr.aria-label]="'demo.guide.exit' | transloco"
                        [title]="'demo.guide.exit' | transloco"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-cream/50 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
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
  changeDetection: ChangeDetectionStrategy.Eager,
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

  readonly demoMode = isDemoMode();

  /** The recap's three "what you just saw" fact keys. */
  readonly recapFacts = ['f1', 'f2', 'f3'] as const;

  /** Same fill math as legacy: event steps count as in-flight, manual as pending. */
  readonly progressPct = computed(() => {
    const d = this.director.scenario();
    const s = this.director.state();
    if (!d || !s || !d.steps.length) {
      return 0;
    }
    const manual = d.steps[s.step]?.advanceOn === 'manual';
    return Math.min(((s.step + (manual ? 0 : 1)) / d.steps.length) * 100, 100);
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
