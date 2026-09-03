import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

interface FsmNode {
  key: string;
  label: string;
  x: number;
  y: number;
  cat: string;
}
interface FsmEdge {
  from: string;
  to: string;
  d: string;
}
interface FsmScenario {
  key: string;
  nodes: string[];
  edges: string[];
  path: string;
  ghost?: string;
}

/**
 * Subscription state machine — the interactive centerpiece. 9 verified states
 * (SubscriptionStatus enum) on a hand-laid SVG graph; click a scenario to
 * watch a glowing token travel the real transitions (SubscriptionService /
 * TermsGraceProcessorCronJob). The "Terms re-consent" scenario shows the
 * previousState remember-and-resume via a ghost ring. Illustrative; the demo
 * fires no real billing — the backend is the source of truth.
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield
 * editorial system: shared <app-survey-card> + <app-code-panel>; the coral
 * token for the lit edges/token (was indigo); the SVG keeps its semantic
 * state-category colours and is aria-hidden because the 9-state legend +
 * scenario caption are the accessible equivalent.
 */
@Component({
  selector: 'app-subscription-state-machine-showcase',
  imports: [TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="BILLING"
      [title]="'landing.survey.subscription.title' | transloco"
      [subtitle]="'landing.survey.subscription.subtitle' | transloco"
    >
      <!-- scenario buttons -->
      <div class="mt-5 flex flex-wrap items-center gap-2">
        <span
          class="mr-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2"
        >
          {{ 'landing.survey.subscription.play' | transloco }}
        </span>
        @for (s of scenarios; track s.key) {
          <button
            type="button"
            (click)="select(s)"
            class="rounded-full px-3 py-1 text-xs font-medium ring-1 transition focus:outline-none focus:ring-2 focus:ring-coral-500 focus:ring-offset-1"
            [class]="
              active?.key === s.key
                ? 'bg-coral-500 text-white ring-coral-500'
                : 'bg-cream text-ink ring-beige hover:ring-coral-300'
            "
          >
            {{ 'landing.survey.subscription.scenarios.' + s.key + '.label' | transloco }}
          </button>
        }
      </div>

      <!-- SVG state graph (decorative aid: the legend + caption below are the accessible equivalent) -->
      <div class="mt-3 overflow-x-auto rounded-xl bg-cream p-3 ring-1 ring-beige">
        <svg viewBox="0 0 720 310" class="h-auto w-full min-w-[640px]" aria-hidden="true">
          <defs>
            <marker
              id="fsmArrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill="#C9C0AC" />
            </marker>
            <marker
              id="fsmArrowLit"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill="#FF5A36" />
            </marker>
          </defs>
          <!-- entry arrow: the lifecycle starts at FREE -->
          <path
            d="M14,150 L30,150"
            fill="none"
            stroke="#9A9382"
            stroke-width="1.5"
            marker-end="url(#fsmArrow)"
          />
          <!-- edges (gentle Béziers: out and back never overlap, nothing crosses a state) -->
          @for (e of edges; track e.from + '>' + e.to) {
            <path
              [attr.d]="e.d"
              fill="none"
              class="fsm-edge"
              [attr.stroke]="isEdgeLit(e) ? '#FF5A36' : '#E0D9C7'"
              [attr.stroke-width]="isEdgeLit(e) ? 2.5 : 1.4"
              [attr.marker-end]="isEdgeLit(e) ? 'url(#fsmArrowLit)' : 'url(#fsmArrow)'"
            />
          }
          <!-- ghost ring: previousState remember & resume -->
          @if (active?.ghost; as ghost) {
            <circle
              [attr.cx]="nodeOf(ghost).x"
              [attr.cy]="nodeOf(ghost).y"
              r="28"
              fill="none"
              stroke="#FF7B5C"
              stroke-width="1.5"
              stroke-dasharray="3 3"
              class="fsm-ghost"
            />
          }
          <!-- nodes -->
          @for (n of nodes; track n.key) {
            <g [attr.transform]="'translate(' + n.x + ',' + n.y + ')'">
              <rect
                [attr.x]="-chipW(n) / 2"
                y="-13"
                [attr.width]="chipW(n)"
                height="26"
                rx="13"
                class="fsm-node"
                [attr.fill]="isNodeLit(n) ? catFill[n.cat] : '#ffffff'"
                [attr.stroke]="isNodeLit(n) ? catStroke[n.cat] : '#E0D9C7'"
                stroke-width="1.5"
              />
              <text
                x="0"
                y="4"
                text-anchor="middle"
                class="fsm-label"
                [attr.fill]="isNodeLit(n) ? '#0E1116' : '#4A4F5C'"
              >
                {{ n.label }}
              </text>
            </g>
          }
          <!-- traveling token (recreated on each play → restarts the motion) -->
          @for (p of [playId]; track p) {
            @if (active; as a) {
              <circle r="7" fill="#FF5A36" class="fsm-token">
                <animateMotion
                  [attr.dur]="a.nodes.length * 0.85 + 's'"
                  fill="freeze"
                  [attr.path]="a.path"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.4 0 0.2 1"
                />
              </circle>
            }
          }
        </svg>
      </div>

      <!-- caption -->
      <p class="mt-3 min-h-[3rem] text-sm leading-relaxed">
        @if (active; as a) {
          <span class="text-slate2">
            {{ 'landing.survey.subscription.scenarios.' + a.key + '.caption' | transloco }}
          </span>
        } @else {
          <span class="text-slate2">{{ 'landing.survey.subscription.hint' | transloco }}</span>
        }
      </p>

      <!-- 9-state legend -->
      <div class="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        @for (g of groups; track g.key) {
          <div>
            <div class="mb-1 flex items-center gap-2">
              <span class="inline-block h-2 w-2 rounded-full" [class]="g.dot"></span>
              <span
                class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2"
              >
                {{ 'landing.survey.subscription.legend.' + g.key | transloco }}
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              @for (s of g.states; track s) {
                <span
                  class="rounded-md bg-cream px-2 py-0.5 font-mono text-[10px] text-slate2 ring-1 ring-beige"
                >
                  {{ s }}
                </span>
              }
            </div>
          </div>
        }
      </div>

      <!-- code panel -->
      <div class="mt-5">
        <app-code-panel file="SubscriptionService.java">{{ snippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.subscription.codeCaption' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .fsm-label {
        font:
          600 10px/1 'JetBrains Mono',
          monospace;
      }
      .fsm-node,
      .fsm-edge {
        transition:
          fill 0.3s ease,
          stroke 0.3s ease,
          stroke-width 0.3s ease;
      }
      .fsm-token {
        filter: drop-shadow(0 0 5px rgba(255, 90, 54, 0.85));
      }
      .fsm-ghost {
        animation: ghostPulse 2s ease-in-out infinite;
      }
      @keyframes ghostPulse {
        0%,
        100% {
          opacity: 0.35;
        }
        50% {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .fsm-ghost {
          animation: none;
        }
      }
    `,
  ],
})
export class SubscriptionStateMachineShowcaseComponent {
  // Semantic state-category colours (NOT the accent): pastel fills + strokes.
  readonly catFill: Record<string, string> = {
    active: '#d1fae5',
    trial: '#e0e7ff',
    transitional: '#fef3c7',
    problem: '#ffedd5',
    terminal: '#ffe4e6',
  };
  readonly catStroke: Record<string, string> = {
    active: '#34d399',
    trial: '#818cf8',
    transitional: '#fbbf24',
    problem: '#fb923c',
    terminal: '#fb7185',
  };

  // Lifecycle reads left → right: FREE starts, ENTERPRISE is the hub, terminal
  // states live on the right edge. Curves are hand-tuned so out/back pairs
  // separate and nothing crosses a state chip.
  readonly nodes: FsmNode[] = [
    { key: 'FREE_ACTIVE', label: 'FREE', x: 60, y: 150, cat: 'active' },
    { key: 'TRIAL_ENTERPRISE', label: 'TRIAL', x: 190, y: 70, cat: 'trial' },
    { key: 'BUSINESS_ACTIVE', label: 'BUSINESS', x: 190, y: 230, cat: 'active' },
    { key: 'ENTERPRISE_ACTIVE', label: 'ENTERPRISE', x: 350, y: 150, cat: 'active' },
    { key: 'TERMS_PENDING', label: 'TERMS', x: 510, y: 70, cat: 'transitional' },
    { key: 'PAYMENT_FAILED', label: 'PAY FAIL', x: 510, y: 230, cat: 'problem' },
    { key: 'DOWNGRADE_PENDING', label: 'DOWNGRADE', x: 300, y: 272, cat: 'transitional' },
    { key: 'SUSPENDED_LEGAL', label: 'SUSPENDED', x: 640, y: 110, cat: 'terminal' },
    { key: 'ACCOUNT_DEACTIVATED', label: 'CLOSED', x: 640, y: 230, cat: 'terminal' },
  ];

  readonly edges: FsmEdge[] = [
    { from: 'FREE_ACTIVE', to: 'TRIAL_ENTERPRISE', d: 'M72,138 Q110,88 162,74' },
    { from: 'TRIAL_ENTERPRISE', to: 'ENTERPRISE_ACTIVE', d: 'M218,76 Q290,92 338,138' },
    { from: 'FREE_ACTIVE', to: 'BUSINESS_ACTIVE', d: 'M72,162 Q110,212 156,226' },
    { from: 'BUSINESS_ACTIVE', to: 'ENTERPRISE_ACTIVE', d: 'M224,224 Q290,208 340,162' },
    { from: 'ENTERPRISE_ACTIVE', to: 'TERMS_PENDING', d: 'M372,136 Q440,84 484,72' },
    { from: 'TERMS_PENDING', to: 'ENTERPRISE_ACTIVE', d: 'M492,82 Q430,128 384,144' },
    { from: 'ENTERPRISE_ACTIVE', to: 'PAYMENT_FAILED', d: 'M372,164 Q440,216 478,226' },
    { from: 'PAYMENT_FAILED', to: 'ENTERPRISE_ACTIVE', d: 'M488,218 Q430,172 384,156' },
    { from: 'ENTERPRISE_ACTIVE', to: 'DOWNGRADE_PENDING', d: 'M340,164 Q316,210 304,258' },
    { from: 'DOWNGRADE_PENDING', to: 'FREE_ACTIVE', d: 'M258,276 Q110,290 58,166' },
    { from: 'TERMS_PENDING', to: 'SUSPENDED_LEGAL', d: 'M538,76 Q596,84 626,98' },
    { from: 'SUSPENDED_LEGAL', to: 'ACCOUNT_DEACTIVATED', d: 'M648,124 Q662,176 646,216' },
  ];

  readonly scenarios: FsmScenario[] = [
    {
      key: 'trial',
      nodes: ['FREE_ACTIVE', 'TRIAL_ENTERPRISE', 'ENTERPRISE_ACTIVE'],
      edges: ['FREE_ACTIVE>TRIAL_ENTERPRISE', 'TRIAL_ENTERPRISE>ENTERPRISE_ACTIVE'],
      path: 'M60,150 Q110,88 190,70 Q290,92 350,150',
    },
    {
      key: 'payfail',
      nodes: ['ENTERPRISE_ACTIVE', 'PAYMENT_FAILED'],
      edges: ['ENTERPRISE_ACTIVE>PAYMENT_FAILED', 'PAYMENT_FAILED>ENTERPRISE_ACTIVE'],
      path: 'M350,150 Q440,216 510,230 Q430,172 350,150',
    },
    {
      key: 'terms',
      nodes: ['ENTERPRISE_ACTIVE', 'TERMS_PENDING'],
      edges: ['ENTERPRISE_ACTIVE>TERMS_PENDING', 'TERMS_PENDING>ENTERPRISE_ACTIVE'],
      path: 'M350,150 Q440,84 510,70 Q430,128 350,150',
      ghost: 'ENTERPRISE_ACTIVE',
    },
    {
      key: 'suspend',
      nodes: ['TERMS_PENDING', 'SUSPENDED_LEGAL', 'ACCOUNT_DEACTIVATED'],
      edges: ['TERMS_PENDING>SUSPENDED_LEGAL', 'SUSPENDED_LEGAL>ACCOUNT_DEACTIVATED'],
      path: 'M510,70 Q596,84 640,110 Q662,176 640,230',
    },
    {
      key: 'downgrade',
      nodes: ['ENTERPRISE_ACTIVE', 'DOWNGRADE_PENDING', 'FREE_ACTIVE'],
      edges: ['ENTERPRISE_ACTIVE>DOWNGRADE_PENDING', 'DOWNGRADE_PENDING>FREE_ACTIVE'],
      path: 'M350,150 Q316,210 300,272 Q110,290 60,150',
    },
  ];

  readonly groups = [
    {
      key: 'active',
      dot: 'bg-emerald-400',
      states: ['FREE_ACTIVE', 'BUSINESS_ACTIVE', 'ENTERPRISE_ACTIVE'],
    },
    { key: 'trial', dot: 'bg-indigo-400', states: ['TRIAL_ENTERPRISE'] },
    { key: 'transitional', dot: 'bg-amber-400', states: ['DOWNGRADE_PENDING', 'TERMS_PENDING'] },
    { key: 'problem', dot: 'bg-orange-400', states: ['PAYMENT_FAILED'] },
    { key: 'terminal', dot: 'bg-rose-500', states: ['SUSPENDED_LEGAL', 'ACCOUNT_DEACTIVATED'] },
  ];

  readonly snippet = `// SubscriptionService — a new Terms version is published: park the
// company, remembering exactly which state it was in.
sub.setPreviousState(sub.getStatus());
sub.setStatus(TERMS_PENDING);

// Accept within the grace window -> resume the prior state, not a guess.
var restored = sub.getPreviousState() != null
        ? sub.getPreviousState() : FREE_ACTIVE;
sub.setStatus(restored);

// Grace expires (TermsGraceProcessorCronJob) -> SUSPENDED_LEGAL,
// then prolonged non-compliance -> ACCOUNT_DEACTIVATED.`;

  active: FsmScenario | null = null;
  playId = 0;

  select(s: FsmScenario): void {
    this.active = s;
    this.playId++;
  }
  nodeOf(key: string): FsmNode {
    return this.nodes.find((n) => n.key === key) ?? this.nodes[0];
  }
  chipW(n: FsmNode): number {
    return n.label.length * 7 + 20;
  }
  isNodeLit(n: FsmNode): boolean {
    return this.active?.nodes.includes(n.key) ?? false;
  }
  isEdgeLit(e: FsmEdge): boolean {
    return this.active?.edges.includes(e.from + '>' + e.to) ?? false;
  }
}
