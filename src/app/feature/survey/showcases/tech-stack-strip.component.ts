import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { STACK_MARKS, STACK_MARK_OF, type StackMark } from './stack-icons';

/** Chips without a brand mark: what the thing is, as a Material glyph. */
const FALLBACK_GLYPH: Readonly<Record<string, string>> = {
  'Transloco (i18n)': 'translate',
  Fakturownia: 'receipt_long',
  KSeF: 'account_balance',
};

/**
 * "Stack at a glance" overview strip — the whole technology stack grouped by
 * layer plus the compliance/standards the platform meets, so a CTO gets an
 * immediate read before the deep-dives. Text chips (brand names as styled
 * pills), NOT copyrighted logo images. Every entry is real and used in the
 * codebase (Angular/Spring/Postgres/Redis/Cloudflare/Stripe/Fakturownia/
 * Firebase/Grafana-Loki/Ansible). Compliance badges map to features shown in
 * the deep-dives (GDPR/RODO, post-quantum TLS at the edge, hardware-key
 * admin, immutable deploys, mTLS log ingest, HMAC consent proofs).
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield
 * editorial system: shared <app-survey-card> surface; uniform cream/beige
 * chips (the group LABEL carries the category, not chip colour); a single
 * coral structural accent (dots + icon tiles); mono eyebrows for section
 * labels.
 */
@Component({
  selector: 'app-tech-stack-strip',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      [title]="'landing.survey.techstack.title' | transloco"
      [subtitle]="'landing.survey.techstack.subtitle' | transloco"
    >
      <!-- stack grouped by layer — click a layer to see why we chose it -->
      <p class="mt-4 text-[11px] text-slate2">
        {{ 'landing.survey.techstack.whyHint' | transloco }}
      </p>
      <div class="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        @for (g of groups; track g.key) {
          <div>
            <button
              type="button"
              (click)="toggleWhy(g.key)"
              class="group mb-2 flex cursor-pointer items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
              [attr.aria-expanded]="openWhy === g.key"
            >
              <span class="inline-block h-2 w-2 rounded-full bg-coral-500"></span>
              <span
                class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] transition-colors"
                [class]="
                  openWhy === g.key ? 'text-coral-600' : 'text-slate2 group-hover:text-coral-600'
                "
              >
                {{ 'landing.survey.techstack.groups.' + g.key | transloco }}
              </span>
              <mat-icon
                class="!h-3.5 !w-3.5 !text-sm transition-transform duration-300"
                [class]="
                  openWhy === g.key
                    ? 'text-coral-600 rotate-180'
                    : 'text-beige group-hover:text-coral-600'
                "
              >
                expand_more
              </mat-icon>
            </button>
            <div class="flex flex-wrap gap-1.5">
              @for (t of g.items; track t) {
                <!-- A brand mark per chip, in the brand's own colour (simple-icons,
                     generated into stack-icons.ts). Text-only chips read as a list;
                     these read as the things themselves — and a visitor scanning
                     for "do they run Postgres?" finds the elephant before the
                     word. The mark is decorative: the label carries the name. -->
                <span
                  class="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-beige"
                >
                  @if (mark(t); as m) {
                    <svg
                      viewBox="0 0 24 24"
                      class="h-3.5 w-3.5 shrink-0"
                      [attr.fill]="m.hex"
                      aria-hidden="true"
                    >
                      <path [attr.d]="m.path" />
                    </svg>
                  } @else {
                    <mat-icon
                      class="!h-3.5 !w-3.5 !text-sm shrink-0 text-coral-600"
                      aria-hidden="true"
                    >
                      {{ glyph(t) }}
                    </mat-icon>
                  }
                  {{ t }}
                </span>
              }
            </div>
            @if (openWhy === g.key) {
              <p
                class="mt-2 rounded-lg bg-coral-50 p-2.5 text-xs leading-relaxed text-slate2 ring-1 ring-coral-100"
              >
                {{ 'landing.survey.techstack.whys.' + g.key | transloco }}
              </p>
            }
          </div>
        }
      </div>

      <!-- compliance / standards -->
      <div class="mt-7 border-t border-beige pt-6">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.techstack.badgesLabel' | transloco }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          @for (b of badges; track b.key) {
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-beige"
            >
              <mat-icon class="!h-4 !w-4 !text-base text-coral-600">{{ b.icon }}</mat-icon>
              {{ 'landing.survey.techstack.badges.' + b.key | transloco }}
            </span>
          }
        </div>
      </div>

      <!-- production-ready highlights -->
      <div class="mt-7 border-t border-beige pt-6">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.techstack.highlightsLabel' | transloco }}
        </p>
        <div class="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          @for (h of highlights; track h.key) {
            <div class="flex items-start gap-3">
              <span
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
              >
                <mat-icon class="!h-4 !w-4 !text-base">{{ h.icon }}</mat-icon>
              </span>
              <div>
                <div class="text-sm font-semibold text-ink">
                  {{ 'landing.survey.techstack.highlights.' + h.key + '.t' | transloco }}
                </div>
                <p class="mt-0.5 text-xs leading-relaxed text-slate2">
                  {{ 'landing.survey.techstack.highlights.' + h.key + '.d' | transloco }}
                </p>
              </div>
            </div>
          }
        </div>
      </div>
    </app-survey-card>
  `,
})
export class TechStackStripComponent {
  // One open "why we chose it" panel at a time (click the layer header).
  openWhy: string | null = null;
  /** The brand mark for a chip, or null for a house product / a library without one. */
  mark(label: string): StackMark | null {
    const slug = STACK_MARK_OF[label];
    return slug ? (STACK_MARKS[slug] ?? null) : null;
  }
  /** Material glyph for the chips that have no brand mark. */
  glyph(label: string): string {
    return FALLBACK_GLYPH[label] ?? 'extension';
  }
  toggleWhy(key: string): void {
    this.openWhy = this.openWhy === key ? null : key;
  }

  readonly groups = [
    {
      key: 'frontend',
      items: [
        'Angular 22',
        'TypeScript',
        'Tailwind CSS',
        'Angular Material',
        'Transloco (i18n)',
        'RxJS',
      ],
    },
    { key: 'backend', items: ['Spring Boot 3.4', 'Java 21', 'Maven', 'Liquibase'] },
    {
      key: 'data',
      items: ['PostgreSQL', 'Redis · Sentinel', 'Firestore', 'Google KMS', 'Google Secret Manager'],
    },
    {
      key: 'infra',
      items: ['Docker', 'Nginx', 'Cloudflare', 'Ansible', 'GitHub Actions', 'OVH'],
    },
    {
      key: 'observability',
      items: ['Grafana', 'Loki', 'Grafana Alloy', 'Journald (sealed)', 'Google Cloud Storage'],
    },
    {
      key: 'integrations',
      items: [
        'Stripe',
        'Fakturownia',
        'KSeF',
        'Firebase Auth',
        'Instagram / Meta',
        'RBAC · JWT claims',
      ],
    },
  ];

  readonly badges = [
    { key: 'gdpr', icon: 'shield' },
    { key: 'pq', icon: 'lock' },
    { key: 'hwkey', icon: 'vpn_key' },
    { key: 'immutable', icon: 'check_circle' },
    { key: 'mtls', icon: 'shield' },
    { key: 'hmac', icon: 'check_circle' },
  ];

  // Production-ready facts the opener doesn't already cover (resilient data + EU
  // readiness + the security stack now live in the lead paragraph above).
  readonly highlights = [
    { key: 'signed', icon: 'lock' },
    { key: 'logs', icon: 'analytics' },
  ];
}
