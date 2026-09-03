import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * "Zero attack windows" immutability deep-dive. Verified against the real deploy
 * chain (checkitout-backend/deployment/docs/COMPLETE_IMMUTABILITY_CHAIN.md +
 * IMMUTABILITY_FLOW_DIAGRAM.md): every CI/CD artefact is locked with `chattr +i`
 * within ~1s of upload, collapsing the legacy 10-minute tamper window to under a
 * second; a 4-check gate (immutability/metadata/timestamp/checksum) precedes exec;
 * copy_with_immutability() does atomic unlock→copy→relock; sudoers grants the CI
 * identity exactly one root verb (/usr/bin/chattr). Honesty register: the CI
 * identity is branded `instagram-scripts-admin` (legacy name). Architecture +
 * real snippets + timeline viz — the demo fires no deploy.
 *
 * Ported from the legacy demo build into the greenfield editorial system:
 * shared <app-survey-card> + <app-code-panel>; flat semantic bars;
 * emerald/amber carry lock-state meaning only, coral is the interaction accent.
 */
@Component({
  selector: 'app-immutability-chain-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="INFRA"
      [title]="'landing.survey.immutability.title' | transloco"
      [subtitle]="'landing.survey.immutability.subtitle' | transloco"
    >
      <!-- the headline: tamper-window collapse -->
      <div class="mt-6 rounded-xl border border-beige bg-cream p-5">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.immutability.windowLabel' | transloco }}
        </p>
        <div class="mt-3 space-y-3">
          <!-- legacy window -->
          <div>
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-mono text-rose-600">
                {{ 'landing.survey.immutability.oldWindowMeta' | transloco }}
              </span>
              <span class="font-bold text-rose-600 tabular-nums">
                {{ 'landing.survey.immutability.oldWindow' | transloco }}
              </span>
            </div>
            <div class="h-3 w-full overflow-hidden rounded-full bg-rose-100">
              <div class="bar-old h-full rounded-full bg-rose-400"></div>
            </div>
          </div>
          <!-- new window -->
          <div>
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-mono text-emerald-600">
                {{ 'landing.survey.immutability.newWindowMeta' | transloco }}
              </span>
              <span class="font-bold text-emerald-600 tabular-nums">
                {{ 'landing.survey.immutability.newWindow' | transloco }}
              </span>
            </div>
            <div class="h-3 w-full overflow-hidden rounded-full bg-emerald-100">
              <div class="bar-new h-full rounded-full bg-emerald-400"></div>
            </div>
          </div>
        </div>
        <p class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <mat-icon class="!h-4 !w-4 !text-base text-emerald-500">trending_down</mat-icon>
          {{ 'landing.survey.immutability.collapse' | transloco }}
        </p>
      </div>

      <!-- protection timeline -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.immutability.timelineLabel' | transloco }}
      </p>
      <div class="mt-3 overflow-x-auto">
        <div class="flex min-w-[640px] items-stretch gap-0">
          @for (s of steps; track s.key; let i = $index, last = $last) {
            <div class="relative flex flex-1 flex-col items-center px-1 text-center">
              <!-- connector line -->
              @if (!last) {
                <div class="absolute left-1/2 top-4 h-0.5 w-full" [class]="lineClass(s)"></div>
              }
              <!-- dot -->
              <div
                class="timeline-dot relative z-10 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white"
                [class]="dotClass(s)"
                [style.animation-delay.ms]="i * 260"
              >
                <mat-icon class="!h-4 !w-4 !text-base text-white">{{ s.icon }}</mat-icon>
              </div>
              <div class="mt-2 font-mono text-[11px] font-semibold text-ink tabular-nums">
                {{ s.t }}
              </div>
              <div class="text-[10px] leading-tight text-slate2">
                {{ 'landing.survey.immutability.steps.' + s.key | transloco }}
              </div>
            </div>
          }
        </div>
      </div>
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate2">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
          {{ 'landing.survey.immutability.legendLocked' | transloco }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-amber-400"></span>
          {{ 'landing.survey.immutability.legendOpen' | transloco }}
        </span>
      </div>

      <!-- try it: attack the sealed release (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.immutability.tamper.label' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (tamperDone) {
            <span
              class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">shield</mat-icon>
              {{ 'landing.survey.immutability.tamper.done' | transloco }}
            </span>
          }
          <button type="button" (click)="attack()" [class]="tamperDone ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ tamperDone ? 'replay' : 'bolt' }}</mat-icon>
            {{
              (tamperDone
                ? 'landing.survey.immutability.tamper.replay'
                : 'landing.survey.immutability.tamper.cta'
              ) | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-2 space-y-2">
        @for (a of attacks; track a.key; let i = $index) {
          <div
            class="flex items-center gap-3 rounded-xl border p-3 transition-all duration-300"
            [class]="
              attackLit(i) ? 'border-emerald-200 bg-white shadow-sm' : 'border-beige bg-cream'
            "
            [class.tamper-current]="attackCurrent(i)"
          >
            <code
              class="min-w-0 flex-1 truncate font-mono text-[11px]"
              [class]="attackLit(i) ? 'text-rose-600' : 'text-slate2'"
            >
              $ {{ a.cmd }}
            </code>
            @if (attackLit(i)) {
              <span
                class="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
              >
                <mat-icon class="!h-3.5 !w-3.5 !text-sm">block</mat-icon>
                {{ 'landing.survey.immutability.tamper.steps.' + a.key | transloco }}
              </span>
            }
          </div>
        }
      </div>

      <!-- 4-check validation gate -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.immutability.checksLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (c of checks; track c) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1 text-xs font-medium text-ink"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-emerald-500">check</mat-icon>
            {{ 'landing.survey.immutability.checks.' + c | transloco }}
          </span>
        }
      </div>

      <!-- attack vectors eliminated -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.immutability.matrixLabel' | transloco }}
      </p>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        @for (v of vectors; track v.key) {
          <div
            class="flex items-center justify-between gap-3 rounded-xl border border-beige bg-cream p-3"
          >
            <div class="min-w-0">
              <div class="truncate font-mono text-xs font-semibold text-ink">{{ v.comp }}</div>
              <div class="text-[11px] leading-tight text-slate2">
                {{ 'landing.survey.immutability.vectors.' + v.key | transloco }}
              </div>
            </div>
            <span
              class="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">shield</mat-icon>
              {{ 'landing.survey.immutability.eliminated' | transloco }}
            </span>
          </div>
        }
      </div>

      <!-- real snippet -->
      <div class="mt-6">
        <app-code-panel file="deploy-and-secure-v6.sh + sudoers">{{ snippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.immutability.codeCaption' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .bar-old {
        width: 100%;
        animation: growOld 1.4s ease-out forwards;
      }
      .bar-new {
        width: 4%;
        animation: growNew 1.4s ease-out 0.3s forwards;
        transform-origin: left;
      }
      @keyframes growOld {
        from {
          width: 0;
        }
        to {
          width: 100%;
        }
      }
      @keyframes growNew {
        from {
          width: 0;
        }
        to {
          width: 4%;
        }
      }
      .timeline-dot {
        animation: dotPop 0.5s ease-out both;
      }
      .tamper-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.2);
      }
      @keyframes dotPop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        70% {
          transform: scale(1.12);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .bar-old {
          animation: none;
          width: 100%;
        }
        .bar-new {
          animation: none;
          width: 4%;
        }
        .timeline-dot {
          animation: none;
        }
      }
    `,
  ],
})
export class ImmutabilityChainShowcaseComponent {
  // Lock-state through the chain (COMPLETE_IMMUTABILITY_CHAIN.md timeline).
  readonly steps = [
    { t: 'T+0', key: 'upload', state: 'open', icon: 'upload' },
    { t: 'T+1s', key: 'lock', state: 'locked', icon: 'lock' },
    { t: 'T+6s', key: 'validate', state: 'locked', icon: 'check_circle' },
    { t: 'T+8s', key: 'execute', state: 'open', icon: 'lock_open' },
    { t: 'T+30s', key: 'relock', state: 'locked', icon: 'lock' },
    { t: 'T+31s', key: 'cleanup', state: 'gone', icon: 'delete_forever' },
  ];

  readonly checks = ['immutability', 'metadata', 'timestamp', 'checksum'];

  // "Attempt tamper" — three real attack classes, each refused by the chain.
  // Synchronous stepper (no timers); the command turns rose, the kernel's
  // refusal lands as the emerald badge.
  readonly attacks = [
    { key: 'write', cmd: 'echo evil >> deploy-and-secure.sh' },
    { key: 'delete', cmd: 'rm -f backup-2026-06-11.tar.gz' },
    { key: 'replay', cmd: './validate-and-exec old-once-valid.sh' },
  ];
  tamperStep = 0;
  get tamperDone(): boolean {
    return this.tamperStep >= this.attacks.length;
  }
  attack(): void {
    this.tamperStep = this.tamperDone ? 0 : this.tamperStep + 1;
  }
  attackLit(i: number): boolean {
    return i < this.tamperStep;
  }
  attackCurrent(i: number): boolean {
    return i === this.tamperStep - 1;
  }

  // The Protection Matrix — every attack vector the chain eliminates.
  readonly vectors = [
    { comp: 'CI/CD scripts', key: 'scripts' },
    { comp: 'secure-logger.sh', key: 'logger' },
    { comp: '.env', key: 'env' },
    { comp: 'deployment files', key: 'deploy' },
    { comp: '*.metadata', key: 'metadata' },
    { comp: 'old scripts', key: 'replay' },
  ];

  // House button idiom (marketing-toolbar CTA) — flat attack CTA, stroked replay.
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly snippet = `# deploy-and-secure-v6.sh — atomic lock / unlock / copy (no race window)
copy_with_immutability() {
    chattr -i "$src"          # 1. unlock source
    cp     "$src" "$dst"      # 2. copy
    chattr +i "$src"          # 3. re-lock source
    chattr +i "$dst"          # 4. lock destination
}

# sudoers — chattr is the ONLY root verb this CI identity may run, no password
instagram-scripts-admin ALL=(root) NOPASSWD: /usr/bin/chattr`;

  dotClass(s: { state: string }): string {
    return s.state === 'locked'
      ? 'bg-emerald-500'
      : s.state === 'open'
        ? 'bg-amber-400'
        : 'bg-slate-300';
  }

  lineClass(s: { state: string }): string {
    return s.state === 'locked'
      ? 'bg-emerald-200'
      : s.state === 'open'
        ? 'bg-amber-200'
        : 'bg-slate-200';
  }
}
