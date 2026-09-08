import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Showcase of the 4-layer network perimeter (Cloudflare -> iptables -> nginx
 * -> app). Greenfield port (feature/demo → editorial system): shared
 * <app-survey-card> + <app-code-panel>, the single coral accent for the
 * interactive flow (legacy indigo/primary), and semantic status colours kept
 * ONLY where they encode an outcome (200 / 403 / 429). The Run control is a
 * styled editorial button (greenfield has no shared <app-button>). Honesty
 * register: the GitHub-IP -> SSH rule is STAGED (ipsets built, not yet
 * wired). Snippet is real config from deployment/config/. Presentational
 * only — interactive walkthrough mechanics ported unchanged.
 */
@Component({
  selector: 'app-network-perimeter-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="INFRA"
      [title]="'landing.survey.perimeter.title' | transloco"
      [subtitle]="'landing.survey.perimeter.subtitle' | transloco"
    >
      <!-- 4-layer flow: a request travels CF -> iptables -> nginx -> app (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.perimeter.flowLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.perimeter.run.reached' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'refresh' : 'send' }}</mat-icon>
            {{
              (done ? 'landing.survey.perimeter.run.replay' : 'landing.survey.perimeter.run.cta')
                | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        @for (l of layers; track l.key; let i = $index; let last = $last) {
          <div
            class="relative rounded-xl p-4 ring-1 transition-all duration-300"
            [class]="isLit(i) ? 'bg-white ring-coral-100 shadow-sm' : 'bg-cream ring-beige'"
          >
            <div
              class="flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300"
              [class]="isLit(i) ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-600'"
              [class.perimeter-current]="isCurrent(i)"
            >
              <mat-icon>{{ l.icon }}</mat-icon>
            </div>
            <div
              class="mt-3 text-sm font-bold leading-tight"
              [class]="isLit(i) ? 'text-ink' : 'text-slate2'"
            >
              {{ 'landing.survey.perimeter.layers.' + l.key + '.name' | transloco }}
            </div>
            <div class="mt-1 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.perimeter.layers.' + l.key + '.desc' | transloco }}
            </div>
            @if (!last) {
              <mat-icon
                class="absolute -right-3 top-9 hidden !h-5 !w-5 !text-xl transition-colors lg:block"
                [class]="isLit(i + 1) ? 'text-coral-500' : 'text-beige'"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- scenarios: same request, three callers, three outcomes (semantic status colours) -->
      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        @for (s of scenarios; track s.key) {
          <div class="rounded-xl p-4 ring-1" [class]="s.cls">
            <div class="font-mono text-[11px] text-slate2">{{ s.req }}</div>
            <div class="mt-2 flex items-center gap-2">
              <span class="text-sm font-semibold">
                {{ 'landing.survey.perimeter.scenarios.' + s.key | transloco }}
              </span>
              <span
                class="ml-auto rounded-md px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-white"
                [class]="s.badge"
              >
                {{ s.outcome }}
              </span>
            </div>
          </div>
        }
      </div>

      <p class="mt-5 text-xs text-slate2">{{ 'landing.survey.perimeter.refresh' | transloco }}</p>

      <!-- annotated real config — terminal-style panel -->
      <div class="mt-5">
        <app-code-panel file="deployment/config/nginx-refactored/">{{ snippet }}</app-code-panel>
      </div>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .perimeter-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.2);
      }
    `,
  ],
})
export class NetworkPerimeterShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly layers = [
    { key: 'cloudflare', icon: 'shield' },
    { key: 'iptables', icon: 'layers' },
    { key: 'nginx', icon: 'filter_alt' },
    { key: 'app', icon: 'memory' },
  ];

  // Interactive walkthrough: each click moves a request one layer inward.
  // Synchronous state — no timers/rAF, reliable + verifiable.
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

  readonly scenarios = [
    {
      key: 'legit',
      req: 'GET /api/…',
      outcome: '200',
      cls: 'bg-emerald-50 ring-emerald-100 text-emerald-800',
      badge: 'bg-emerald-600',
    },
    {
      key: 'scanner',
      req: 'User-Agent: sqlmap',
      outcome: '403',
      cls: 'bg-rose-50 ring-rose-100 text-rose-800',
      badge: 'bg-rose-600',
    },
    {
      key: 'flood',
      req: '31 req/s · one IP',
      outcome: '429',
      cls: 'bg-amber-50 ring-amber-100 text-amber-800',
      badge: 'bg-amber-500',
    },
  ];

  readonly snippet = `# 01-cloudflare.conf — reconstruct the real client IP behind the edge
real_ip_header CF-Connecting-IP;
real_ip_recursive on;

# 02-rate-limiting.conf — per-real-IP token buckets (return 429 on flood)
limit_req_zone $real_ip zone=api_limit:10m   rate=30r/s;
limit_req_zone $real_ip zone=login_limit:10m rate=20r/m;

# 03-security.conf — turn security scanners away at the door (403)
if ($bad_bot) { return 403; }   # sqlmap | nikto | nmap | burpsuite | nessus`;
}
