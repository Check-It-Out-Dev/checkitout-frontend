import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Billing saga showcase. Verified against subscription/stripe + subscription/invoicing
 * + subscription/event: a Stripe webhook flows through three idempotency layers,
 * persists an InvoiceRecord, and only AFTER the transaction commits does an
 * @TransactionalEventListener(AFTER_COMMIT) hand the invoice to the InvoicingPort
 * (FakturowniaAdapter), which Fakturownia bridges on to KSeF. Failures move
 * PENDING→FAILED and a retry cron drives them to SENT or DEAD_LETTER.
 *   Triple-layer idempotency (StripeWebhookHandler + FakturowniaAdapter):
 *     L1 existsByStripeEventId (fast-path) · L2 DB unique subscription_event_stripe_unique
 *     (catches concurrent duplicate delivery via DataIntegrityViolationException) ·
 *     L3 Fakturownia oid_unique (no duplicate invoice for one payment).
 * Honesty register (owner 2026-06-11): the full Stripe→Fakturownia(→KSeF) pipeline
 * ran end-to-end on staging — invoices generated AND delivered, suites green.
 * Invoicing is currently switched OFF as a product decision; KSeF emission is one
 * flag in the Fakturownia API call. KSeF is reached *via* Fakturownia (deliberate
 * ports/adapters); in the demo Stripe/Fakturownia/KSeF stay in test mode and
 * nothing is charged.
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield editorial
 * system: shared <app-survey-card> + <app-code-panel>; the single coral accent
 * for the saga flow; semantic emerald/amber/rose for the invoice lifecycle;
 * a coral pill button as the Run control (greenfield has no shared app-button).
 */
@Component({
  selector: 'app-billing-saga-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="BILLING"
      [title]="'landing.survey.billing.title' | transloco"
      [subtitle]="'landing.survey.billing.subtitle' | transloco"
    >
      <!-- the saga flow (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.billing.flowLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.billing.run.invoiced' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'refresh' : 'play_arrow' }}</mat-icon>
            {{
              (done ? 'landing.survey.billing.run.replay' : 'landing.survey.billing.run.cta')
                | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        @for (s of flow; track s.key; let i = $index; let last = $last) {
          <div
            class="relative rounded-xl p-3 ring-1 transition-all duration-300"
            [class]="isLit(i) ? 'bg-white ring-coral-200 shadow-sm' : 'bg-cream ring-beige'"
          >
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300"
              [class]="isLit(i) ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-600'"
              [class.saga-current]="isCurrent(i)"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ s.icon }}</mat-icon>
            </div>
            <div
              class="mt-2 text-[11px] font-semibold leading-tight"
              [class]="isLit(i) ? 'text-ink' : 'text-slate2'"
            >
              {{ 'landing.survey.billing.flow.' + s.key + '.t' | transloco }}
            </div>
            <div class="text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.billing.flow.' + s.key + '.m' | transloco }}
            </div>
            @if (!last) {
              <mat-icon
                class="absolute -right-3 top-7 hidden !h-5 !w-5 !text-xl transition-colors lg:block"
                [class]="isLit(i + 1) ? 'text-coral-500' : 'text-beige'"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- triple-layer idempotency -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.billing.idemLabel' | transloco }}
      </p>
      <p class="mt-1 text-xs leading-relaxed text-slate2">
        {{ 'landing.survey.billing.idemIntro' | transloco }}
      </p>
      <div class="mt-2 space-y-2">
        @for (l of idem; track l.key; let i = $index) {
          <div class="flex items-center gap-3 rounded-xl bg-cream p-3 ring-1 ring-beige">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral-50 text-[11px] font-bold text-coral-600"
            >
              L{{ i + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <span class="font-mono text-[11px] font-semibold text-ink">{{ l.code }}</span>
              <div class="text-[11px] leading-snug text-slate2">
                {{ 'landing.survey.billing.idem.' + l.key | transloco }}
              </div>
            </div>
          </div>
        }
      </div>

      <!-- invoice status lifecycle (semantic) -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.billing.statusLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <span class="rounded-md bg-cream px-2.5 py-1 text-slate2 ring-1 ring-beige">PENDING</span>
        <mat-icon class="!h-4 !w-4 !text-base text-beige">arrow_forward</mat-icon>
        <span class="rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200">
          SENT
        </span>
        <span class="mx-1 text-beige">/</span>
        <span class="rounded-md bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-amber-200">
          FAILED
        </span>
        <mat-icon class="!h-4 !w-4 !text-base text-beige">refresh</mat-icon>
        <span class="text-slate2">{{ 'landing.survey.billing.retry' | transloco }}</span>
        <mat-icon class="!h-4 !w-4 !text-base text-beige">arrow_forward</mat-icon>
        <span class="rounded-md bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200">
          DEAD_LETTER
        </span>
      </div>

      <!-- real snippet -->
      <div class="mt-5">
        <app-code-panel file="StripeWebhookHandler + InvoiceCreatedEventListener">
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.billing.codeCaption' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .saga-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.2);
      }
    `,
  ],
})
export class BillingSagaShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly flow = [
    { key: 'webhook', icon: 'credit_card' },
    { key: 'idem', icon: 'shield' },
    { key: 'record', icon: 'dns' },
    { key: 'commit', icon: 'commit' },
    { key: 'fakturownia', icon: 'description' },
    { key: 'ksef', icon: 'fact_check' },
  ];

  // Interactive walkthrough: each click lights the next saga step. Synchronous
  // state — no timers/rAF, reliable + verifiable. The demo charges nothing.
  step = 0;
  get done(): boolean {
    return this.step >= this.flow.length;
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

  readonly idem = [
    { key: 'fast', code: 'existsByStripeEventId' },
    { key: 'db', code: 'subscription_event_stripe_unique' },
    { key: 'provider', code: 'Fakturownia oid_unique' },
  ];

  readonly snippet = `// StripeWebhookHandler — checkout.session.completed AND invoice.paid can BOTH
// fire for one payment, so we must invoice exactly once.
if (eventRepo.existsByStripeEventId(event.getId())) return;   // L1 fast-path
try { handle(event); }                                        // L2 DB unique guard:
catch (DataIntegrityViolationException dup) { /* already processed */ }

// InvoiceCreatedEventListener — only send once the row is durably committed.
@TransactionalEventListener(phase = AFTER_COMMIT)
void onInvoiceCreated(InvoiceCreatedEvent e) {
    invoicing.send(e.invoiceId());     // FakturowniaAdapter, oid_unique = L3 → KSeF
}                                      // FAILED → retry cron → SENT or DEAD_LETTER`;
}
