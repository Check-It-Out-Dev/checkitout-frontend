import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';

/**
 * Beyond-zero-trust capstone: the whole defence-in-depth stack as one diagram,
 * a request travelling from the Cloudflare edge down to the immutable core,
 * verified at every hop. Each layer is grounded in verified config:
 *   • edge — Cloudflare DDoS/WAF/real-IP + post-quantum hybrid TLS AT THE EDGE
 *   • netfilter — default-DROP firewall (SYN-flood / port-scan throttle)
 *   • nginx — 6 $real_ip zones, bad-bot 403, coarse 429
 *   • Redis — distributed sliding-window rate-limit (application-prod.yml:
 *     storage redis, precision 20, circuit-breaker→memory, GDPR-anonymised
 *     keys 24h), Sentinel HA + fail-fast — the layer right after nginx
 *   • app — Firebase auth, session binding, GeoIP impossible-travel, step-up
 *   • admin — break-glass host access needs a hardware key (sk-ssh-ed25519,
 *     touch/verify-required); root is per-command sudoers, never a shell
 *   • core — artefacts locked chattr +i, sealed secrets
 * Honesty register: post-quantum key exchange is negotiated at the Cloudflare
 * edge (origin stays hardened TLS 1.3). Architecture + real config — the demo
 * fires nothing.
 *
 * Greenfield port (feature/demo → editorial system): shared <app-survey-card>;
 * the layer chips keep the legacy depth spectrum re-anchored on-palette
 * (sky → coral → amber → slate; indigo/primary accents became coral);
 * semantic amber lock markers stay. Reveal motion is reduced-motion-safe.
 * Interactive walk mechanics ported unchanged (synchronous stepper).
 */
@Component({
  selector: 'app-zero-trust-architecture-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent],
  template: `
    <app-survey-card
      tag="SECURITY"
      [title]="'landing.survey.zerotrust.title' | transloco"
      [subtitle]="'landing.survey.zerotrust.subtitle' | transloco"
    >
      <!-- principle chips -->
      <div class="mt-5 flex flex-wrap gap-2">
        @for (p of principles; track p) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-xs font-medium text-ink ring-1 ring-beige"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-coral-500">check_circle</mat-icon>
            {{ 'landing.survey.zerotrust.principles.' + p | transloco }}
          </span>
        }
      </div>

      <!-- the defence-in-depth stack (interactive — walk a request down the layers) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.zerotrust.flowLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.zerotrust.run.done' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'refresh' : 'play_arrow' }}</mat-icon>
            {{
              (done ? 'landing.survey.zerotrust.run.replay' : 'landing.survey.zerotrust.run.cta')
                | transloco
            }}
          </button>
        </div>
      </div>
      <div class="relative mt-3">
        <!-- vertical flow rail -->
        <div
          class="absolute bottom-4 left-[1.15rem] top-4 w-0.5 bg-gradient-to-b from-coral-400 to-beige"
        ></div>
        <div class="space-y-2.5">
          @for (l of layers; track l.key; let i = $index) {
            <div
              class="zt-row relative flex items-center gap-3 rounded-xl p-3 ring-1 transition-all duration-300"
              [class]="
                isLit(i)
                  ? 'bg-white ring-coral-100 shadow-sm'
                  : l.lock
                    ? 'bg-cream ring-beige'
                    : 'bg-white ring-beige/60'
              "
              [class.zt-current]="isCurrent(i)"
              [style.animation-delay.ms]="i * 130"
            >
              <!-- node + icon -->
              <div
                class="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-2 ring-white"
                [class]="l.chip"
              >
                <mat-icon class="!h-5 !w-5 !text-xl">{{ l.icon }}</mat-icon>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[10px] font-bold text-slate2">L{{ l.n }}</span>
                  <span class="text-sm font-semibold text-ink">
                    {{ 'landing.survey.zerotrust.layers.' + l.key + '.title' | transloco }}
                  </span>
                  @if (l.lock) {
                    <mat-icon class="!h-3.5 !w-3.5 !text-sm text-amber-500">lock</mat-icon>
                  }
                </div>
                <div class="text-xs leading-snug text-slate2">
                  {{ 'landing.survey.zerotrust.layers.' + l.key + '.detail' | transloco }}
                </div>
              </div>
              @if (isLit(i)) {
                <mat-icon class="!h-4 !w-4 !text-base shrink-0 text-emerald-500">
                  check_circle
                </mat-icon>
              }
              <span
                class="hidden shrink-0 rounded-md bg-cream px-2 py-1 font-mono text-[10px] text-slate2 ring-1 ring-beige sm:inline-flex"
              >
                {{ l.tag }}
              </span>
            </div>
          }
        </div>
      </div>

      <p class="mt-4 text-[11px] leading-relaxed text-slate2">
        {{ 'landing.survey.zerotrust.note' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .zt-row {
        animation: ztReveal 0.5s ease-out both;
      }
      .zt-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.2);
      }
      @keyframes ztReveal {
        from {
          opacity: 0;
          transform: translateX(-8px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .zt-row {
          animation: none;
        }
      }
    `,
  ],
})
export class ZeroTrustArchitectureShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly principles = ['network', 'hop', 'hardware', 'immutable'];

  // Interactive walk: each click carries the request one layer deeper; every
  // crossed layer shows its verification check. Synchronous — no timers/rAF.
  step = 0;
  get done(): boolean {
    return this.step >= this.layers.length;
  }
  advance(): void {
    this.step = this.done ? 0 : this.step + 1;
  }
  isLit(i: number): boolean {
    return i < this.step;
  }
  isCurrent(i: number): boolean {
    return i === this.step - 1;
  }

  // Layer chips: the legacy depth spectrum (blue → indigo → amber → slate)
  // re-anchored on the editorial palette (sky → coral → amber → slate).
  readonly layers: Array<{
    key: string;
    n: string;
    icon: string;
    chip: string;
    tag: string;
    lock?: boolean;
  }> = [
    {
      key: 'edge',
      n: '0',
      icon: 'cloud',
      chip: 'bg-sky-100 text-sky-700',
      tag: 'Cloudflare · PQ-hybrid TLS',
    },
    {
      key: 'net',
      n: '1',
      icon: 'shield',
      chip: 'bg-sky-100 text-sky-700',
      tag: 'netfilter · default DROP',
    },
    {
      key: 'web',
      n: '2',
      icon: 'filter_alt',
      chip: 'bg-coral-100 text-coral-700',
      tag: 'nginx · WAF + 429',
    },
    {
      key: 'redis',
      n: '3',
      icon: 'storage',
      chip: 'bg-coral-100 text-coral-700',
      tag: 'Redis · Sentinel HA',
    },
    {
      key: 'app',
      n: '4',
      icon: 'verified_user',
      chip: 'bg-coral-100 text-coral-700',
      tag: 'Firebase · GeoIP · step-up',
    },
    {
      key: 'admin',
      n: '5',
      icon: 'vpn_key',
      chip: 'bg-amber-100 text-amber-700',
      tag: 'YubiKey SSH · per-command sudo',
      lock: true,
    },
    {
      key: 'core',
      n: '6',
      icon: 'lock',
      chip: 'bg-slate-100 text-slate-700',
      tag: 'chattr +i · sealed',
      lock: true,
    },
  ];
}
