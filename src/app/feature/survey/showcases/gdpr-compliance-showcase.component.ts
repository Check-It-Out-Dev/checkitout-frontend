import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';
import { buildZip } from './demo-export-zip';

/**
 * GDPR / RODO compliance showcase. Verified against legal/, user/, admin/cascade,
 * auth/service + common/util:
 *   • Proof of consent — ConsentCookieService HMAC-signs the cookie; ConsentProofPayload
 *     carries the isTrusted browser flag, document hash, screen coords, checkbox id;
 *     bound to a versioned LegalDocument.
 *   • Grace period — the wired window is 38 days (LegalConsentService @Value(38),
 *     application.yml:460, DB default 38). A new Terms version starts the countdown
 *     (X-Consent-Required header); ConsentEnforcementCronJob then blocks non-consenting
 *     accounts (BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS).
 *   • Right to be forgotten — soft anonymize (UserAccountOrchestrator.archiveUser:
 *     name → "N/A", phone cleared), hard cascade delete (AdminCascadeDeleteServiceImpl:
 *     Postgres + Firestore + Firebase Storage + Firebase Auth), and the Meta/Instagram
 *     signed erasure callback (InstagramDataDeletionService, + DeferredDeletionCronJob).
 *   • Audit — structured "GDPR: Operation=…" SLF4J lines (actor, purpose, legal basis)
 *     with PII masked via PiiMaskingUtils (email → j***@example.com, IP → 192.168.1.***).
 * Data-subject rights: Art 15 access, Art 17 erasure, Art 5 minimization — all live.
 * Art 20 data portability (the one-click export) is roadmap-committed for the next
 * sprint (~1 day of work, Jira-tracked) and is shown here as part of the compliant
 * surface for the demo, per owner direction. The grace window is configuration-driven
 * (grace-period-days, 38 by default). Architecture + real code; the demo touches no
 * real account.
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield editorial
 * system: shared <app-survey-card> + <app-code-panel>; the legacy indigo/primary
 * lifecycle accent becomes coral; feather svgIcons become Material ligatures;
 * the legacy ButtonComponent becomes the native coral pill CTA (the export CTA stays a
 * real focusable <button>); flat semantic emerald keeps the compliance identity.
 */
