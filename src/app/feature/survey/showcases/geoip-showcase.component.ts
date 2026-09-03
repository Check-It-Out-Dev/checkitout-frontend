import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * GeoIP impossible-travel showcase. Verified against common/security/geoip +
 * auth/service/SessionSecurityService:
 *   • GeoLocationFacade resolves two IPs (cache → MaxMind DB),
 *     TravelPatternService runs a Haversine distance, speed = distance ÷ time,
 *     and a tiered decision (same-city ≤50 km allow / same-country speed check
 *     / cross-country inside a 10-min window always block).
 *   • The wired threshold is 500 km/h (the 1000 in GeoIpConfiguration is dead
 *     config).
 *   • Three self-healing DB tiers: local GeoLite2-City.mmdb (in-memory +
 *     cache), MaxMind license API (weekly auto-refresh), GCS bucket +
 *     Firestore lock.
 *   • Circuit breaker: fails OPEN for normal users, CLOSED for privileged
 *     roles (ADMIN/COMPANY) after 5 consecutive GeoIP failures.
 *   • GDPR: IP masked to 1.2.3.xxx, TTLs (location 7d / travel 30d), Art-17
 *     erasure, 90-day access audit.
 * Honesty register: the 0–100 risk score currently powers the admin analysis
 * endpoint, not the live session boolean; VPN/Tor flags need a licensed
 * MaxMind edition (free GeoLite2 returns null traits). Architecture + real
 * code; the demo geolocates nothing.
 *
 * Greenfield port (feature/demo → editorial system): shared <app-survey-card>
 * + <app-code-panel>; flat cream/beige surfaces; coral for the structural
 * origin marker (legacy indigo); semantic rose/amber/emerald kept for the
 * travel verdict, the 3-tier decision and the circuit breaker. Run-the-check
 * stepper mechanics ported unchanged (synchronous, no timers).
 */
