import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { WorldSimShellComponent } from './world-sim-shell.component';
import { DEMO_PLAN_KEY } from '../../../core/demo/demo-fixtures';
import { SandboxDirectorService } from '../../../core/demo/sandbox-director.service';

/**
 * KSeF simulator — the national e-invoice registry view: formal, government
 * chrome (white-red accent bar), the invoice accepted with its KSeF number.
 * The closing beat of the NIP→KSeF scenario; "done" reports to the director.
 * References the same invoice the Fakturownia sim showed — plan-aware via
 * DEMO_PLAN_KEY, so the registry entry matches the upgrade the user just made.
 *
 * Editorial restyle: the white-red gov bar stays (it IS the skeuomorphism),
 * the ledger rows go cream + beige, the closing button is the navy-900 dark
 * of official machinery — deliberately not the app's coral.
 */
@Component({
  selector: 'app-ksef-sim',
  imports: [MatIconModule, TranslocoPipe, WorldSimShellComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-world-sim-shell [caption]="'demo.sims.ksef.caption' | transloco">
      <div
        class="w-[28rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <!-- gov chrome -->
        <div class="border-b border-beige">
          <div class="flex h-1.5">
            <span class="w-1/2 bg-white"></span>
            <span class="w-1/2 bg-red-600"></span>
          </div>
          <div class="flex items-center gap-2 px-4 py-2.5">
            <mat-icon class="!h-4 !w-4 !text-base text-ink/70">apartment</mat-icon>
            <span class="text-xs font-bold tracking-wide text-ink">
              {{ 'demo.sims.ksef.title' | transloco }}
            </span>
            <span class="ml-auto font-mono text-[10px] text-slate2/60">
              {{ 'demo.sims.ksef.env' | transloco }}
            </span>
          </div>
        </div>
        <div class="p-5">
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">check</mat-icon>
            </span>
            <div>
              <div class="text-sm font-bold text-ink">
                {{ 'demo.sims.ksef.accepted' | transloco }}
              </div>
              <div class="text-[11px] text-slate2">
                {{ 'demo.sims.ksef.acceptedSub' | transloco }}
              </div>
            </div>
          </div>
          <div class="mt-4 space-y-2 text-xs">
            <div
              class="flex items-center justify-between rounded-lg border border-beige bg-cream px-3 py-2"
            >
              <span class="text-slate2">{{ 'demo.sims.ksef.number' | transloco }}</span>
              <span class="font-mono font-semibold text-ink">{{ ksefNumber }}</span>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border border-beige bg-cream px-3 py-2"
            >
              <span class="text-slate2">{{ 'demo.sims.ksef.ref' | transloco }}</span>
              <span class="font-mono font-semibold text-ink">{{ invoiceRef }}</span>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border border-beige bg-cream px-3 py-2"
            >
              <span class="text-slate2">{{ 'demo.sims.ksef.status' | transloco }}</span>
              <span class="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
                {{ 'demo.sims.ksef.statusValue' | transloco }}
              </span>
            </div>
          </div>
          <button
            type="button"
            (click)="finish()"
            class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-navy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
          >
            {{ 'demo.sims.ksef.done' | transloco }}
            <mat-icon class="!h-4 !w-4 !text-base">arrow_forward</mat-icon>
          </button>
        </div>
      </div>
    </app-world-sim-shell>
  `,
})
export class KsefSimComponent {
  private readonly director = inject(SandboxDirectorService);

  /** Story state written by the upgrade beat's fixture (SSR-safe read). */
  private readonly enterprise =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEMO_PLAN_KEY) === 'ENTERPRISE';

  readonly invoiceRef = this.enterprise ? 'FV 2026/09/0043' : 'FV 2026/06/0042';
  readonly ksefNumber = this.enterprise
    ? '5260250995-20260902-0043B1-02'
    : '5260250995-20260611-0042AF-01';

  finish(): void {
    const step = this.director.step();
    if (step) {
      this.director.notify(step.id);
    }
  }
}