@Component({
  selector: 'app-gdpr-compliance-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="COMPLIANCE"
      [title]="'landing.survey.gdpr.title' | transloco"
      [subtitle]="'landing.survey.gdpr.subtitle' | transloco"
    >
      <!-- prominent GDPR / RODO badge (semantic emerald) -->
      <div
        class="mt-5 flex flex-col gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 sm:flex-row sm:items-center"
      >
        <div class="flex items-center gap-3">
          <span
            class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm"
          >
            <mat-icon class="!h-6 !w-6 !text-2xl">shield</mat-icon>
          </span>
          <div>
            <div class="text-sm font-bold text-ink">
              {{ 'landing.survey.gdpr.badge' | transloco }}
            </div>
            <div class="text-[11px] text-slate2">
              {{ 'landing.survey.gdpr.badgeSub' | transloco }}
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5 sm:ml-auto">
          @for (r of rights; track r) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check</mat-icon>
              {{ 'landing.survey.gdpr.rights.' + r | transloco }}
            </span>
          }
        </div>
      </div>

      <!-- the life of your data (interactive walk) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.gdpr.lifeLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (lifeDone) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.gdpr.run.done' | transloco }}
            </span>
          }
          <button type="button" [class]="lifeDone ? replayBtn : runBtn" (click)="advanceLife()">
            <mat-icon class="!h-4 !w-4 !text-base">
              {{ lifeDone ? 'refresh' : 'play_arrow' }}
            </mat-icon>
            {{
              (lifeDone ? 'landing.survey.gdpr.run.replay' : 'landing.survey.gdpr.run.cta')
                | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        @for (s of life; track s.k; let i = $index, last = $last) {
          <div
            class="relative rounded-xl p-4 ring-1 transition-all duration-300"
            [class]="lifeLit(i) ? 'bg-white ring-coral-100 shadow-sm' : 'bg-cream ring-beige'"
          >
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300"
              [class]="lifeLit(i) ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-500'"
              [class.gdpr-current]="lifeCurrent(i)"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ s.icon }}</mat-icon>
            </div>
            <div
              class="mt-2.5 text-xs font-semibold leading-tight"
              [class]="lifeLit(i) ? 'text-ink' : 'text-slate2'"
            >
              {{ 'landing.survey.gdpr.life.' + s.k + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.gdpr.life.' + s.k + '.d' | transloco }}
            </div>
            @if (!last) {
              <mat-icon
                class="absolute -right-3 top-8 hidden !h-5 !w-5 !text-xl transition-colors sm:block"
                [class]="lifeLit(i + 1) ? 'text-coral-500' : 'text-beige'"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- four pillars -->
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        @for (p of pillars; track p.key) {
          <div class="rounded-xl bg-cream p-4 ring-1 ring-beige">
            <div class="flex items-center gap-2">
              <span
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"
              >
                <mat-icon class="!h-4 !w-4 !text-base">{{ p.icon }}</mat-icon>
              </span>
              <span class="text-sm font-semibold text-ink">
                {{ 'landing.survey.gdpr.pillars.' + p.key + '.t' | transloco }}
              </span>
            </div>
            <p class="mt-2 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.gdpr.pillars.' + p.key + '.d' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- 38-day grace timeline (semantic) -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.gdpr.graceLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          class="inline-flex items-center gap-1.5 rounded-md bg-coral-50 px-2.5 py-1 font-medium text-coral-600 ring-1 ring-coral-100"
        >
          <mat-icon class="!h-3.5 !w-3.5 !text-sm">description</mat-icon>
          {{ 'landing.survey.gdpr.graceTerms' | transloco }}
        </span>
        <mat-icon class="!h-4 !w-4 !text-base text-beige">arrow_forward</mat-icon>
        <span
          class="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 font-mono font-semibold tabular-nums text-amber-700 ring-1 ring-amber-200"
        >
          <mat-icon class="!h-3.5 !w-3.5 !text-sm">schedule</mat-icon>
          {{ 'landing.survey.gdpr.graceWindow' | transloco }}
        </span>
        <mat-icon class="!h-4 !w-4 !text-base text-beige">arrow_forward</mat-icon>
        <span
          class="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 font-medium text-rose-700 ring-1 ring-rose-200"
        >
          <mat-icon class="!h-3.5 !w-3.5 !text-sm">lock</mat-icon>
          {{ 'landing.survey.gdpr.graceBlocked' | transloco }}
        </span>
      </div>

      <!-- right-to-be-forgotten paths -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.gdpr.pathsLabel' | transloco }}
      </p>
      <div class="mt-2 grid gap-2 sm:grid-cols-3">
        @for (p of paths; track p) {
          <div class="rounded-xl bg-cream p-3 ring-1 ring-beige">
            <div class="text-xs font-semibold text-ink">
              {{ 'landing.survey.gdpr.paths.' + p + '.t' | transloco }}
            </div>
            <div class="mt-0.5 text-[11px] leading-snug text-slate2">
              {{ 'landing.survey.gdpr.paths.' + p + '.d' | transloco }}
            </div>
          </div>
        }
      </div>

      <!-- Art. 20 data portability — one-click export -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.gdpr.portabilityLabel' | transloco }}
      </p>
      <p class="mt-1 text-xs leading-relaxed text-slate2">
        {{ 'landing.survey.gdpr.portabilityDesc' | transloco }}
      </p>
      <div class="mt-3 overflow-hidden rounded-xl border border-beige bg-white shadow-sm">
        <div class="flex items-center gap-2 border-b border-beige bg-cream px-4 py-2.5">
          <mat-icon class="!h-4 !w-4 !text-base text-emerald-500">download</mat-icon>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.gdpr.exportTitle' | transloco }}
          </span>
        </div>
        <div class="p-4">
          <p class="text-xs text-slate2">{{ 'landing.survey.gdpr.exportDesc' | transloco }}</p>
          <div class="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            @for (f of exportItems; track f) {
              <div class="flex items-center gap-2 font-mono text-[11px] text-slate2">
                <mat-icon class="!h-3.5 !w-3.5 !text-sm shrink-0 text-slate2">
                  insert_drive_file
                </mat-icon>
                {{ 'landing.survey.gdpr.exportItems.' + f | transloco }}
              </div>
            }
          </div>
          <div class="mt-4 inline-flex">
            <button
              type="button"
              (click)="downloadExport()"
              data-testid="gdpr-export-download"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px"
              [class]="
                exported()
                  ? 'bg-emerald-600 hover:bg-emerald-600'
                  : 'bg-coral-700 hover:bg-coral-800'
              "
            >
              <mat-icon class="!h-4 !w-4 !text-base">
                {{ exported() ? 'check' : 'download' }}
              </mat-icon>
              {{
                (exported() ? 'landing.survey.gdpr.exportDone' : 'landing.survey.gdpr.exportBtn')
                  | transloco
              }}
            </button>
          </div>
        </div>
      </div>

      <!-- real snippet -->
      <div class="mt-5">
        <app-code-panel file="UserAccountOrchestrator + PiiMaskingUtils">
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.gdpr.codeCaption' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      /* Coral pulse on the currently-active lifecycle stage (legacy used indigo). */
      .gdpr-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.2);
      }
    `,
  ],
})
export class GdprComplianceShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly rights = ['access', 'erasure', 'portability', 'minimization'];

  // "Follow your data" — the full lifecycle, each stage backed by the blocks
  // below (consent proof, masked logging, grace, erasure paths, audit trail).
  // Icons: Material ligatures (legacy feather → check-square→check_box,
  // activity→analytics, refresh-cw→refresh, user-x→delete_forever,
  // file-text→description).
  readonly life = [
    { k: 'capture', icon: 'check_box' },
    { k: 'use', icon: 'analytics' },
    { k: 'reconsent', icon: 'refresh' },
    { k: 'erase', icon: 'delete_forever' },
    { k: 'prove', icon: 'description' },
  ];
  lifeStep = 0;
  get lifeDone(): boolean {
    return this.lifeStep >= this.life.length;
  }
  advanceLife(): void {
    this.lifeStep = this.lifeDone ? 0 : this.lifeStep + 1;
  }
  lifeLit(i: number): boolean {
    return i < this.lifeStep;
  }
  lifeCurrent(i: number): boolean {
    return i === this.lifeStep - 1;
  }

  // The portable export bundle — the real entities the platform holds per subject.
  readonly exportItems = ['profile', 'consents', 'billing', 'campaigns', 'social'];

  /** Flips the CTA to its "downloaded" state for a beat after the click. */
  readonly exported = signal(false);

  /**
   * Art 20 demo: build the promised .zip client-side (STORED entries, no
   * deps) from demo-shaped data and hand it to the browser. Every file
   * carries a `_notice` naming it demo data — honesty register.
   */
  downloadExport(): void {
    const notice = 'Demo export — sample data, no real account behind it.';
    const j = (o: object) => JSON.stringify({ _notice: notice, ...o }, null, 2);
    const zip = buildZip([
      {
        name: 'profile.json',
        content: j({
          email: 'demo@checkitout.app',
          companyName: 'Demo Brand Sp. z o.o.',
          nip: '5260250995',
          accountStatus: 'ACTIVE',
          createdTime: '2026-05-04T09:12:00',
        }),
      },
      {
        name: 'consents.json',
        content: j({
          consents: [
            {
              documentName: 'Terms of Service v3',
              documentHash: 'sha256:2f1a…9c44',
              acceptedAt: '2026-05-04T09:14:21',
              proof: { isTrusted: true, checkboxId: 'tos-consent', language: 'pl-PL' },
            },
          ],
        }),
      },
      {
        name: 'subscriptions.json',
        content: j({
          plan: 'Business',
          status: 'BUSINESS_ACTIVE',
          invoices: [{ number: 'FV 2026/06/0042', amountPln: 29, status: 'SENT' }],
        }),
      },
      {
        name: 'campaigns.json',
        content: j({
          campaigns: [
            { title: 'Letnia kampania specjałów kawowych', status: 'ACTIVE' },
            { title: 'Premiera linii przekąsek proteinowych', status: 'ACTIVE' },
          ],
          applications: [],
        }),
      },
      {
        name: 'social-connections.json',
        content: j({ instagram: { handle: '@demobrand', connectedAt: '2026-05-06T11:02:00' } }),
      },
    ]);

    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'checkitout-demo-export.zip';
    a.click();
    URL.revokeObjectURL(url);

    this.exported.set(true);
    setTimeout(() => this.exported.set(false), 2600);
  }

  readonly pillars = [
    { key: 'consent', icon: 'check_box' },
    { key: 'grace', icon: 'schedule' },
    { key: 'forget', icon: 'delete_forever' },
    { key: 'audit', icon: 'description' },
  ];

  readonly paths = ['anonymize', 'cascade', 'meta'];

  readonly snippet = `// UserAccountOrchestrator — anonymize in place (GDPR right to erasure)
user.setFirstName("N/A");
user.setLastName("N/A");
user.setPhoneNumber(null);

// UserController — every personal-data touch logs a structured, masked line
log.info("GDPR: Operation=getCurrentUser, FirebaseUID={}, " +
         "DataAccessed=profile,email, Purpose=profile_display", uid);
// emails are masked everywhere:  maskEmail(..) -> j***@example.com`;
}
