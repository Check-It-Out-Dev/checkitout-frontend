import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { WorldSimShellComponent } from './world-sim-shell.component';
import { DEMO_PLAN_KEY } from '../../../core/demo/demo-fixtures';
import { SandboxDirectorService } from '../../../core/demo/sandbox-director.service';

/**
 * Fakturownia simulator — the invoicing panel as the world sees it. Shows
 * the invoice the billing saga just produced (buyer = the GUS-confirmed
 * company from the scenario) with the real-life action: "send to KSeF" —
 * one click, exactly the one flag the production integration flips.
 * Clicking flips the status and reports to the director.
 *
 * The invoice mirrors the tour's story state: after the upgrade beat the
 * fixtures persist the chosen plan under DEMO_PLAN_KEY, and this sim shows
 * the matching invoice (Enterprise 99 zł) instead of a stale Business one.
 *
 * Editorial restyle: the vendor chrome KEEPS Fakturownia's emerald — the sim
 * is the outside world, not the app — while the invoice paper goes cream
 * cards + beige borders + mono eyebrows.
 */
@Component({
  selector: 'app-fakturownia-sim',
  imports: [MatIconModule, TranslocoPipe, WorldSimShellComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-world-sim-shell [caption]="'demo.sims.fakturownia.caption' | transloco">
      <div
        class="w-[30rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <!-- vendor chrome -->
        <div class="flex items-center gap-2 bg-emerald-700 px-4 py-2.5">
          <mat-icon class="!h-4 !w-4 !text-base text-white">description</mat-icon>
          <span class="text-xs font-bold tracking-wide text-white">Fakturownia</span>
          <span class="ml-auto font-mono text-[10px] text-emerald-100">
            {{ 'demo.sims.fakturownia.env' | transloco }}
          </span>
        </div>
        <div class="p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div
                class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2"
              >
                {{ 'demo.sims.fakturownia.invoice' | transloco }}
              </div>
              <div class="mt-0.5 font-mono text-lg font-bold text-ink">{{ invoiceNo }}</div>
            </div>
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              [class]="sent ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">
                {{ sent ? 'check_circle' : 'schedule' }}
              </mat-icon>
              {{
                (sent ? 'demo.sims.fakturownia.statusSent' : 'demo.sims.fakturownia.statusIssued')
                  | transloco
              }}
            </span>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div class="rounded-xl border border-beige bg-cream p-3">
              <div
                class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2/80"
              >
                {{ 'demo.sims.fakturownia.buyer' | transloco }}
              </div>
              <div class="mt-1 font-semibold text-ink">Demo Brand Sp. z o.o.</div>
              <div class="font-mono text-slate2">NIP 5260250995</div>
            </div>
            <div class="rounded-xl border border-beige bg-cream p-3">
              <div
                class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2/80"
              >
                {{ 'demo.sims.fakturownia.amount' | transloco }}
              </div>
              <div class="mt-1 font-mono text-lg font-bold tabular-nums text-ink">
                {{ amount }}
              </div>
              <div class="text-slate2">{{ planKey | transloco }}</div>
            </div>
          </div>

          <button
            type="button"
            (click)="sendToKsef()"
            [disabled]="sent"
            class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-default"
            [class]="
              sent
                ? 'border border-beige bg-cream text-slate2/60'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            "
          >
            <mat-icon class="!h-4 !w-4 !text-base">{{ sent ? 'check' : 'send' }}</mat-icon>
            {{
              (sent ? 'demo.sims.fakturownia.sentDone' : 'demo.sims.fakturownia.sendKsef')
                | transloco
            }}
          </button>
        </div>
      </div>
    </app-world-sim-shell>
  `,
})
export class FakturowniaSimComponent {
  private readonly director = inject(SandboxDirectorService);

  /** Story state written by the upgrade beat's fixture (SSR-safe read). */
  private readonly enterprise =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEMO_PLAN_KEY) === 'ENTERPRISE';

  readonly invoiceNo = this.enterprise ? 'FV 2026/09/0043' : 'FV 2026/06/0042';
  readonly amount = this.enterprise ? '99,00 zł' : '29,00 zł';
  readonly planKey = this.enterprise
    ? 'demo.sims.fakturownia.planEnterprise'
    : 'demo.sims.fakturownia.plan';

  sent = false;

  sendToKsef(): void {
    if (this.sent) {
      return;
    }
    this.sent = true;
    const step = this.director.step();
    // Brief beat so the status flip is visible before the next step takes over.
    setTimeout(() => {
      if (step) {
        this.director.notify(step.id);
      }
    }, 650);
  }
}