@Component({
  selector: 'app-geoip-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="SECURITY"
      [title]="'landing.survey.geoip.title' | transloco"
      [subtitle]="'landing.survey.geoip.subtitle' | transloco"
    >
      <!-- concrete impossible-travel example (interactive — run the check) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.geoip.run.label' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">block</mat-icon>
              {{ 'landing.survey.geoip.run.done' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'refresh' : 'play_arrow' }}</mat-icon>
            {{
              (done ? 'landing.survey.geoip.run.replay' : 'landing.survey.geoip.run.cta')
                | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-2 rounded-xl bg-cream p-5 ring-1 ring-beige">
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div
            class="rounded-xl bg-white p-3 text-center ring-1 transition-all duration-300"
            [class]="step >= 1 ? 'ring-coral-100 shadow-sm' : 'ring-beige'"
          >
            <mat-icon class="!h-5 !w-5 !text-xl text-coral-500">place</mat-icon>
            <div class="mt-1 text-sm font-bold text-ink">
              {{ 'landing.survey.geoip.cityA' | transloco }}
            </div>
            <div class="font-mono text-[11px] text-slate2">
              {{ 'landing.survey.geoip.timeA' | transloco }}
            </div>
            @if (step >= 1) {
              <mat-icon class="mt-1 !h-4 !w-4 !text-base text-emerald-500">check_circle</mat-icon>
            }
          </div>
          <div class="flex flex-col items-center text-slate2">
            <span class="font-mono text-[10px]">{{ 'landing.survey.geoip.gap' | transloco }}</span>
            <mat-icon class="!h-6 !w-6 !text-2xl" [class.geoip-fly]="step >= 2">
              arrow_forward
            </mat-icon>
          </div>
          <div
            class="rounded-xl bg-white p-3 text-center ring-1 transition-all duration-300"
            [class]="step >= 2 ? 'ring-rose-200 shadow-sm' : 'ring-beige'"
          >
            <mat-icon
              class="!h-5 !w-5 !text-xl"
              [class]="step >= 2 ? 'text-rose-500' : 'text-slate2'"
            >
              place
            </mat-icon>
            <div class="mt-1 text-sm font-bold text-ink">
              {{ 'landing.survey.geoip.cityB' | transloco }}
            </div>
            <div class="font-mono text-[11px] text-slate2">
              {{ 'landing.survey.geoip.timeB' | transloco }}
            </div>
            @if (step >= 2) {
              <mat-icon class="mt-1 !h-4 !w-4 !text-base text-rose-500">error_outline</mat-icon>
            }
          </div>
        </div>
        <div
          class="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center font-mono text-xs tabular-nums text-slate2 transition-opacity duration-300"
          [class]="step >= 3 ? 'opacity-100' : 'opacity-40'"
        >
          <span>8&#8201;580&nbsp;km</span>
          <span>÷</span>
          <span>0.2&nbsp;h</span>
          <span>=</span>
          <span class="font-bold" [class]="step >= 3 ? 'text-rose-600' : 'text-slate2'">
            42&#8201;900&nbsp;km/h
          </span>
          <span>&gt;</span>
          <span>500&nbsp;km/h</span>
        </div>
        <div class="mt-3 flex justify-center" [style.min-height.px]="28">
          @if (step >= 4) {
            <span
              class="verdict-pop inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
            >
              <mat-icon class="!h-4 !w-4 !text-base">block</mat-icon>
              {{ 'landing.survey.geoip.verdict' | transloco }}
            </span>
          }
        </div>
      </div>

      <!-- 3-tier decision (semantic) -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.geoip.tiersLabel' | transloco }}
      </p>
      <div class="mt-2 space-y-2">
        @for (t of tiers; track t.key) {
          <div class="flex items-start gap-3 rounded-xl bg-cream p-3 ring-1 ring-beige">
            <span
              class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              [class]="t.cls"
            >
              {{ t.n }}
            </span>
            <div class="text-xs leading-snug text-slate2">
              {{ 'landing.survey.geoip.tiers.' + t.key | transloco }}
            </div>
          </div>
        }
      </div>

      <!-- risk score factors -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.geoip.riskLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (r of risk; track r.key) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-xs font-medium text-ink ring-1 ring-beige"
          >
            {{ 'landing.survey.geoip.risk.' + r.key | transloco }}
            <span class="font-mono font-bold tabular-nums text-rose-600">{{ r.w }}</span>
          </span>
        }
      </div>
      <p class="mt-1.5 text-[11px] text-slate2">
        {{ 'landing.survey.geoip.riskNote' | transloco }}
      </p>

      <!-- self-healing DB tiers + circuit breaker -->
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
            {{ 'landing.survey.geoip.dbLabel' | transloco }}
          </p>
          <div class="mt-2 space-y-1.5">
            @for (d of dbTiers; track d.key) {
              <div class="flex items-center gap-2 text-xs text-slate2">
                <mat-icon class="!h-4 !w-4 !text-base shrink-0 text-coral-500">
                  {{ d.icon }}
                </mat-icon>
                <span class="leading-snug">
                  {{ 'landing.survey.geoip.db.' + d.key | transloco }}
                </span>
              </div>
            }
          </div>
        </div>
        <div>
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
            {{ 'landing.survey.geoip.cbLabel' | transloco }}
          </p>
          <div class="mt-2 space-y-2">
            <div
              class="rounded-lg bg-emerald-50 p-2.5 text-[11px] leading-snug text-emerald-800 ring-1 ring-emerald-100"
            >
              <span class="font-semibold">{{ 'landing.survey.geoip.cbUser' | transloco }}</span>
            </div>
            <div
              class="rounded-lg bg-rose-50 p-2.5 text-[11px] leading-snug text-rose-800 ring-1 ring-rose-100"
            >
              <span class="font-semibold">{{ 'landing.survey.geoip.cbAdmin' | transloco }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- GDPR row -->
      <div class="mt-5 flex flex-wrap gap-2">
        @for (g of gdpr; track g) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-[11px] font-medium text-slate2 ring-1 ring-beige"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-emerald-500">shield</mat-icon>
            {{ 'landing.survey.geoip.gdpr.' + g | transloco }}
          </span>
        }
      </div>

      <!-- real snippet -->
      <div class="mt-5">
        <app-code-panel file="TravelPatternService + SessionSecurityService">
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.geoip.codeCaption' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .geoip-fly {
        animation: geoFly 2.4s ease-in-out infinite;
      }
      @keyframes geoFly {
        0%,
        100% {
          transform: translateX(-3px);
          opacity: 0.5;
        }
        50% {
          transform: translateX(3px);
          opacity: 1;
        }
      }
      .verdict-pop {
        animation: verdictPop 0.4s ease-out both;
      }
      @keyframes verdictPop {
        0% {
          transform: scale(0.6);
          opacity: 0;
        }
        70% {
          transform: scale(1.08);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .geoip-fly,
        .verdict-pop {
          animation: none;
        }
      }
    `,
  ],
})
export class GeoipShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  // "Run the check": resolve A → resolve B (the impossible hop) → the speed
  // math lights → the verdict stamps in. Synchronous stepper, no timers.
  step = 0;
  get done(): boolean {
    return this.step >= 4;
  }
  advance(): void {
    this.step = this.done ? 0 : this.step + 1;
  }

  readonly tiers = [
    { n: '1', key: 'samecity', cls: 'bg-emerald-100 text-emerald-700' },
    { n: '2', key: 'samecountry', cls: 'bg-amber-100 text-amber-700' },
    { n: '3', key: 'crosscountry', cls: 'bg-rose-100 text-rose-700' },
  ];

  readonly risk = [
    { key: 'jump', w: '+50' },
    { key: 'speed', w: '+50' },
    { key: 'vpn', w: '+20' },
    { key: 'proxy', w: '+15' },
    { key: 'tor', w: '+25' },
  ];

  readonly dbTiers = [
    { key: 'local', icon: 'storage' },
    { key: 'maxmind', icon: 'download' },
    { key: 'gcs', icon: 'cloud' },
  ];

  readonly gdpr = ['mask', 'ttl', 'erase', 'audit'];

  readonly snippet = `// TravelPatternService — domestic speed check (Haversine, R = 6371 km)
double distance = calculateDistance(from, to);
double speedKmh = distance / Math.max(minutesElapsed, 1) * 60;
if (speedKmh > maxTravelSpeedKmh) { /* impossible */ }   // 500 km/h

// SessionSecurityService — GeoIP degraded? fail OPEN for users, CLOSED for admins
if (++geoIpConsecutiveFailures >= threshold && isHighPrivilegeRole(role))
    return true;   // block privileged sessions when geolocation is unreliable`;
}
